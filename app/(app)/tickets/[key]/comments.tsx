"use client";
import { useState } from "react";
import { AtSign, Eye, Lock, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { addComment, deleteComment } from "../actions";
import { useTicketAction } from "./use-ticket-action";

type CommentData = {
  id: string;
  authorId: string | null;
  author: string;
  body: string;
  visibility: "internal" | "client";
  when: string;
};

export function Comments({
  ticketId,
  ticketClientVisible,
  currentUserId,
  canModerate,
  mentionable,
  comments,
}: {
  ticketId: string;
  ticketClientVisible: boolean;
  currentUserId: string;
  canModerate: boolean;
  mentionable: { userId: string; name: string }[];
  comments: CommentData[];
}) {
  const { pending, run } = useTicketAction();
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"internal" | "client">("internal");
  const [mentioned, setMentioned] = useState<{ userId: string; name: string }[]>([]);
  const [mentionPick, setMentionPick] = useState("");
  const mentionItems = mentionable.map((m) => ({ value: m.userId, label: m.name }));

  function addMention(userId: string) {
    const person = mentionable.find((m) => m.userId === userId);
    if (!person) return;
    setBody((b) => `${b}${b && !b.endsWith(" ") ? " " : ""}@${person.name} `);
    setMentioned((list) => (list.some((m) => m.userId === userId) ? list : [...list, person]));
    setMentionPick("");
  }

  function submit() {
    // Only notify people whose @Name is still in the text
    const ids = mentioned.filter((m) => body.includes(`@${m.name}`)).map((m) => m.userId);
    run(() => addComment(ticketId, body, visibility, ids), (r) => {
      if (!r.error) {
        setBody("");
        setMentioned([]);
        setVisibility("internal");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comments</CardTitle>
        <CardDescription>Internal by default. Client-visible comments show in the client&apos;s portal.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
        <ol className="space-y-3">
          {comments.map((c) => (
            <li
              key={c.id}
              className={cn("rounded-lg border p-3", c.visibility === "client" ? "border-primary/60" : "border-border")}
            >
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{c.author}</span>
                <span>{c.when}</span>
                {c.visibility === "client" ? (
                  <Badge>
                    <Eye />
                    Client can see
                  </Badge>
                ) : (
                  <Badge variant="outline">
                    <Lock />
                    Internal
                  </Badge>
                )}
                {(c.authorId === currentUserId || canModerate) && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="ml-auto"
                    aria-label="Delete comment"
                    disabled={pending}
                    onClick={() => run(() => deleteComment(c.id))}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
              <p className="text-sm whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ol>

        <div className="space-y-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder={visibility === "client" ? "Write a reply the client will see..." : "Write an internal note..."}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && body.trim()) submit();
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border" role="group" aria-label="Who can see this comment">
              <button
                type="button"
                onClick={() => setVisibility("internal")}
                className={cn("flex items-center gap-1 px-3 py-1.5 text-xs", visibility === "internal" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
              >
                <Lock className="size-3" />
                Internal
              </button>
              <button
                type="button"
                disabled={!ticketClientVisible}
                title={ticketClientVisible ? undefined : "Make the ticket client-visible first"}
                onClick={() => setVisibility("client")}
                className={cn(
                  "flex items-center gap-1 px-3 py-1.5 text-xs disabled:opacity-40",
                  visibility === "client" ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                <Eye className="size-3" />
                Client can see
              </button>
            </div>
            {mentionItems.length > 0 && (
              <Select items={mentionItems} value={mentionPick} onValueChange={(v) => v && addMention(String(v))}>
                <SelectTrigger size="sm" className="w-40">
                  <AtSign />
                  <SelectValue placeholder="Mention" />
                </SelectTrigger>
                <SelectContent>
                  {mentionItems.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button className="ml-auto" size="sm" disabled={pending || !body.trim()} onClick={submit}>
              Post comment
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
