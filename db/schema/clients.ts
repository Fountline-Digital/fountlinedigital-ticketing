// Clients (the businesses you work for) and their contacts.
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { boolean, pgTable, text, unique, uuid, varchar, index } from "drizzle-orm/pg-core";
import { pk, softDelete, timestamps } from "./columns";
import { clientStatus } from "./enums";
import { orgId } from "./org";
import { users } from "./auth";
import { tickets } from "./tickets";

export const clients = pgTable(
  "clients",
  {
    id: pk(),
    orgId: orgId(),
    code: varchar("code", { length: 6 }).notNull(), // ACME
    key: varchar("key", { length: 16 }).notNull(), // FDC-ACME
    name: text("name").notNull(),
    website: text("website"),
    phone: text("phone"),
    status: clientStatus("status").notNull().default("active"),
    notes: text("notes"), // internal only
    convertedFromTicketId: uuid("converted_from_ticket_id").references((): AnyPgColumn => tickets.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    unique("clients_org_code_uq").on(t.orgId, t.code),
    unique("clients_org_key_uq").on(t.orgId, t.key),
  ],
);

// Only Primary and Approver contacts can approve phase gates and change requests.
export const clientContacts = pgTable(
  "client_contacts",
  {
    id: pk(),
    orgId: orgId(),
    clientId: uuid("client_id")
      .notNull()
      .references((): AnyPgColumn => clients.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }), // set once they have a portal login
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    isPrimary: boolean("is_primary").notNull().default(false),
    isApprover: boolean("is_approver").notNull().default(false),
    isBilling: boolean("is_billing").notNull().default(false),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index("client_contacts_client_idx").on(t.clientId)],
);
