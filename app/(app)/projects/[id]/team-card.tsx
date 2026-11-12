"use client";
import { useState, useTransition } from "react";
import { UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addProjectMember, removeProjectMember, type Result } from "../actions";

export function TeamCard({
  projectId,
  canManage,
  members,
  addable,
}: {
  projectId: string;
  canManage: boolean;
  members: { id: string; label: string; role: string }[];
  addable: { value: string; label: string }[];
  timezone: string;
}) {
  const [pending, start] = useTransition();
  const [pick, setPick] = useState("");
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      if (r.ok) toast.success(r.ok);
      after?.();
    });

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>Team</CardTitle>
        <CardDescription>Workers and contractors only see projects they&apos;re on.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate">{m.label}</span>
                <span className="text-xs text-muted-foreground">{m.role}</span>
              </span>
              {canManage && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${m.label}`}
                  disabled={pending}
                  onClick={() => run(() => removeProjectMember(projectId, m.id))}
                >
                  <X />
                </Button>
              )}
            </li>
          ))}
          {members.length === 0 && <li className="text-sm text-muted-foreground">Nobody yet.</li>}
        </ul>
        {canManage && addable.length > 0 && (
          <div className="flex gap-2">
            <Select items={addable} value={pick} onValueChange={(v) => setPick(String(v ?? ""))}>
              <SelectTrigger className="w-full min-w-0" size="sm">
                <SelectValue placeholder="Add someone" />
              </SelectTrigger>
              <SelectContent>
                {addable.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="icon-sm"
              aria-label="Add to project"
              disabled={!pick || pending}
              onClick={() => run(() => addProjectMember(projectId, pick), () => setPick(""))}
            >
              <UserPlus />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
