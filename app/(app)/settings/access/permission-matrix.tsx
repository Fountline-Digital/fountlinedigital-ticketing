"use client";
import { useTransition } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import type { Permission, Role } from "@/lib/permissions";
import { setRolePermission } from "../actions";

type Row = { permission: Permission; label: string; locked: boolean; roles: { role: Role; allowed: boolean; changed: boolean }[] };
const LABEL: Record<string, string> = { manager: "Manager", worker: "Worker", contractor: "Contractor" };

export function PermissionMatrix({ rows }: { rows: Row[] }) {
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>What each role can do</CardTitle>
        <CardDescription>
          Admins can always do everything; clients only use the portal. <Lock className="inline size-3" /> Security minimums can&apos;t be changed. Changes save right away; a dot marks a change from the default.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Permission</th>
              {rows[0]?.roles.map((r) => (
                <th key={r.role} className="w-24 py-2 text-center font-medium">
                  {LABEL[r.role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.permission} className="border-b last:border-0">
                <td className="py-2 pr-4">
                  {row.label}
                  {row.locked && <Lock className="ml-1 inline size-3 text-muted-foreground" aria-label="Locked" />}
                </td>
                {row.roles.map((r) => (
                  <td key={r.role} className="py-2 text-center">
                    <span className="relative inline-flex">
                      <Checkbox
                        aria-label={`${LABEL[r.role]}: ${row.label}`}
                        checked={r.allowed}
                        disabled={row.locked || pending}
                        onCheckedChange={(c) =>
                          start(async () => {
                            const res = await setRolePermission(r.role, row.permission, Boolean(c));
                            if (res.error) toast.error(res.error);
                            else toast.success(`${LABEL[r.role]}: ${row.label} ${c ? "on" : "off"}.`);
                          })
                        }
                      />
                      {r.changed && <span className="absolute -top-1 -right-2 size-1.5 rounded-full bg-primary" aria-label="Changed from default" />}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
