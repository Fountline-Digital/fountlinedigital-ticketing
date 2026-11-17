"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormFields } from "@/components/portal/form-fields";
import type { Answer, Answers, Field } from "@/lib/forms";
import { uploadFile } from "@/lib/upload-client";
import { saveQuestionnaire } from "../../../questionnaire-actions";

export function QuestionnaireForm({
  projectId,
  fields,
  initial,
  fileNames: initialNames,
  submitted,
  readOnly,
}: {
  projectId: string;
  fields: Field[];
  initial: Answers;
  fileNames: Record<string, string>;
  submitted: boolean;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, Answer>>(initial);
  const [names, setNames] = useState<Record<string, string>>(initialNames); // file id -> name
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(0);
  const [pending, start] = useTransition();

  const ids = (key: string) => (Array.isArray(values[key]) ? (values[key] as string[]) : []);

  // File questions upload straight away (to the project) and keep the file ids as the answer
  async function pick(key: string, list: FileList) {
    const chosen = Array.from(list);
    setUploading((n) => n + chosen.length);
    for (const file of chosen) {
      try {
        const id = await uploadFile({ projectId }, file);
        setNames((s) => ({ ...s, [id]: file.name }));
        setValues((s) => ({ ...s, [key]: [...(Array.isArray(s[key]) ? (s[key] as string[]) : []), id] }));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Couldn't upload ${file.name}.`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  const save = (submit: boolean) =>
    start(async () => {
      const r = await saveQuestionnaire(projectId, values, submit);
      setErrors(r.errors ?? {});
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(r.ok);
      if (submit) router.push(`/portal/projects/${projectId}`);
    });

  const busy = pending || uploading > 0 || readOnly;
  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        save(true);
      }}
    >
      <FormFields
        idPrefix="q"
        fields={fields}
        values={values}
        errors={errors}
        disabled={readOnly || pending}
        onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))}
        fileNames={Object.fromEntries(fields.filter((f) => f.kind === "file").map((f) => [f.key, ids(f.key).map((id) => names[id] ?? "File")]))}
        onPickFiles={(k, list) => void pick(k, list)}
        onRemoveFile={(k, i) => setValues((s) => ({ ...s, [k]: ids(k).filter((_, j) => j !== i) }))}
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {uploading > 0 && (
          <span className="text-sm text-muted-foreground" role="status">
            Uploading {uploading} file{uploading === 1 ? "" : "s"}…
          </span>
        )}
        {!submitted && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => save(false)}>
            Save and finish later
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {submitted ? "Save changes" : "Submit"}
        </Button>
      </div>
    </form>
  );
}
