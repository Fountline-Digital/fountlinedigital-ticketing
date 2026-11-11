// Website design catalog + picker, and logo batches + picker.
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { pk, timestamps, ts } from "./columns";
import { designStatus, logoBatchStatus } from "./enums";
import { orgId } from "./org";
import { users } from "./auth";
import { clients } from "./clients";
import { projects } from "./projects";
import { files } from "./files";

export const websiteCollections = pgTable(
  "website_collections",
  {
    id: pk(),
    orgId: orgId(),
    number: integer("number").notNull(), // Collection 01
    name: text("name").notNull(),
    publishedAt: ts("published_at"),
    ...timestamps(),
  },
  (t) => [unique("website_collections_org_number_uq").on(t.orgId, t.number)],
);

export const websiteDesigns = pgTable(
  "website_designs",
  {
    id: pk(),
    orgId: orgId(),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => websiteCollections.id, { onDelete: "restrict" }),
    number: integer("number").notNull(), // 04
    key: varchar("key", { length: 48 }).notNull(), // FDWD-01-04-Harbor
    name: text("name").notNull(), // Harbor
    description: text("description"),
    previewUrl: text("preview_url"),
    pages: jsonb("pages").$type<string[]>().notNull().default([]),
    styleOptions: jsonb("style_options")
      .$type<{ colorPalettes?: string[][]; fonts?: string[] }>()
      .notNull()
      .default({}),
    inStarterSet: boolean("in_starter_set").notNull().default(false), // Essentials
    inBusiness: boolean("in_business").notNull().default(true),
    status: designStatus("status").notNull().default("draft"),
    ...timestamps(),
  },
  (t) => [
    unique("website_designs_org_key_uq").on(t.orgId, t.key),
    unique("website_designs_collection_number_uq").on(t.collectionId, t.number),
  ],
);

export const websiteDesignImages = pgTable(
  "website_design_images",
  {
    designId: uuid("design_id")
      .notNull()
      .references(() => websiteDesigns.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.designId, t.fileId] })],
);

// The 3-5 designs offered to a specific client project.
export const projectDesignOffers = pgTable(
  "project_design_offers",
  {
    id: pk(),
    orgId: orgId(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    designId: uuid("design_id")
      .notNull()
      .references(() => websiteDesigns.id, { onDelete: "restrict" }),
    isFavorite: boolean("is_favorite").notNull().default(false),
    offeredByUserId: uuid("offered_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [unique("project_design_offers_uq").on(t.projectId, t.designId)],
);

// The client's final pick. Locked once submitted; changes use a revision round or change request.
export const websiteSelections = pgTable("website_selections", {
  id: pk(),
  orgId: orgId(),
  projectId: uuid("project_id")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  designId: uuid("design_id")
    .notNull()
    .references(() => websiteDesigns.id, { onDelete: "restrict" }),
  colors: jsonb("colors").$type<string[]>(),
  fonts: jsonb("fonts").$type<string[]>(),
  submittedAt: ts("submitted_at"),
  submittedByUserId: uuid("submitted_by_user_id").references(() => users.id, { onDelete: "set null" }),
  lockedAt: ts("locked_at"),
  ...timestamps(),
});

export const logoBatches = pgTable(
  "logo_batches",
  {
    id: pk(),
    orgId: orgId(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    number: integer("number").notNull(), // Batch 01, per client
    status: logoBatchStatus("status").notNull().default("draft"),
    publishedAt: ts("published_at"),
    clientComment: text("client_comment"),
    decidedAt: ts("decided_at"),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [unique("logo_batches_client_number_uq").on(t.clientId, t.number)],
);

export const logoConcepts = pgTable(
  "logo_concepts",
  {
    id: pk(),
    orgId: orgId(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => logoBatches.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    key: varchar("key", { length: 32 }).notNull(), // FDL-ACME-01-03
    name: text("name"),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "restrict" }),
    isFavorite: boolean("is_favorite").notNull().default(false),
    isChosen: boolean("is_chosen").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("logo_concepts_org_key_uq").on(t.orgId, t.key),
    unique("logo_concepts_batch_number_uq").on(t.batchId, t.number),
  ],
);
