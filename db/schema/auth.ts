// Better Auth tables (user, session, account, verification) plus our two-factor table.
// Property names must match Better Auth's field names; DB columns are snake_case.
// Wired up in lib/auth.ts via drizzleAdapter(..., { schema: { user, session, account, verification } }).
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { boolean, index, jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { pk, timestamps, ts } from "./columns";

export const users = pgTable("users", {
  id: pk(),
  name: text("name").notNull().default(""),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  // Ours: users are deactivated, never deleted.
  isActive: boolean("is_active").notNull().default(true),
  lastSeenAt: ts("last_seen_at"),
  ...timestamps(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: pk(),
    token: text("token").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    // Ours: set once the user passes two-factor in this session.
    mfaVerifiedAt: ts("mfa_verified_at"),
    ...timestamps(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: pk(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    ...timestamps(),
  },
  (t) => [unique("accounts_provider_account_uq").on(t.providerId, t.accountId)],
);

// Magic-link tokens and other one-time values.
export const verifications = pgTable(
  "verifications",
  {
    id: pk(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    ...timestamps(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

// Two-factor (authenticator app), required for every user.
// Secret is AES-256-GCM encrypted (lib/mfa.ts); recovery codes are stored hashed.
// enabled_at is null while setup is in progress.
export const userMfa = pgTable("user_mfa", {
  userId: uuid("user_id")
    .primaryKey()
    .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
  totpSecretEncrypted: text("totp_secret_encrypted").notNull(),
  recoveryCodesHashed: jsonb("recovery_codes_hashed").$type<string[]>().notNull().default([]),
  enabledAt: ts("enabled_at"),
  lastUsedAt: ts("last_used_at"), // blocks reusing the same code
  ...timestamps(),
});
