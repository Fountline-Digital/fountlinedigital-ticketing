"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { SignOutButton } from "@/components/sign-out-button";
import { acceptTerms } from "../actions";

type Doc = { id: string; title: string; version: number; date: string; body: string };

export function TermsForm({ docs }: { docs: Doc[] }) {
  const [agreed, setAgreed] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-6">
      {docs.map((d) => (
        <Card key={d.id}>
          <CardHeader>
            <CardTitle>{d.title}</CardTitle>
            <CardDescription>
              Version {d.version}
              {d.date && ` · ${d.date}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-80 overflow-y-auto rounded-md border p-4 text-sm whitespace-pre-wrap" tabIndex={0} aria-label={`${d.title} text`}>
              {d.body}
            </div>
          </CardContent>
        </Card>
      ))}
      <label className="flex items-start gap-3 text-sm">
        <Checkbox className="mt-0.5" checked={agreed} onCheckedChange={(c) => setAgreed(Boolean(c))} />
        <span>I&apos;ve read and accept the {docs.map((d) => d.title.toLowerCase()).join(" and ")}.</span>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!agreed || pending}
          onClick={() =>
            start(async () => {
              const r = await acceptTerms(docs.map((d) => d.id));
              if (r?.error) toast.error(r.error);
            })
          }
        >
          Accept and continue
        </Button>
        <SignOutButton>Not now, sign out</SignOutButton>
      </div>
    </div>
  );
}
