"use client";
import { useActionState, useState, useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useFormToast } from "@/hooks/use-form-toast";
import { addHoliday, removeHoliday } from "../actions";

export function DayRow({ day, name, open: initialOpen, opens, closes }: { day: number; name: string; open: boolean; opens: string; closes: string }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <div className="grid grid-cols-[7rem_1fr] items-center gap-3 sm:grid-cols-[8rem_auto_1fr]">
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name={`open-${day}`} checked={open} onCheckedChange={(c) => setOpen(Boolean(c))} />
        {name}
      </label>
      {open ? (
        <div className="flex items-center gap-2 sm:col-span-2">
          <Input type="time" name={`opens-${day}`} defaultValue={opens} aria-label={`${name} opens`} className="w-32" />
          <span className="text-sm text-muted-foreground">to</span>
          <Input type="time" name={`closes-${day}`} defaultValue={closes} aria-label={`${name} closes`} className="w-32" />
        </div>
      ) : (
        <span className="text-sm text-muted-foreground sm:col-span-2">Closed</span>
      )}
    </div>
  );
}

export function Holidays({ upcoming, pastCount }: { upcoming: { id: string; date: string; name: string }[]; pastCount: number }) {
  const [state, action, pending] = useActionState(addHoliday, {});
  useFormToast(state);
  const [removing, start] = useTransition();
  const fmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Holidays</CardTitle>
        <CardDescription>Closed all day. {pastCount > 0 && `${pastCount} past holiday${pastCount === 1 ? "" : "s"} hidden.`}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {upcoming.length === 0 && <p className="text-sm text-muted-foreground">None coming up.</p>}
        <ul className="space-y-1.5">
          {upcoming.map((h) => (
            <li key={h.id} className="flex items-center gap-3 rounded-md border px-3 py-1.5 text-sm">
              <span className="w-40 text-muted-foreground">{fmt.format(new Date(`${h.date}T00:00:00Z`))}</span>
              <span className="flex-1">{h.name}</span>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Remove ${h.name}`}
                disabled={removing}
                onClick={() =>
                  start(async () => {
                    const r = await removeHoliday(h.id);
                    if (r.error) toast.error(r.error);
                  })
                }
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
        <form action={action} className="flex flex-wrap items-end gap-2" key={state.at}>
          <Input type="date" name="date" aria-label="Holiday date" required className="w-44" />
          <Input name="name" aria-label="Holiday name" placeholder="Independence Day" required className="min-w-40 flex-1" />
          <Button type="submit" variant="outline" disabled={pending}>
            Add
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
