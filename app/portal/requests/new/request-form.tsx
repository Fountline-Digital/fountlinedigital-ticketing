"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormFields } from "@/components/portal/form-fields";
import type { Answer, Field } from "@/lib/forms";
import { uploadFile } from "@/lib/upload-client";
import { submitRequest } from "../../request-actions";

export function RequestForm({
  formId,
  fields,
  projects,
  projectRequired,
  defaultProjectId,
  readOnly,
}: {
  formId: string;
  fields: Field[];
  projects: { id: string; name: string }[];
  projectRequired: boolean;
  defaultProjectId: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [values, setValues] = useState<Record<string, Answer>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [chosen, setChosen] = useState<Record<string, File[]>>({}); // uploaded after the request is created
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      setErrors({});
      const names = Object.fromEntries(Object.entries(chosen).map(([k, list]) => [k, list.map((f) => f.name)]));
      const r = await submitRequest(formId, projectId || null, values, names);
      if (r.error) {
        toast.error(r.error);
        setErrors({ ...(r.errors ?? {}), ...(!projectId && projectRequired ? { _project: "Choose a project." } : {}) });
        return;
      }
      // Files go on the new ticket, or the project for a change request
      const target = r.ticket ? { ticketId: r.ticket.id } : r.projectId ? { projectId: r.projectId } : null;
      const all = Object.values(chosen).flat();
      let failed = 0;
      if (target) {
        for (const [i, file] of all.entries()) {
          setStatus(`Uploading ${i + 1} of ${all.length}: ${file.name}`);
          try {
            await uploadFile(target, file);
          } catch (e) {
            failed++;
            toast.error(e instanceof Error ? e.message : `Couldn't upload ${file.name}.`);
          }
        }
      }
      setStatus(null);
      toast.success(failed ? `${r.ok} ${failed} file${failed === 1 ? "" : "s"} didn't upload; you can add them on the request.` : r.ok);
      router.push(r.href ?? "/portal/tickets");
    });

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {projects.length > 0 && (
        <div className="grid gap-1.5">
          <Label htmlFor="project">
            Project{projectRequired && <span className="text-destructive"> *</span>}
          </Label>
          <select
            id="project"
            value={projectId}
            disabled={readOnly}
            onChange={(e) => setProjectId(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
            aria-invalid={errors._project ? true : undefined}
          >
            <option value="">{projectRequired ? "Choose…" : "Not about a specific project"}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {errors._project && <p className="text-xs text-destructive">{errors._project}</p>}
        </div>
      )}

      <FormFields
        fields={fields}
        values={values}
        errors={errors}
        disabled={readOnly || pending}
        onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))}
        fileNames={Object.fromEntries(Object.entries(chosen).map(([k, list]) => [k, list.map((f) => f.name)]))}
        onPickFiles={(k, list) => setChosen((s) => ({ ...s, [k]: [...(s[k] ?? []), ...Array.from(list)].slice(0, 10) }))}
        onRemoveFile={(k, i) => setChosen((s) => ({ ...s, [k]: (s[k] ?? []).filter((_, j) => j !== i) }))}
      />

      <div className="flex flex-wrap items-center justify-end gap-3">
        {status && (
          <span className="text-sm text-muted-foreground" role="status">
            {status}
          </span>
        )}
        <Button type="submit" disabled={pending || readOnly}>
          {pending ? "Sending…" : "Send request"}
        </Button>
      </div>
    </form>
  );
}
