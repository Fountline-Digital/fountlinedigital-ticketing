"use client";
import { Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Answer, Field } from "@/lib/forms";

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground disabled:opacity-50";

/**
 * Renders admin-built form fields. File fields are handled by the parent (upload now or
 * after submit); this shows the picker and the chosen names.
 */
export function FormFields({
  fields,
  values,
  errors,
  onChange,
  fileNames,
  onPickFiles,
  onRemoveFile,
  disabled = false,
  idPrefix = "f",
}: {
  fields: Field[];
  values: Record<string, Answer>;
  errors: Record<string, string>;
  onChange: (key: string, value: Answer) => void;
  fileNames: Record<string, string[]>;
  onPickFiles: (key: string, files: FileList) => void;
  onRemoveFile: (key: string, index: number) => void;
  disabled?: boolean;
  idPrefix?: string;
}) {
  return (
    <div className="grid gap-5">
      {fields.map((f) => {
        const id = `${idPrefix}-${f.key}`;
        const err = errors[f.key];
        const describedBy = [f.help ? `${id}-help` : null, err ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
        const str = typeof values[f.key] === "string" ? (values[f.key] as string) : "";
        const list = Array.isArray(values[f.key]) ? (values[f.key] as string[]) : [];
        const common = { id, disabled, "aria-invalid": err ? true : undefined, "aria-describedby": describedBy };

        return (
          <div key={f.key} className="grid gap-1.5">
            {f.kind === "multi_select" ? (
              <fieldset className="grid gap-2" aria-describedby={describedBy}>
                <legend className="mb-1 text-sm font-medium">
                  {f.label}
                  {f.required && <span className="text-destructive"> *</span>}
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(f.options ?? []).map((o) => (
                    <label key={o} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        disabled={disabled}
                        checked={list.includes(o)}
                        onCheckedChange={(c) => onChange(f.key, c ? [...list, o] : list.filter((x) => x !== o))}
                      />
                      {o}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <Label htmlFor={id}>
                {f.label}
                {f.required && <span className="text-destructive"> *</span>}
              </Label>
            )}

            {f.kind === "short_text" && <Input {...common} value={str} maxLength={300} onChange={(e) => onChange(f.key, e.target.value)} />}
            {f.kind === "long_text" && <Textarea {...common} rows={5} value={str} maxLength={10000} onChange={(e) => onChange(f.key, e.target.value)} />}
            {f.kind === "url" && <Input {...common} type="url" inputMode="url" placeholder="https://" value={str} onChange={(e) => onChange(f.key, e.target.value)} />}
            {f.kind === "date" && <Input {...common} type="date" value={str} onChange={(e) => onChange(f.key, e.target.value)} />}
            {(f.kind === "select" || f.kind === "single_select") && (
              <select {...common} className={selectClass} value={str} onChange={(e) => onChange(f.key, e.target.value)}>
                <option value="">Choose…</option>
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            )}
            {f.kind === "file" && (
              <div className="space-y-2">
                <label
                  className={`inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted ${disabled ? "pointer-events-none opacity-50" : ""}`}
                >
                  <Paperclip className="size-4" />
                  Choose files
                  <input
                    {...common}
                    type="file"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      if (e.currentTarget.files?.length) onPickFiles(f.key, e.currentTarget.files);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                {(fileNames[f.key] ?? []).map((name, i) => (
                  <div key={`${name}-${i}`} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${name}`} disabled={disabled} onClick={() => onRemoveFile(f.key, i)}>
                      <X />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {f.help && (
              <p id={`${id}-help`} className="text-xs text-muted-foreground">
                {f.help}
              </p>
            )}
            {err && (
              <p id={`${id}-err`} className="text-xs text-destructive">
                {err}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
