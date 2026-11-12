import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { orgCounters } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Atomically increments a per-org counter and returns the new value. */
export async function nextNumber(tx: Tx, orgId: string, scope: string, startAt = 0) {
  const [row] = await tx
    .insert(orgCounters)
    .values({ orgId, scope, value: startAt + 1 })
    .onConflictDoUpdate({
      target: [orgCounters.orgId, orgCounters.scope],
      set: { value: sql`${orgCounters.value} + 1` },
    })
    .returning({ value: orgCounters.value });
  return row.value;
}

// Naming conventions (see spec): FDT-1042, FDC-ACME, FDP-WEB-2601, FDP-WEB-2601-CR2
export const ticketKey = (prefix: string, n: number) => `${prefix}T-${n}`;
export const clientKey = (prefix: string, code: string) => `${prefix}C-${code}`;
export const projectKey = (prefix: string, serviceLineCode: string, year2: number, n: number) =>
  `${prefix}P-${serviceLineCode}-${String(year2).padStart(2, "0")}${String(n).padStart(2, "0")}`;

/** Next ticket number. Starts at 1001 for a new org. */
export const nextTicketNumber = (tx: Tx, orgId: string) => nextNumber(tx, orgId, "ticket", 1000);
