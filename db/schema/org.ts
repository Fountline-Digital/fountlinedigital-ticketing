// Organizations (tenants). Kept free of imports from other schema files so the
// `orgId()` helper is always ready when other tables are defined.
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { jsonb, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { pk, timestamps } from "./columns";

// Everything admins can change that doesn't need its own table.
// Defaults are applied in app code when a key is missing.
export type OrgSettings = {
  allowedGoogleDomains?: string[]; // e.g. ["fountlinedigital.com"]
  sessionMinutesByRole?: Partial<Record<"admin" | "manager" | "worker" | "contractor" | "client", number>>;
  contractorDefaultAccessDays?: number;
  inviteExpiryHours?: number;
  trashRetentionDays?: number; // default 30
  auditHotDays?: number; // default 90, older entries archived to R2
  archiveClosedProjectsAfterMonths?: number;
  maxUploadMb?: number;
  allowedFileTypes?: string[];
  defaultWebsiteDesignsOffered?: number; // default 3-5 per client
  portal?: {
    showDueDates?: boolean;
    showAssigneeNames?: boolean;
    showEstimates?: boolean;
    welcomeMessage?: string;
    bannerMessage?: string;
    supportEmail?: string;
    supportPhone?: string;
    approvalWording?: string;
  };
  notifications?: {
    senderName?: string;
    replyTo?: string;
    digestTime?: string; // "08:00" in org time zone
  };
};

export const organizations = pgTable("organizations", {
  id: pk(),
  name: text("name").notNull(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  keyPrefix: varchar("key_prefix", { length: 6 }).notNull(), // "FD"
  timezone: varchar("timezone", { length: 64 }).notNull().default("America/New_York"),
  logoFileId: uuid("logo_file_id"),
  brandColors: jsonb("brand_colors").$type<{ primary?: string; accent?: string }>(),
  settings: jsonb("settings").$type<OrgSettings>().notNull().default({}),
  ...timestamps(),
});

// Use on every tenant-owned table.
export const orgId = () =>
  uuid("org_id")
    .notNull()
    .references((): AnyPgColumn => organizations.id, { onDelete: "cascade" });
