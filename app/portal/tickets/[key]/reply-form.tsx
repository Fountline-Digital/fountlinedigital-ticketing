"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { replyToTicket } from "../../actions";

export function ReplyForm({ ticketId, readOnly, closed }: { ticketId: string; readOnly: boolean; closed: boolean }) {
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-2 border-t pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await replyToTicket(ticketId, body);
          if (r.error) toast.error(r.error);
          else {
            toast.success(r.ok);
            setBody("");
          }
        });
      }}
    >
      <Label htmlFor="reply">{closed ? "Reply (this request is closed; replying lets us know you need more)" : "Reply"}</Label>
      <Textarea id="reply" rows={4} value={body} onChange={(e) => setBody(e.target.value)} disabled={readOnly} maxLength={10000} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || readOnly || !body.trim()}>
          Send
        </Button>
      </div>
    </form>
  );
}
