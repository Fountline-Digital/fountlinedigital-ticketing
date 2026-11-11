"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveDetails, saveVersionSettings, type FormState } from "../actions";

function useToastState(state: FormState) {
  const handled = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!state.at || handled.current === state.at) return;
    handled.current = state.at;
    if (state.ok) toast.success(state.ok);
    if (state.error) toast.error(state.error);
  }, [state.at, state.ok, state.error]);
}

function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function DetailsForm({ packageId, name, description, price }: { packageId: string; name: string; description: string; price: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveDetails, {});
  useToastState(state);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="packageId" value={packageId} />
      <Field label="Name" htmlFor="name">
        <Input id="name" name="name" defaultValue={name} required />
      </Field>
      <Field label="Description" htmlFor="description" hint="Shown to clients in their portal.">
        <Textarea id="description" name="description" defaultValue={description} rows={3} />
      </Field>
      <Field label="Price (USD)" htmlFor="price" hint="Leave empty if it's quoted per client.">
        <Input id="price" name="price" type="number" min="0" step="0.01" defaultValue={price} className="max-w-48" />
      </Field>
      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Save details
        </Button>
      </div>
    </form>
  );
}

const PICKER = [
  { value: "none", label: "None (custom design)" },
  { value: "starter", label: "Starter set" },
  { value: "full", label: "Full catalog + customization" },
];

export function VersionSettingsForm(props: {
  packageId: string;
  revisionRounds: number;
  responseHours: string;
  pickerAccess: string;
  websiteDesignsOffered: string;
  logoConceptsPerBatch: string;
  closeoutChecklist: string;
  isWeb: boolean;
  isBranding: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveVersionSettings, {});
  const [picker, setPicker] = useState(props.pickerAccess);
  useToastState(state);

  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="packageId" value={props.packageId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Revision rounds" htmlFor="revisionRounds" hint="Default per phase. Phases can override it in the template.">
          <Input id="revisionRounds" name="revisionRounds" type="number" min="0" max="20" defaultValue={props.revisionRounds} required />
        </Field>
        <Field label="Support response target (hours)" htmlFor="responseHours" hint="Business hours. Leave empty for none.">
          <Input id="responseHours" name="responseHours" type="number" min="0.5" step="0.5" defaultValue={props.responseHours} />
        </Field>
      </div>

      {props.isWeb && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Website picker">
            <Select items={PICKER} name="pickerAccess" value={picker} onValueChange={(v) => setPicker(String(v ?? "none"))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PICKER.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {picker !== "none" && (
            <Field label="Designs offered to the client" htmlFor="websiteDesignsOffered" hint="Usually 3-5.">
              <Input id="websiteDesignsOffered" name="websiteDesignsOffered" type="number" min="1" max="20" defaultValue={props.websiteDesignsOffered} />
            </Field>
          )}
        </div>
      )}
      {!props.isWeb && <input type="hidden" name="pickerAccess" value="none" />}

      {props.isBranding ? (
        <Field label="Logo concepts per batch" htmlFor="logoConceptsPerBatch">
          <Input id="logoConceptsPerBatch" name="logoConceptsPerBatch" type="number" min="1" max="20" defaultValue={props.logoConceptsPerBatch} className="max-w-48" />
        </Field>
      ) : (
        <input type="hidden" name="logoConceptsPerBatch" value={props.logoConceptsPerBatch} />
      )}

      <Field label="Closeout checklist" htmlFor="closeoutChecklist" hint="One item per line. Copied into every project at handoff.">
        <Textarea id="closeoutChecklist" name="closeoutChecklist" defaultValue={props.closeoutChecklist} rows={6} />
      </Field>

      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Save to draft
        </Button>
      </div>
    </form>
  );
}
