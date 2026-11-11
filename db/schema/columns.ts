// Shared column helpers. Every table uses these so naming stays consistent:
// `id` (UUID), `created_at`, `updated_at`, and `deleted_at` / `deleted_by` for Trash.
import { timestamp, uuid } from "drizzle-orm/pg-core";

export const ts = (name: string) => timestamp(name, { withTimezone: true });

export const pk = () => uuid("id").primaryKey().defaultRandom();

export const timestamps = () => ({
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Trash & restore: rows with deleted_at set are hidden and purged after the
// org's trash retention period (default 30 days).
export const softDelete = () => ({
  deletedAt: ts("deleted_at"),
  deletedBy: uuid("deleted_by"),
});
