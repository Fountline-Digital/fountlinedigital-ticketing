// Auth.js (NextAuth v5) tables, shaped for @auth/drizzle-adapter.
// Property names must stay as Auth.js expects; DB columns are snake_case.
// Database sessions (not JWT) so admins can revoke sessions instantly.
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { boolean, integer, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { pk, timestamps, ts } from "./columns";

export const users = pgTable("users", {
  id: pk(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: ts("email_verified").$type<Date>(),
  image: text("image"),
  isActive: boolean("is_active").notNull().default(true),
  lastSeenAt: ts("last_seen_at"),
  ...timestamps(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
  expires: ts("expires").notNull(),
  // Extra columns for inactivity timeouts, "revoke all sessions" and the audit log.
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  lastActiveAt: ts("last_active_at").notNull().defaultNow(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

// Magic-link tokens (contractors and clients).
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: ts("expires").notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// Two-factor (TOTP) for roles that require it. Secret is encrypted in app code
// before storage; recovery codes are stored hashed.
export const userMfa = pgTable("user_mfa", {
  userId: uuid("user_id")
    .primaryKey()
    .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
  totpSecretEncrypted: text("totp_secret_encrypted").notNull(),
  recoveryCodesHashed: jsonb("recovery_codes_hashed").$type<string[]>().notNull().default([]),
  enabledAt: ts("enabled_at"),
  lastUsedAt: ts("last_used_at"),
  ...timestamps(),
});
