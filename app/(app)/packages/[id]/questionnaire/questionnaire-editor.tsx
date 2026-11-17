"use client";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveQuestionnaire, type QuestionInput } from "./actions";

const KINDS: { value: QuestionInput["kind"]; label: string }[] = [
  { value: "short_text", label: "Short answer" },
  { value: "long_text", label: "Paragraph" },
  { value: "single_select", label: "Pick one" },
  { value: "multi_select", label: "Pick several" },
  { value: "file", label: "File upload" },
  { value: "url", label: "Web address" },
  { value: "date", label: "Date" },
];
const hasOptions = (k: string) => k === "single_select" || k === "multi_select";
type Q = QuestionInput & { _key: string };
let seq = 0;
const withKey = (q: QuestionInput): Q => ({ ...q, _key: q.id ?? `new-${++seq}` });

export function QuestionnaireEditor({
  packageId,
  exists,
  responses,
  initial,
}: {
  packageId: string;
  exists: boolean;
  responses: number;
  initial: { name: string; isActive: boolean; questions: QuestionInput[] };
}) {
  const [name, setName] = useState(initial.name);
  const [isActive, setActive] = useState(initial.isActive);
  const [questions, setQuestions] = useState<Q[]>(initial.questions.map(withKey));
  const [pending, start] = useTransition();
  const update = (i: number, patch: Partial<Q>) => setQuestions((s) => s.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: -1 | 1) =>
    setQuestions((s) => {
      const n = [...s];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Intake questionnaire</CardTitle>
          <CardDescription>
            Clients on projects from this package fill it in from the portal. Changes apply right away.
            {responses > 0 && ` ${responses} project${responses === 1 ? " has" : "s have"} answers: removing a question hides its answers.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="qn-name">Name</Label>
            <Input id="qn-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <Checkbox checked={isActive} onCheckedChange={(c) => setActive(Boolean(c))} /> Clients see it
          </label>
        </CardContent>
      </Card>

      {questions.map((q, i) => (
        <Card key={q._key}>
          <CardHeader>
            <CardTitle className="text-sm">Question {i + 1}</CardTitle>
            <CardAction className="flex">
              <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label="Move down" disabled={i === questions.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown />
              </Button>
              <Button size="icon-sm" variant="ghost" className="text-destructive hover:text-destructive" aria-label={`Delete question ${i + 1}`} onClick={() => setQuestions((s) => s.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-[1fr_12rem]">
            <div className="grid gap-1.5">
              <Label htmlFor={`q-${q._key}-label`}>Question</Label>
              <Input id={`q-${q._key}-label`} value={q.label} onChange={(e) => update(i, { label: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`q-${q._key}-kind`}>Answer type</Label>
              <select id={`q-${q._key}-kind`} value={q.kind} onChange={(e) => update(i, { kind: e.target.value as Q["kind"] })} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            {hasOptions(q.kind) && (
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor={`q-${q._key}-options`}>Options (one per line)</Label>
                <Textarea id={`q-${q._key}-options`} rows={4} value={q.options.join("\n")} onChange={(e) => update(i, { options: e.target.value.split("\n") })} />
              </div>
            )}
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor={`q-${q._key}-help`}>Help text (optional)</Label>
              <Input id={`q-${q._key}-help`} value={q.helpText} onChange={(e) => update(i, { helpText: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={q.isRequired} onCheckedChange={(c) => update(i, { isRequired: Boolean(c) })} /> Required
            </label>
          </CardContent>
        </Card>
      ))}

      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="outline" onClick={() => setQuestions((s) => [...s, withKey({ label: "", kind: "short_text", options: [], isRequired: false, helpText: "" })])}>
          <Plus /> Add question
        </Button>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveQuestionnaire(packageId, { name, isActive, questions: questions.map(({ _key, ...q }) => q) });
              if (r.error) toast.error(r.error);
              else toast.success(r.ok);
            })
          }
        >
          {exists ? "Save questionnaire" : "Create questionnaire"}
        </Button>
      </div>
    </div>
  );
}
