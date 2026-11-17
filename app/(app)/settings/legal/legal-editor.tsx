"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { publishLegal } from "./actions";

export function LegalEditor(props: { kind: "terms" | "privacy"; title: string; version: number; published: string | null; body: string; accepted: number }) {
  const [body, setBody] = useState(props.body);
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
        <CardDescription>
          {props.version ? `Version ${props.version}, published ${props.published} · accepted by ${props.accepted} ${props.accepted === 1 ? "person" : "people"}` : "Not published yet. Clients aren't asked to accept anything until you publish."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea aria-label={`${props.title} text`} rows={14} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Paste the full text here." />
        <div className="flex justify-end">
          <Button
            disabled={pending || body.trim() === props.body.trim()}
            onClick={() =>
              confirm(`Publish as version ${props.version + 1}? Every client will be asked to accept it again.`) &&
              start(async () => {
                const r = await publishLegal(props.kind, body);
                if (r.error) toast.error(r.error);
                else toast.success(r.ok);
              })
            }
          >
            Publish version {props.version + 1}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
