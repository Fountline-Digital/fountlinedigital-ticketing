// Validates answers to admin-built forms (portal request forms and intake questionnaires).
// Safe on server and client. File fields hold IDs of files already uploaded.

export type FieldKind = "short_text" | "long_text" | "select" | "single_select" | "multi_select" | "file" | "url" | "date";
export type Field = { key: string; label: string; kind: FieldKind; options?: string[]; required?: boolean; help?: string | null };
export type Answer = string | string[];
export type Answers = Record<string, Answer>;

const LIMITS: Partial<Record<FieldKind, number>> = { short_text: 300, long_text: 10_000, url: 2_000 };

/** Cleans answers to exactly the form's fields. Returns errors by field key. */
export function validateAnswers(fields: Field[], raw: Record<string, unknown>, opts: { draft?: boolean } = {}) {
  const clean: Answers = {};
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const v = raw[f.key];
    const many = f.kind === "multi_select" || f.kind === "file";
    let value: Answer = many ? (Array.isArray(v) ? v.map(String) : []) : typeof v === "string" ? v.trim() : "";

    if (!many) {
      const s = value as string;
      const max = LIMITS[f.kind];
      if (max && s.length > max) errors[f.key] = `Keep it under ${max} characters.`;
      if (s && (f.kind === "select" || f.kind === "single_select") && !(f.options ?? []).includes(s)) errors[f.key] = "Pick one of the options.";
      if (s && f.kind === "url") {
        const url = /^https?:\/\//i.test(s) ? s : `https://${s}`;
        try {
          new URL(url);
          value = url;
        } catch {
          errors[f.key] = "That doesn't look like a web address.";
        }
      }
      if (s && f.kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(s)) errors[f.key] = "Pick a date.";
    } else {
      const list = (value as string[]).filter(Boolean);
      if (f.kind === "multi_select" && list.some((x) => !(f.options ?? []).includes(x))) errors[f.key] = "Pick from the options.";
      if (f.kind === "file" && list.some((x) => !/^[0-9a-f-]{36}$/i.test(x))) errors[f.key] = "Upload the files again.";
      value = [...new Set(list)].slice(0, 20);
    }

    const empty = Array.isArray(value) ? value.length === 0 : value === "";
    if (f.required && empty && !opts.draft && !errors[f.key]) errors[f.key] = "Required.";
    if (!empty) clean[f.key] = value;
  }
  return { clean, errors, ok: Object.keys(errors).length === 0 };
}

/** Readable "Label: answer" text for ticket descriptions and the team's view. */
export function answersToText(fields: Field[], answers: Answers, fileNames: Record<string, string> = {}) {
  return fields
    .filter((f) => answers[f.key] !== undefined)
    .map((f) => {
      const a = answers[f.key];
      const shown = f.kind === "file" ? (a as string[]).map((id) => fileNames[id] ?? "file").join(", ") : Array.isArray(a) ? a.join(", ") : a;
      return f.kind === "long_text" ? `${f.label}:\n${shown}` : `${f.label}: ${shown}`;
    })
    .join("\n\n");
}
