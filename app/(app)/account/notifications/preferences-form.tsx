"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { savePreferences, type Prefs } from "./actions";

type Event = { key: string; label: string; description: string };

export function PreferencesForm({ events, initial, readOnly = false }: { events: Event[]; initial: Prefs; readOnly?: boolean }) {
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(prefs) !== JSON.stringify(initial);
  const set = (key: string, field: "inApp" | "email", value: boolean) => setPrefs((p) => ({ ...p, [key]: { ...p[key], [field]: value } }));

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-[1fr_4rem_4rem] items-center gap-2 border-b pb-2 text-xs font-medium text-muted-foreground">
          <span>Event</span>
          <span className="text-center">In app</span>
          <span className="text-center">Email</span>
        </div>
        {events.map((e) => (
          <div key={e.key} className="grid grid-cols-[1fr_4rem_4rem] items-center gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">{e.label}</p>
              <p className="text-xs text-muted-foreground">{e.description}</p>
            </div>
            <div className="flex justify-center">
              <Checkbox disabled={readOnly} aria-label={`${e.label} in app`} checked={prefs[e.key]?.inApp} onCheckedChange={(c) => set(e.key, "inApp", Boolean(c))} />
            </div>
            <div className="flex justify-center">
              <Checkbox disabled={readOnly} aria-label={`${e.label} by email`} checked={prefs[e.key]?.email} onCheckedChange={(c) => set(e.key, "email", Boolean(c))} />
            </div>
          </div>
        ))}
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="ghost" disabled={!dirty || pending} onClick={() => setPrefs(initial)}>
            Reset
          </Button>
          <Button
            disabled={readOnly || !dirty || pending}
            onClick={() =>
              start(async () => {
                const r = await savePreferences(prefs);
                if (r.error) toast.error(r.error);
                else toast.success(r.ok);
              })
            }
          >
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
