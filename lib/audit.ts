import "server-only";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

type AuditEntry = typeof auditLog.$inferInsert;

// Writes one audit log entry. Never throws: a logging failure must not block the user,
// but it is reported to the server logs (and to Sentry once that's set up).
export async function audit(entry: AuditEntry) {
  try {
    await db.insert(auditLog).values(entry);
  } catch (err) {
    console.error("[audit] failed to write entry", entry.action, err);
  }
}
