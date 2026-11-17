import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { clients, files, logoBatches, logoConcepts, packageVersions, projects } from "@/db/schema";

/** FDL-ACME-01-03 */
export const conceptKey = (prefix: string, clientCode: string, batch: number, concept: number) =>
  `${prefix}L-${clientCode}-${String(batch).padStart(2, "0")}-${String(concept).padStart(2, "0")}`;

export const isOpenBatch = (status: string) => status === "draft" || status === "published";

/** Logo work is on when the package has concepts per batch, or a batch was already started. */
export async function logoSettings(projectId: string) {
  const [row] = await db
    .select({ perBatch: packageVersions.logoConceptsPerBatch, clientId: projects.clientId, clientCode: clients.code })
    .from(projects)
    .innerJoin(packageVersions, eq(packageVersions.id, projects.packageVersionId))
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(eq(projects.id, projectId));
  if (!row) return null;
  return { perBatch: row.perBatch, clientId: row.clientId, clientCode: row.clientCode };
}

/** Batches for a project, newest first, each with its concepts (in order) and their files. */
export async function projectBatches(projectId: string) {
  const batches = await db.select().from(logoBatches).where(eq(logoBatches.projectId, projectId)).orderBy(desc(logoBatches.number));
  if (batches.length === 0) return [];
  const concepts = await db
    .select({ c: logoConcepts, fileName: files.originalName, mimeType: files.mimeType })
    .from(logoConcepts)
    .innerJoin(files, eq(files.id, logoConcepts.fileId))
    .where(inArray(logoConcepts.batchId, batches.map((b) => b.id)))
    .orderBy(asc(logoConcepts.number));
  return batches.map((b) => ({ batch: b, concepts: concepts.filter((x) => x.c.batchId === b.id) }));
}

export async function batchInOrg(orgId: string, batchId: string) {
  const [b] = await db.select().from(logoBatches).where(and(eq(logoBatches.id, batchId), eq(logoBatches.orgId, orgId)));
  return b ?? null;
}
