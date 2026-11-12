"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { clientContacts, clients, organizations } from "@/db/schema";
import { audit } from "@/lib/audit";
import { createInvite } from "@/lib/invites";
import { clientKey } from "@/lib/keys";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/lib/session";

export type FormState = { ok?: string; error?: string; at?: number };
export type Result = { ok?: string; error?: string };

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const checked = (v: FormDataEntryValue | null) => v !== null && v !== "false" && v !== "off" && v !== "";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const failed = (error: string): FormState => ({ error, at: Date.now() });

async function clientInOrg(orgId: string, clientId: string) {
  const [c] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.orgId, orgId), isNull(clients.deletedAt)));
  return c ?? null;
}

async function contactInOrg(orgId: string, contactId: string) {
  const [c] = await db
    .select()
    .from(clientContacts)
    .where(and(eq(clientContacts.id, contactId), eq(clientContacts.orgId, orgId), isNull(clientContacts.deletedAt)));
  return c ?? null;
}

export async function createClient(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePermission("clients.manage");
  const name = str(formData.get("name"));
  const code = str(formData.get("code")).toUpperCase();
  const contactName = str(formData.get("contactName"));
  const contactEmail = str(formData.get("contactEmail")).toLowerCase();

  if (!name) return failed("Enter the client's name.");
  if (!/^[A-Z0-9]{2,6}$/.test(code)) return failed("The code must be 2-6 letters or numbers, like ACME.");
  if (contactEmail && !EMAIL.test(contactEmail)) return failed("Enter a valid contact email.");

  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
  const [taken] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.orgId, ctx.orgId), eq(clients.code, code)));
  if (taken) return failed(`The code ${code} is already used. Try another.`);

  const id = await db.transaction(async (tx) => {
    const [client] = await tx
      .insert(clients)
      .values({
        orgId: ctx.orgId,
        code,
        key: clientKey(org.keyPrefix, code),
        name,
        website: str(formData.get("website")) || null,
        phone: str(formData.get("phone")) || null,
      })
      .returning();
    if (contactEmail) {
      await tx.insert(clientContacts).values({
        orgId: ctx.orgId,
        clientId: client.id,
        name: contactName || contactEmail,
        email: contactEmail,
        isPrimary: true,
        isApprover: true,
      });
    }
    return client.id;
  });

  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "client.create", entityType: "client", entityId: id, entityKey: clientKey(org.keyPrefix, code) });
  revalidatePath("/clients");
  redirect(`/clients/${id}`);
}

export async function updateClient(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePermission("clients.manage");
  const client = await clientInOrg(ctx.orgId, str(formData.get("clientId")));
  if (!client) return failed("Client not found.");
  const name = str(formData.get("name"));
  if (!name) return failed("Enter the client's name.");
  const status = str(formData.get("status")) === "archived" ? "archived" : "active";

  const after = {
    name,
    website: str(formData.get("website")) || null,
    phone: str(formData.get("phone")) || null,
    notes: str(formData.get("notes")) || null,
    status: status as "active" | "archived",
  };
  await db.update(clients).set(after).where(eq(clients.id, client.id));
  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    action: "client.update",
    entityType: "client",
    entityId: client.id,
    entityKey: client.key,
    changes: { before: { name: client.name, website: client.website, phone: client.phone, notes: client.notes, status: client.status }, after },
  });
  revalidatePath(`/clients/${client.id}`);
  revalidatePath("/clients");
  return { ok: "Client saved.", at: Date.now() };
}

export async function saveContact(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePermission("clients.manage");
  const client = await clientInOrg(ctx.orgId, str(formData.get("clientId")));
  if (!client) return failed("Client not found.");

  const contactId = str(formData.get("contactId"));
  const name = str(formData.get("name"));
  const email = str(formData.get("email")).toLowerCase();
  if (!name) return failed("Enter the contact's name.");
  if (!EMAIL.test(email)) return failed("Enter a valid email.");

  const values = {
    name,
    email,
    phone: str(formData.get("phone")) || null,
    isPrimary: checked(formData.get("isPrimary")),
    isApprover: checked(formData.get("isApprover")),
    isBilling: checked(formData.get("isBilling")),
  };

  if (contactId) {
    const contact = await contactInOrg(ctx.orgId, contactId);
    if (!contact || contact.clientId !== client.id) return failed("Contact not found.");
    if (contact.userId && contact.email !== email) return failed("This contact already has a portal login, so the email can't change.");
    await db.update(clientContacts).set(values).where(eq(clientContacts.id, contact.id));
    await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "client.contact_update", entityType: "client_contact", entityId: contact.id, entityKey: client.key, changes: { before: { ...contact }, after: values } });
  } else {
    const [dupe] = await db
      .select({ id: clientContacts.id })
      .from(clientContacts)
      .where(and(eq(clientContacts.clientId, client.id), eq(clientContacts.email, email), isNull(clientContacts.deletedAt)));
    if (dupe) return failed(`${email} is already a contact for this client.`);
    const [created] = await db.insert(clientContacts).values({ orgId: ctx.orgId, clientId: client.id, ...values }).returning();
    await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "client.contact_add", entityType: "client_contact", entityId: created.id, entityKey: client.key, changes: { after: values } });
  }

  revalidatePath(`/clients/${client.id}`);
  return { ok: contactId ? "Contact saved." : "Contact added.", at: Date.now() };
}

export async function removeContact(contactId: string): Promise<Result> {
  const ctx = await requirePermission("clients.manage");
  const contact = await contactInOrg(ctx.orgId, contactId);
  if (!contact) return { error: "Contact not found." };
  await db.update(clientContacts).set({ deletedAt: new Date(), deletedBy: ctx.user.id }).where(eq(clientContacts.id, contact.id));
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "client.contact_remove", entityType: "client_contact", entityId: contact.id });
  revalidatePath(`/clients/${contact.clientId}`);
  return { ok: `Removed ${contact.name}. Their portal access, if any, is managed in Users & invites.` };
}

export async function inviteContact(contactId: string): Promise<Result> {
  const ctx = await requirePermission("clients.manage");
  if (!(await can(ctx.orgId, ctx.role, "users.invite"))) return { error: "You can't send invites." };
  const contact = await contactInOrg(ctx.orgId, contactId);
  if (!contact) return { error: "Contact not found." };
  if (contact.userId) return { error: `${contact.name} already has a portal login.` };

  const result = await createInvite(ctx, {
    email: contact.email,
    role: "client",
    clientId: contact.clientId,
    contact: { name: contact.name, isPrimary: contact.isPrimary, isApprover: contact.isApprover, isBilling: contact.isBilling },
  });
  revalidatePath(`/clients/${contact.clientId}`);
  return result;
}
