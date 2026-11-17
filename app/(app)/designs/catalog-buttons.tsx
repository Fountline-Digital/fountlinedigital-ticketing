"use client";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCollection, createDesign } from "./actions";

export function NewCollectionButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        confirm("Start a new numbered collection?") &&
        start(async () => {
          const r = await createCollection();
          if (r.error) toast.error(r.error);
          else toast.success(r.ok);
        })
      }
    >
      <Plus /> New collection
    </Button>
  );
}

export function NewDesignButton({ collectionId, collectionName }: { collectionId: string; collectionName: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus /> Add design
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New design in {collectionName}</DialogTitle>
            <DialogDescription>It starts as a draft. Add screenshots and details, then set it to Active.</DialogDescription>
          </DialogHeader>
          <form
            id="new-design"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await createDesign(collectionId, name);
                if (r?.error) toast.error(r.error);
              });
            }}
            className="grid gap-1.5"
          >
            <Label htmlFor="design-name">Name</Label>
            <Input id="design-name" value={name} maxLength={60} placeholder="Harbor" onChange={(e) => setName(e.target.value)} required />
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="new-design" disabled={pending}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
