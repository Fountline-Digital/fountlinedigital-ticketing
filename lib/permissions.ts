import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { rolePermissions } from "@/db/schema";

export type Role = "admin" | "manager" | "worker" | "contractor" | "client";

// Default permissions per role. Admins can override most of these per org
// (role_permissions table, edited in admin settings later).
export const DEFAULT_PERMISSIONS = {
  "users.view": ["admin", "manager"],
  "users.invite": ["admin", "manager"],
  "users.manage": ["admin"], // change roles, deactivate, reset two-factor, sign out everywhere
  "settings.manage": ["admin"],
  "packages.manage": ["admin"],
  "clients.view": ["admin", "manager", "worker"],
  "clients.manage": ["admin", "manager"],
  "projects.view_all": ["admin", "manager"],
  "projects.manage": ["admin", "manager"],
  "tickets.view_all": ["admin", "manager"],
  "tickets.assign": ["admin", "manager"],
  "audit.view": ["admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof DEFAULT_PERMISSIONS;

// Security minimums: these can never be changed by an override.
const LOCKED: Permission[] = ["users.manage", "settings.manage", "audit.view"];

// Who each role may invite.
export const INVITABLE_ROLES: Record<Role, Role[]> = {
  admin: ["admin", "manager", "worker", "contractor", "client"],
  manager: ["worker", "contractor", "client"],
  worker: [],
  contractor: [],
  client: [],
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  manager: "Manager",
  worker: "Worker",
  contractor: "Contractor",
  client: "Client",
};

export async function can(orgId: string, role: Role, permission: Permission) {
  const allowedByDefault = (DEFAULT_PERMISSIONS[permission] as readonly Role[]).includes(role);
  if (LOCKED.includes(permission)) return allowedByDefault;

  const [override] = await db
    .select({ allowed: rolePermissions.allowed })
    .from(rolePermissions)
    .where(
      and(eq(rolePermissions.orgId, orgId), eq(rolePermissions.role, role), eq(rolePermissions.permission, permission)),
    )
    .limit(1);
  return override ? override.allowed : allowedByDefault;
}

export async function permissionsFor(orgId: string, role: Role) {
  const entries = await Promise.all(
    (Object.keys(DEFAULT_PERMISSIONS) as Permission[]).map(async (p) => [p, await can(orgId, role, p)] as const),
  );
  return Object.fromEntries(entries) as Record<Permission, boolean>;
}
