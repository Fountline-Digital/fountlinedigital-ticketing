"use client";
import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addLink, removeLink } from "../actions";
import { useTicketAction } from "./use-ticket-action";

type LinkData = { id: string; relation: string; key: string; title: string; status: string; done: boolean };

const KINDS = [
  { value: "blocked_by", label: "Waiting on" },
  { value: "blocks", label: "Blocks" },
  { value: "related", label: "Related to" },
  { value: "duplicate_of", label: "Duplicate of" },
];

export function LinksCard({ ticketId, links }: { ticketId: string; links: LinkData[] }) {
  const { pending, run } = useTicketAction();
  const [kind, setKind] = useState("blocked_by");
  const [key, setKey] = useState("");
  const groups = [...new Set(links.map((l) => l.relation))];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="size-4" />
          Linked tickets
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {links.length === 0 && <p className="text-sm text-muted-foreground">None.</p>}
        {groups.map((g) => (
          <div key={g} className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">{g}</p>
            {links
              .filter((l) => l.relation === g)
              .map((l) => (
                <div key={l.id} className="flex items-center gap-2 text-sm">
                  {l.done && <CheckCircle2 className="size-3.5 shrink-0 text-muted-foreground" aria-label="Done" />}
                  <Link href={`/tickets/${l.key}`} className="min-w-0 flex-1 truncate hover:underline">
                    <span className="mr-1 font-mono text-xs text-muted-foreground">{l.key}</span>
                    {l.title}
                  </Link>
                  <Button variant="ghost" size="icon-xs" aria-label={`Remove link to ${l.key}`} disabled={pending} onClick={() => run(() => removeLink(l.id, ticketId))}>
                    <X />
                  </Button>
                </div>
              ))}
          </div>
        ))}
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!key.trim()) return;
            run(() => addLink(ticketId, key, kind as "blocks" | "blocked_by" | "related" | "duplicate_of"), (r) => !r.error && setKey(""));
          }}
        >
          <Select items={KINDS} value={kind} onValueChange={(v) => setKind(String(v ?? "blocked_by"))}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => (
                <SelectItem key={k.value} value={k.value}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Ticket key, e.g. FDT-1042" className="font-mono uppercase" />
            <Button type="submit" variant="outline" disabled={pending || !key.trim()}>
              Link
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
