// Admin-editable lists (Settings > Workflow lists). Safe for client components: no db imports.

export type FieldKind = "text" | "code" | "color" | "select" | "bool";
export type LookupField = { key: string; label: string; kind: FieldKind; options?: { value: string; label: string }[]; hint?: string; createOnly?: boolean };

export const STATUS_CATEGORIES = [
  { value: "new", label: "New (not started, locked phases)" },
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "waiting", label: "Waiting (on client or someone else)" },
  { value: "review", label: "In review" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];
export const TYPE_KINDS = [
  { value: "project_task", label: "Project task" },
  { value: "support", label: "Support request" },
  { value: "change_request", label: "Change request" },
  { value: "lead", label: "Lead" },
  { value: "internal", label: "Internal" },
];
export const STAGE_KINDS = [
  { value: "open", label: "Open" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

export const LISTS = {
  statuses: {
    label: "Ticket statuses",
    hint: "The category decides how the app treats a status: Done and Cancelled close tickets, Waiting can pause response targets, To do is where new work starts.",
    fields: [
      { key: "name", label: "Name", kind: "text" },
      { key: "color", label: "Color", kind: "color" },
      { key: "category", label: "Category", kind: "select", options: STATUS_CATEGORIES },
      { key: "pausesResponseClock", label: "Pauses the response clock", kind: "bool", hint: "No reply-by warnings while a ticket is in this status (e.g. Waiting on client)." },
    ],
    hasDefault: true,
  },
  types: {
    label: "Ticket types",
    hint: "The kind decides behavior: Support gets response targets, Lead gets the pipeline, Change request is used when change requests are approved.",
    fields: [
      { key: "name", label: "Name", kind: "text" },
      { key: "kind", label: "Kind", kind: "select", options: TYPE_KINDS },
    ],
    hasDefault: false,
  },
  priorities: {
    label: "Priorities",
    hint: "Ordered from most to least urgent is easiest to read. The default is used for new tickets.",
    fields: [
      { key: "name", label: "Name", kind: "text" },
      { key: "color", label: "Color", kind: "color" },
    ],
    hasDefault: true,
  },
  stages: {
    label: "Lead stages",
    hint: "The pipeline columns, in order. Won and Lost close the lead; the first Open stage is where website inquiries land.",
    fields: [
      { key: "name", label: "Name", kind: "text" },
      { key: "kind", label: "Kind", kind: "select", options: STAGE_KINDS },
    ],
    hasDefault: false,
  },
  lostReasons: {
    label: "Lost reasons",
    hint: "Asked for when a lead is marked Lost.",
    fields: [{ key: "name", label: "Name", kind: "text" }],
    hasDefault: false,
  },
  phaseNames: {
    label: "Phase names",
    hint: "Suggestions when building package templates. Changing one doesn't rename phases already in templates or projects.",
    fields: [{ key: "name", label: "Name", kind: "text" }],
    hasDefault: false,
  },
  serviceLines: {
    label: "Service lines",
    hint: "What you sell (Web, Mobile Apps…). The code is part of package and project keys (FD-WEB-BUS, FDP-WEB-2601), so it's set once.",
    fields: [
      { key: "name", label: "Name", kind: "text" },
      { key: "code", label: "Code", kind: "code", createOnly: true, hint: "2-8 capital letters, e.g. WEB." },
    ],
    hasDefault: false,
  },
  tiers: {
    label: "Tiers",
    hint: "Package levels (Essentials, Business…). The code is part of package keys, so it's set once.",
    fields: [
      { key: "name", label: "Name", kind: "text" },
      { key: "code", label: "Code", kind: "code", createOnly: true, hint: "2-8 capital letters, e.g. BUS." },
    ],
    hasDefault: false,
  },
} as const satisfies Record<string, { label: string; hint: string; fields: readonly LookupField[]; hasDefault: boolean }>;

export type ListKey = keyof typeof LISTS;
export const LIST_KEYS = Object.keys(LISTS) as ListKey[];
