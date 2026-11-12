"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { addChecklistItem, deleteChecklistItem, toggleChecklistItem } from "../actions";
import { useTicketAction } from "./use-ticket-action";

type Item = { id: string; label: string; done: boolean; doneBy: string | null };

export function Checklist({ ticketId, items }: { ticketId: string; items: Item[] }) {
  const { pending, run } = useTicketAction();
  const [text, setText] = useState("");
  const done = items.filter((i) => i.done).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Checklist</CardTitle>
        <CardDescription>{items.length === 0 ? "No items yet." : `${done} of ${items.length} done`}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((i) => (
          <div key={i.id} className="group flex items-center gap-3">
            <Checkbox
              checked={i.done}
              disabled={pending}
              onCheckedChange={(c) => run(() => toggleChecklistItem(i.id, Boolean(c)), undefined, true)}
              aria-label={i.label}
            />
            <span className={`flex-1 text-sm ${i.done ? "text-muted-foreground line-through" : ""}`}>{i.label}</span>
            {i.done && i.doneBy && <span className="hidden text-xs text-muted-foreground sm:inline">{i.doneBy}</span>}
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove ${i.label}`}
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              onClick={() => run(() => deleteChecklistItem(i.id), undefined, true)}
            >
              <X />
            </Button>
          </div>
        ))}
        <form
          className="flex gap-2 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            run(() => addChecklistItem(ticketId, text), (r) => !r.error && setText(""), true);
          }}
        >
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add an item" />
          <Button type="submit" variant="outline" size="icon" aria-label="Add item" disabled={pending || !text.trim()}>
            <Plus />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
