"use client";
import { useState, useTransition } from "react";
import { Columns2, Heart, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { chooseConcept, requestNewBatch, setConceptFavorite } from "../../../logo-actions";

type Concept = { id: string; number: number; key: string; fileId: string; favorite: boolean };

export function LogoPicker({ batchId, concepts: initial, canDecide, readOnly }: { batchId: string; concepts: Concept[]; canDecide: boolean; readOnly: boolean }) {
  const [concepts, setConcepts] = useState(initial);
  const [compare, setCompare] = useState(false);
  const [dark, setDark] = useState(false); // logos often need checking on both backgrounds
  const [asking, setAsking] = useState(false);
  const [comment, setComment] = useState("");
  const [pending, start] = useTransition();
  const favorites = concepts.filter((c) => c.favorite);
  const shown = compare ? favorites : concepts;

  const toggle = (c: Concept) => {
    setConcepts((s) => s.map((x) => (x.id === c.id ? { ...x, favorite: !x.favorite } : x)));
    void setConceptFavorite(c.id, !c.favorite).then((r) => r.error && toast.error(r.error));
  };
  const run = (fn: () => Promise<{ ok?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else if (r.ok) toast.success(r.ok);
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={!compare ? "default" : "outline"} aria-pressed={!compare} onClick={() => setCompare(false)}>
          All concepts ({concepts.length})
        </Button>
        <Button size="sm" variant={compare ? "default" : "outline"} aria-pressed={compare} disabled={favorites.length < 2} onClick={() => setCompare(true)}>
          <Columns2 /> Compare favorites ({favorites.length})
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto" aria-pressed={dark} onClick={() => setDark((d) => !d)}>
          {dark ? <Sun /> : <Moon />} {dark ? "Light background" : "Dark background"}
        </Button>
      </div>

      <div className={cn("grid gap-4", compare ? "grid-cols-1 sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
        {shown.map((c) => (
          <Card key={c.id} className="overflow-hidden pt-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/files/${c.fileId}?view=1`} alt={`Concept ${c.number}`} className={cn("aspect-[4/3] w-full object-contain p-8", dark ? "bg-black" : "bg-white")} />
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                Concept {c.number}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-pressed={c.favorite}
                  aria-label={c.favorite ? `Remove concept ${c.number} from favorites` : `Add concept ${c.number} to favorites`}
                  disabled={readOnly}
                  onClick={() => toggle(c)}
                >
                  <Heart className={c.favorite ? "fill-current text-primary" : ""} />
                </Button>
              </CardTitle>
              <CardDescription className="font-mono text-xs">{c.key}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                size="sm"
                disabled={readOnly || pending || !canDecide}
                onClick={() => {
                  if (confirm(`Choose concept ${c.number} as your logo? You can tell us about small tweaks on the project afterwards.`)) run(() => chooseConcept(c.id, ""));
                }}
              >
                Choose this logo
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {!canDecide && <p className="text-sm text-muted-foreground">Only your company&apos;s approver can choose the logo or ask for a new batch. Your favorites are saved for them.</p>}

      {canDecide && (
        <Card>
          <CardHeader>
            <CardTitle>Not quite right?</CardTitle>
            <CardDescription>Ask for a new batch and tell us what to change. Each new batch uses one of your revision rounds.</CardDescription>
          </CardHeader>
          <CardContent>
            {asking ? (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => requestNewBatch(batchId, comment));
                }}
              >
                <div className="grid gap-1.5">
                  <Label htmlFor="batch-comment">What should we change?</Label>
                  <Textarea id="batch-comment" rows={4} value={comment} onChange={(e) => setComment(e.target.value)} required placeholder="e.g. I like the icon in concept 2 but the lettering of concept 3; try warmer colors." />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={pending || readOnly || !comment.trim()}>
                    Ask for a new batch
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setAsking(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <Button variant="outline" disabled={readOnly} onClick={() => setAsking(true)}>
                Ask for a new batch
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
