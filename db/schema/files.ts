// File metadata. The file itself lives in Cloudflare R2 at `storage_key`:
//   {org}/{client}/{project}/{ticket}/{yyyymmdd}-{original-name}
import { bigint, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { pk, softDelete, timestamps } from "./columns";
import { visibility } from "./enums";
import { orgId } from "./org";
import { users } from "./auth";
import { clients } from "./clients";
import { projects } from "./projects";
import { comments, tickets } from "./tickets";

export const files = pgTable(
  "files",
  {
    id: pk(),
    orgId: orgId(),
    storageKey: text("storage_key").notNull().unique(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    ticketId: uuid("ticket_id").references(() => tickets.id, { onDelete: "set null" }),
    commentId: uuid("comment_id").references(() => comments.id, { onDelete: "set null" }),
    visibility: visibility("visibility").notNull().default("internal"),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    index("files_project_idx").on(t.projectId),
    index("files_ticket_idx").on(t.ticketId),
  ],
);
