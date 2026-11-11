/**
 * Seed script for the Neon DEV branch only.
 * Creates Fountline Digital, default admin settings, all 16 packages
 * (Web Business with a full starter template), and demo data.
 *
 * Everything created here is editable later from the admin screens.
 *
 * Run:  npm run db:seed
 * Needs in .env.local:
 *   DATABASE_URL=...dev branch connection string...
 *   NEON_DEV_ENDPOINT=ep-xxxx-xxxx      (the ep-... id from the dev branch string)
 *   SEED_ADMIN_EMAIL=you@fountlinedigital.com   (optional: creates your admin account)
 *   SEED_ADMIN_NAME=Kyle                         (optional)
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as s from "./schema";

config({ path: ".env.local" });

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
const devEndpoint = process.env.NEON_DEV_ENDPOINT;
if (!url) fail("DATABASE_URL is not set in .env.local.");
if (!devEndpoint)
  fail("Set NEON_DEV_ENDPOINT in .env.local to your dev branch's endpoint id (the ep-... part of its connection string).");
if (!url.includes(devEndpoint)) fail("DATABASE_URL does not point at the dev branch. Refusing to seed.");
if (process.env.CONTEXT === "production" || process.env.NODE_ENV === "production")
  fail("Refusing to seed in production.");

const db = drizzle({ client: neon(url) });

// ---------------------------------------------------------------------------
// Starter data (all editable later in admin settings)
// ---------------------------------------------------------------------------

const SERVICE_LINES = [
  { code: "WEB", name: "Web" },
  { code: "MOB", name: "Mobile Apps" },
  { code: "BRD", name: "Branding & Design" },
  { code: "MNT", name: "Maintenance" },
] as const;

const TIERS = [
  { code: "ESS", name: "Essentials" },
  { code: "BUS", name: "Business" },
  { code: "ENT", name: "Enterprise" },
  { code: "CUS", name: "Custom" },
] as const;

// Per-tier defaults from the spec.
const TIER_DEFAULTS = {
  ESS: { revisionRounds: 2, responseTargetMinutes: 48 * 60, websiteDesignsOffered: 3, picker: "starter", logoConcepts: 3 },
  BUS: { revisionRounds: 3, responseTargetMinutes: 24 * 60, websiteDesignsOffered: 5, picker: "full", logoConcepts: 4 },
  ENT: { revisionRounds: 4, responseTargetMinutes: 4 * 60, websiteDesignsOffered: null, picker: "none", logoConcepts: 5 },
  CUS: { revisionRounds: 3, responseTargetMinutes: 24 * 60, websiteDesignsOffered: null, picker: "none", logoConcepts: 5 },
} as const;

const STATUSES = [
  { name: "New", category: "new", color: "#6B7280", isDefault: true, pausesResponseClock: false },
  { name: "To do", category: "todo", color: "#3B82F6", isDefault: false, pausesResponseClock: false },
  { name: "In progress", category: "in_progress", color: "#8B5CF6", isDefault: false, pausesResponseClock: false },
  { name: "Waiting on client", category: "waiting", color: "#F59E0B", isDefault: false, pausesResponseClock: true },
  { name: "In review", category: "review", color: "#06B6D4", isDefault: false, pausesResponseClock: false },
  { name: "Blocked", category: "blocked", color: "#EF4444", isDefault: false, pausesResponseClock: false },
  { name: "Done", category: "done", color: "#10B981", isDefault: false, pausesResponseClock: false },
  { name: "Cancelled", category: "cancelled", color: "#9CA3AF", isDefault: false, pausesResponseClock: false },
] as const;

const TICKET_TYPES = [
  { name: "Lead", kind: "lead" },
  { name: "Project task", kind: "project_task" },
  { name: "Support request", kind: "support" },
  { name: "Change request", kind: "change_request" },
  { name: "Internal task", kind: "internal" },
] as const;

const PRIORITIES = [
  { name: "Low", color: "#9CA3AF", isDefault: false },
  { name: "Normal", color: "#3B82F6", isDefault: true },
  { name: "High", color: "#F59E0B", isDefault: false },
  { name: "Urgent", color: "#EF4444", isDefault: false },
] as const;

const LEAD_STAGES = [
  { name: "New", kind: "open" },
  { name: "Contacted", kind: "open" },
  { name: "Proposal sent", kind: "open" },
  { name: "Won", kind: "won" },
  { name: "Lost", kind: "lost" },
] as const;

const LOST_REASONS = [
  { name: "Budget" },
  { name: "Timing" },
  { name: "Chose another provider" },
  { name: "No response" },
] as const;

const PHASE_NAMES = [
  { name: "Discovery" },
  { name: "Design" },
  { name: "Build" },
  { name: "Review" },
  { name: "Launch" },
  { name: "Handoff" },
] as const;

type TaskDef = {
  code: string;
  title: string;
  estimateMinutes: number;
  role?: "manager" | "worker";
  clientVisible?: boolean;
  checklist?: string[];
  dependsOn?: string[];
};
type PhaseDef = {
  name: string;
  gate: "none" | "manager" | "client" | "both";
  revisionRounds?: number;
  tasks: TaskDef[];
};

// Placeholder template for Web Business (FD-WEB-BUS). Edit it in the admin screens later.
const WEB_BUS_TEMPLATE: PhaseDef[] = [
  {
    name: "Discovery",
    gate: "client",
    tasks: [
      { code: "1.01", title: "Kickoff call", estimateMinutes: 60, role: "manager", clientVisible: true,
        checklist: ["Confirm goals and timeline", "Confirm main contact and approver", "Walk through the portal"] },
      { code: "1.02", title: "Review intake questionnaire", estimateMinutes: 45, dependsOn: ["1.01"] },
      { code: "1.03", title: "Sitemap and page list", estimateMinutes: 90, clientVisible: true, dependsOn: ["1.02"] },
    ],
  },
  {
    name: "Design",
    gate: "client",
    revisionRounds: 3,
    tasks: [
      { code: "2.01", title: "Offer website designs to client", estimateMinutes: 30, role: "manager",
        checklist: ["Pick 3-5 designs from the catalog", "Publish them to the client portal"] },
      { code: "2.02", title: "Client picks design, colors and fonts", estimateMinutes: 15, clientVisible: true, dependsOn: ["2.01"] },
      { code: "2.03", title: "Homepage mockup", estimateMinutes: 240, clientVisible: true, dependsOn: ["2.02"] },
      { code: "2.04", title: "Inner page mockups", estimateMinutes: 360, dependsOn: ["2.03"] },
    ],
  },
  {
    name: "Build",
    gate: "manager",
    tasks: [
      { code: "3.01", title: "Set up project, repo and hosting", estimateMinutes: 60 },
      { code: "3.02", title: "Build pages", estimateMinutes: 960, dependsOn: ["3.01"] },
      { code: "3.03", title: "Add content and images", estimateMinutes: 240, dependsOn: ["3.02"] },
      { code: "3.04", title: "Contact form and integrations", estimateMinutes: 120, dependsOn: ["3.02"] },
      { code: "3.05", title: "Basic SEO setup", estimateMinutes: 90, dependsOn: ["3.03"],
        checklist: ["Page titles and descriptions", "Sitemap.xml", "Google Search Console"] },
    ],
  },
  {
    name: "Review",
    gate: "client",
    revisionRounds: 2,
    tasks: [
      { code: "4.01", title: "Internal QA", estimateMinutes: 120,
        checklist: ["Mobile layouts", "Chrome, Safari, Firefox, Edge", "Broken links", "Form submissions", "Page speed"] },
      { code: "4.02", title: "Client review", estimateMinutes: 30, clientVisible: true, dependsOn: ["4.01"] },
      { code: "4.03", title: "Apply review changes", estimateMinutes: 180, dependsOn: ["4.02"] },
    ],
  },
  {
    name: "Launch",
    gate: "manager",
    tasks: [
      { code: "5.01", title: "Domain and DNS", estimateMinutes: 45 },
      { code: "5.02", title: "SSL, analytics and backups", estimateMinutes: 45 },
      { code: "5.03", title: "Go live", estimateMinutes: 30, role: "manager", clientVisible: true, dependsOn: ["5.01", "5.02"] },
    ],
  },
  {
    name: "Handoff",
    gate: "client",
    tasks: [
      { code: "6.01", title: "Training session", estimateMinutes: 60, clientVisible: true },
      { code: "6.02", title: "Handoff documents and access", estimateMinutes: 60, clientVisible: true, dependsOn: ["6.01"] },
    ],
  },
];

const CLOSEOUT_CHECKLIST = [
  "Credentials and access handed over",
  "Training completed",
  "Analytics verified",
  "Backups configured",
  "Final files delivered",
];

const INTAKE_QUESTIONS = [
  { label: "Business name and what you do", kind: "long_text", isRequired: true, options: [] as string[] },
  { label: "Main goals for the website", kind: "long_text", isRequired: true, options: [] as string[] },
  { label: "Who are your customers?", kind: "long_text", isRequired: false, options: [] as string[] },
  { label: "Competitor or inspiration websites", kind: "long_text", isRequired: false, options: [] as string[] },
  { label: "Do you already own a domain?", kind: "single_select", isRequired: true, options: ["Yes", "No", "Not sure"] },
  { label: "Who manages your domain and hosting today?", kind: "short_text", isRequired: false, options: [] as string[] },
  { label: "Logo files", kind: "file", isRequired: false, options: [] as string[] },
  { label: "Brand colors and fonts (if you have them)", kind: "short_text", isRequired: false, options: [] as string[] },
  { label: "Pages you need", kind: "multi_select", isRequired: true,
    options: ["Home", "About", "Services", "Gallery", "Blog", "Contact", "FAQ", "Other"] },
  { label: "Is your page content ready?", kind: "single_select", isRequired: true,
    options: ["Yes, all of it", "Some of it", "No, I need help writing it"] },
] as const;

const DESIGN_NAMES = ["Harbor", "Summit", "Meridian", "Coastal", "Foundry"];

// ---------------------------------------------------------------------------

async function main() {
  const existing = await db
    .select({ id: s.organizations.id })
    .from(s.organizations)
    .where(eq(s.organizations.slug, "fountline-digital"));
  if (existing.length > 0)
    fail("Fountline Digital already exists on this branch. To start over, reset the dev branch in Neon, rerun the migrations, then seed again.");

  const now = new Date();
  const year2 = now.getFullYear() % 100; // 26

  // Organization -------------------------------------------------------------
  const [org] = await db
    .insert(s.organizations)
    .values({
      name: "Fountline Digital",
      slug: "fountline-digital",
      keyPrefix: "FD",
      timezone: "America/New_York",
      settings: {
        allowedGoogleDomains: ["fountlinedigital.com"],
        contractorDefaultAccessDays: 90,
        inviteExpiryHours: 72,
        trashRetentionDays: 30,
        auditHotDays: 90,
        archiveClosedProjectsAfterMonths: 12,
        maxUploadMb: 25,
        defaultWebsiteDesignsOffered: 5,
        portal: { showDueDates: true, showAssigneeNames: false, showEstimates: false },
        notifications: { senderName: "Fountline Digital", digestTime: "08:00" },
      },
    })
    .returning();
  const orgId = org.id;
  const P = org.keyPrefix; // "FD"

  const withOrder = <T extends object>(items: readonly T[]) =>
    items.map((item, i) => ({ ...item, orgId, sortOrder: i }));

  // Admin user (optional) ----------------------------------------------------
  let adminMembershipId: string | null = null;
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  if (adminEmail) {
    await db
      .insert(s.users)
      .values({ email: adminEmail, name: process.env.SEED_ADMIN_NAME ?? "" })
      .onConflictDoNothing({ target: s.users.email });
    const [admin] = await db.select().from(s.users).where(eq(s.users.email, adminEmail));
    const [membership] = await db
      .insert(s.memberships)
      .values({ orgId, userId: admin.id, role: "admin", status: "active" })
      .returning();
    adminMembershipId = membership.id;
  }

  // Lookups --------------------------------------------------------------------
  const serviceLines = await db.insert(s.serviceLines).values(withOrder(SERVICE_LINES)).returning();
  const tiers = await db.insert(s.tiers).values(withOrder(TIERS)).returning();
  const statuses = await db.insert(s.ticketStatuses).values(withOrder(STATUSES)).returning();
  const types = await db.insert(s.ticketTypes).values(withOrder(TICKET_TYPES)).returning();
  const priorities = await db.insert(s.priorities).values(withOrder(PRIORITIES)).returning();
  const leadStages = await db.insert(s.leadStages).values(withOrder(LEAD_STAGES)).returning();
  await db.insert(s.lostReasons).values(withOrder(LOST_REASONS));
  await db.insert(s.phaseNames).values(withOrder(PHASE_NAMES));

  const line = (code: string) => serviceLines.find((r) => r.code === code)!;
  const status = (name: string) => statuses.find((r) => r.name === name)!;
  const type = (kind: string) => types.find((r) => r.kind === kind)!;
  const priority = (name: string) => priorities.find((r) => r.name === name)!;
  const leadStage = (name: string) => leadStages.find((r) => r.name === name)!;

  // Business hours: Mon-Fri 9-5 Eastern
  await db.insert(s.businessHours).values(
    [1, 2, 3, 4, 5].map((day) => ({ orgId, dayOfWeek: day, opensAt: "09:00", closesAt: "17:00" })),
  );
  await db.insert(s.holidays).values([
    { orgId, date: "2026-11-26", name: "Thanksgiving" },
    { orgId, date: "2026-12-25", name: "Christmas Day" },
    { orgId, date: "2027-01-01", name: "New Year's Day" },
  ]);

  await db.insert(s.automationRules).values([
    { orgId, kind: "approval_reminder", afterDays: 3 },
    { orgId, kind: "auto_close_waiting", afterDays: 14 },
    { orgId, kind: "escalate_overdue", afterDays: 1 },
  ]);

  // Contact form -> lead rules, one per service line
  await db.insert(s.contactFormRules).values(
    serviceLines.map((sl, i) => ({
      orgId,
      sortOrder: i,
      name: `${sl.name} inquiry`,
      conditions: { service: sl.name },
      ticketTypeId: type("lead").id,
      priorityId: priority("Normal").id,
      assigneeMembershipId: adminMembershipId,
      titleTemplate: `New ${sl.name} inquiry: {name}`,
      checklist: ["Reply within 1 business day", "Schedule a discovery call"],
    })),
  );

  // Portal request forms
  await db.insert(s.requestForms).values([
    {
      orgId,
      sortOrder: 0,
      name: "Support request",
      ticketTypeId: type("support").id,
      fields: [
        { key: "summary", label: "What do you need help with?", kind: "short_text", required: true },
        { key: "details", label: "Details", kind: "long_text", required: true },
        { key: "url", label: "Page link (if it's about a page)", kind: "url" },
        { key: "urgency", label: "How urgent is it?", kind: "select", options: ["Not urgent", "Soon", "Site is down"], required: true },
        { key: "files", label: "Screenshots", kind: "file" },
      ],
    },
    {
      orgId,
      sortOrder: 1,
      name: "Change request",
      ticketTypeId: type("change_request").id,
      fields: [
        { key: "summary", label: "What would you like to change or add?", kind: "short_text", required: true },
        { key: "details", label: "Details", kind: "long_text", required: true },
        { key: "deadline", label: "Do you need it by a certain date?", kind: "date" },
      ],
    },
  ]);

  // Packages: every service line x tier --------------------------------------
  let webBusVersionId = "";
  let webBusPackageId = "";
  for (const sl of serviceLines) {
    for (const tier of tiers) {
      const d = TIER_DEFAULTS[tier.code as keyof typeof TIER_DEFAULTS];
      const key = `${P}-${sl.code}-${tier.code}`;
      const isWebBus = sl.code === "WEB" && tier.code === "BUS";

      const [pkg] = await db
        .insert(s.packages)
        .values({
          orgId,
          key,
          serviceLineId: sl.id,
          tierId: tier.id,
          name: `${sl.name} ${tier.name}`,
          status: isWebBus ? "active" : "draft",
        })
        .returning();

      const [version] = await db
        .insert(s.packageVersions)
        .values({
          orgId,
          packageId: pkg.id,
          version: 1,
          revisionRounds: d.revisionRounds,
          responseTargetMinutes: d.responseTargetMinutes,
          pickerAccess: sl.code === "WEB" ? d.picker : "none",
          websiteDesignsOffered: sl.code === "WEB" ? d.websiteDesignsOffered : null,
          logoConceptsPerBatch: sl.code === "BRD" ? d.logoConcepts : null,
          closeoutChecklist: CLOSEOUT_CHECKLIST,
          notes: isWebBus ? "Starter template from seed. Edit freely." : "Empty template. Add phases and tasks in admin.",
          publishedAt: now,
        })
        .returning();

      await db.update(s.packages).set({ currentVersionId: version.id }).where(eq(s.packages.id, pkg.id));

      if (isWebBus) {
        webBusVersionId = version.id;
        webBusPackageId = pkg.id;
      }
    }
  }

  // Web Business template ---------------------------------------------------
  const taskTemplateIdByCode = new Map<string, string>();
  const phaseTemplateRows: { id: string; position: number; name: string; gate: PhaseDef["gate"]; revisionRounds: number }[] = [];

  for (const [i, phase] of WEB_BUS_TEMPLATE.entries()) {
    const [pt] = await db
      .insert(s.phaseTemplates)
      .values({
        orgId,
        packageVersionId: webBusVersionId,
        position: i + 1,
        name: phase.name,
        gateApprover: phase.gate,
        revisionRounds: phase.revisionRounds ?? null,
      })
      .returning();
    phaseTemplateRows.push({ id: pt.id, position: i + 1, name: phase.name, gate: phase.gate, revisionRounds: phase.revisionRounds ?? 0 });

    const tasks = await db
      .insert(s.taskTemplates)
      .values(
        phase.tasks.map((t, j) => ({
          orgId,
          phaseTemplateId: pt.id,
          position: j + 1,
          code: t.code,
          title: t.title,
          ticketTypeId: type("project_task").id,
          defaultRole: t.role ?? "worker",
          estimateMinutes: t.estimateMinutes,
          checklist: t.checklist ?? [],
          isClientVisible: t.clientVisible ?? false,
        })),
      )
      .returning();
    for (const t of tasks) taskTemplateIdByCode.set(t.code, t.id);
  }

  const allTasks = WEB_BUS_TEMPLATE.flatMap((p) => p.tasks);
  const deps = allTasks.flatMap((t) =>
    (t.dependsOn ?? []).map((dep) => ({
      taskTemplateId: taskTemplateIdByCode.get(t.code)!,
      dependsOnTaskTemplateId: taskTemplateIdByCode.get(dep)!,
    })),
  );
  if (deps.length > 0) await db.insert(s.taskTemplateDependencies).values(deps);

  // Intake questionnaire for Web Business
  const [questionnaire] = await db
    .insert(s.questionnaires)
    .values({ orgId, packageId: webBusPackageId, name: "Website intake" })
    .returning();
  await db.insert(s.questionnaireQuestions).values(
    INTAKE_QUESTIONS.map((q, i) => ({
      orgId,
      questionnaireId: questionnaire.id,
      position: i + 1,
      label: q.label,
      kind: q.kind,
      options: [...q.options],
      isRequired: q.isRequired,
    })),
  );

  // Website design catalog: Collection 01 with placeholder designs (drafts)
  const [collection] = await db
    .insert(s.websiteCollections)
    .values({ orgId, number: 1, name: "Collection 01" })
    .returning();
  await db.insert(s.websiteDesigns).values(
    DESIGN_NAMES.map((name, i) => ({
      orgId,
      collectionId: collection.id,
      number: i + 1,
      key: `${P}WD-01-${String(i + 1).padStart(2, "0")}-${name}`,
      name,
      description: "Placeholder design. Replace with the real design, preview link and screenshots.",
      pages: ["Home", "About", "Services", "Contact"],
      inStarterSet: i < 3,
      inBusiness: true,
      status: "draft" as const,
    })),
  );

  // ---------------------------------------------------------------------------
  // Demo data (clearly marked "demo")
  // ---------------------------------------------------------------------------
  let ticketNumber = 1000; // first ticket = FDT-1001
  const nextTicket = () => {
    ticketNumber += 1;
    return { number: ticketNumber, key: `${P}T-${ticketNumber}` };
  };

  const [client] = await db
    .insert(s.clients)
    .values({ orgId, code: "ACME", key: `${P}C-ACME`, name: "Acme Landscaping (demo)", website: "https://example.com" })
    .returning();
  await db.insert(s.clientContacts).values({
    orgId,
    clientId: client.id,
    name: "Jane Demo",
    email: "jane.demo@example.com",
    isPrimary: true,
    isApprover: true,
  });

  // Project from the Web Business template (same steps the app will use)
  const projectSeq = 1;
  const projectKey = `${P}P-WEB-${year2}${String(projectSeq).padStart(2, "0")}`;
  const [project] = await db
    .insert(s.projects)
    .values({
      orgId,
      key: projectKey,
      year: year2,
      sequence: projectSeq,
      clientId: client.id,
      packageVersionId: webBusVersionId,
      serviceLineId: line("WEB").id,
      name: "Acme website (demo)",
      startDate: now.toISOString().slice(0, 10),
    })
    .returning();
  if (adminMembershipId) await db.insert(s.projectMembers).values({ projectId: project.id, membershipId: adminMembershipId });

  const ticketIdByTaskCode = new Map<string, string>();
  for (const [i, pt] of phaseTemplateRows.entries()) {
    const [phase] = await db
      .insert(s.projectPhases)
      .values({
        orgId,
        projectId: project.id,
        phaseTemplateId: pt.id,
        position: pt.position,
        name: pt.name,
        status: i === 0 ? "active" : "locked",
        gateApprover: pt.gate,
        revisionRoundsAllowed: pt.revisionRounds,
        startedAt: i === 0 ? now : null,
      })
      .returning();

    for (const task of WEB_BUS_TEMPLATE[i].tasks) {
      const { number, key } = nextTicket();
      const [ticket] = await db
        .insert(s.tickets)
        .values({
          orgId,
          number,
          key,
          ticketTypeId: type("project_task").id,
          statusId: status(i === 0 ? "To do" : "New").id,
          priorityId: priority("Normal").id,
          title: task.title,
          source: "template",
          clientId: client.id,
          projectId: project.id,
          projectPhaseId: phase.id,
          taskTemplateId: taskTemplateIdByCode.get(task.code)!,
          assigneeMembershipId: adminMembershipId,
          estimateMinutes: task.estimateMinutes,
          isClientVisible: task.clientVisible ?? false,
        })
        .returning();
      ticketIdByTaskCode.set(task.code, ticket.id);

      if (task.checklist && task.checklist.length > 0) {
        await db.insert(s.ticketChecklistItems).values(
          task.checklist.map((label, j) => ({ orgId, ticketId: ticket.id, position: j + 1, label })),
        );
      }
    }
  }

  // Dependencies become "blocks" links: the earlier ticket blocks the later one
  const links = allTasks.flatMap((t) =>
    (t.dependsOn ?? []).map((dep) => ({
      orgId,
      fromTicketId: ticketIdByTaskCode.get(dep)!,
      toTicketId: ticketIdByTaskCode.get(t.code)!,
      kind: "blocks" as const,
    })),
  );
  if (links.length > 0) await db.insert(s.ticketLinks).values(links);

  await db.insert(s.closeoutItems).values(
    CLOSEOUT_CHECKLIST.map((label, i) => ({ orgId, projectId: project.id, position: i + 1, label })),
  );

  // A demo lead and a demo internal task
  const lead = nextTicket();
  await db.insert(s.tickets).values({
    orgId,
    number: lead.number,
    key: lead.key,
    ticketTypeId: type("lead").id,
    statusId: status("New").id,
    priorityId: priority("Normal").id,
    title: "New Web inquiry: Bob's Bakery (demo)",
    description: "Looking for a new website with online ordering.",
    source: "contact_form",
    leadStageId: leadStage("New").id,
    leadContact: { name: "Bob Demo", email: "bob.demo@example.com", company: "Bob's Bakery" },
    formData: { service: "Web", budget: "$2,000-$5,000", timeline: "1-2 months" },
    assigneeMembershipId: adminMembershipId,
  });

  const internal = nextTicket();
  await db.insert(s.tickets).values({
    orgId,
    number: internal.number,
    key: internal.key,
    ticketTypeId: type("internal").id,
    statusId: status("To do").id,
    priorityId: priority("Low").id,
    title: "Update Google Business profile (demo)",
    source: "manual",
    assigneeMembershipId: adminMembershipId,
  });

  // Counters so the app continues the sequences
  await db.insert(s.orgCounters).values([
    { orgId, scope: "ticket", value: ticketNumber },
    { orgId, scope: `project:WEB:${year2}`, value: projectSeq },
  ]);

  await db.insert(s.auditLog).values({
    orgId,
    actorKind: "system",
    action: "seed.run",
    entityType: "organization",
    entityId: orgId,
    entityKey: P,
    metadata: { packages: serviceLines.length * tiers.length, demoTickets: ticketNumber - 1000 },
  });

  console.log(`
✔ Seeded Fountline Digital (prefix ${P})
  Service lines: ${serviceLines.map((r) => r.code).join(", ")}
  Tiers:         ${tiers.map((r) => r.code).join(", ")}
  Packages:      ${serviceLines.length * tiers.length} (${P}-WEB-BUS active with a full template, the rest drafts)
  Demo client:   ${client.key}
  Demo project:  ${project.key}
  Tickets:       ${P}T-1001 to ${P}T-${ticketNumber}
  Admin:         ${adminEmail ?? "none (set SEED_ADMIN_EMAIL to create your account)"}
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
