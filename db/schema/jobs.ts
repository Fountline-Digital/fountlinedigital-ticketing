// Remembers what the scheduled jobs already did, so reminders and escalations
// aren't sent twice. `mark` lets a job fire again when something changes
// (e.g. an escalation keyed on the due date fires again if the date moves).
import { pgTable, primaryKey, uuid, varchar } from "drizzle-orm/pg-core";
import { ts } from "./columns";
import { orgId } from "./org";

export const jobMarks = pgTable(
  "job_marks",
  {
    orgId: orgId(),
    job: varchar("job", { length: 48 }).notNull(), // "escalate_overdue"
    entityId: uuid("entity_id").notNull(),
    mark: varchar("mark", { length: 64 }).notNull().default(""),
    lastAt: ts("last_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.job, t.entityId] })],
);
