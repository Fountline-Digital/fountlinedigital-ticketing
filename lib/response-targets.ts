import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { packageVersions, projects } from "@/db/schema";
import { addBusinessMinutes } from "@/lib/business-hours";

/**
 * Support tickets on a project whose package has a response target (e.g. a maintenance
 * plan) get a reply-by time in business hours.
 */
export async function responseDueFor(orgId: string, kind: string, projectId: string | null) {
  if (kind !== "support" || !projectId) return null;
  const [row] = await db
    .select({ minutes: packageVersions.responseTargetMinutes })
    .from(projects)
    .innerJoin(packageVersions, eq(packageVersions.id, projects.packageVersionId))
    .where(eq(projects.id, projectId));
  return row?.minutes ? addBusinessMinutes(orgId, new Date(), row.minutes) : null;
}
