import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/session";

const GROUPS = [
  {
    title: "Business",
    items: [
      { href: "/settings/organization", label: "Organization", hint: "Name, time zone and key prefix" },
      { href: "/settings/hours", label: "Business hours & holidays", hint: "What response targets count" },
      { href: "/settings/automation", label: "Automation", hint: "Approval reminders, auto-close, overdue escalation" },
    ],
  },
  {
    title: "People",
    items: [
      { href: "/settings/users", label: "Users & invites", hint: "Who has access and their roles" },
      { href: "/settings/access", label: "Access & security", hint: "Google domains, what each role can do, session length" },
      { href: "/settings/team-roles", label: "Team roles", hint: "Departments, leads and dashboards" },
    ],
  },
  {
    title: "Work",
    items: [
      { href: "/settings/workflow", label: "Workflow lists", hint: "Statuses, ticket types, priorities, lead stages, lost reasons, phase names, service lines, tiers" },
      { href: "/settings/intake", label: "Intake & assignment", hint: "Contact form rules, portal request forms, default assignees, spam protection" },
      { href: "/packages", label: "Packages", hint: "Tiers, templates, questionnaires" },
      { href: "/designs", label: "Website designs", hint: "Catalog for the website picker" },
    ],
  },
  {
    title: "Clients & notifications",
    items: [
      { href: "/settings/portal", label: "Client portal", hint: "What clients see, welcome and banner, support contact" },
      { href: "/settings/legal", label: "Terms & privacy", hint: "What clients accept" },
      { href: "/settings/notifications", label: "Notifications", hint: "Email sender and wording, Discord" },
    ],
  },
  {
    title: "Data",
    items: [
      { href: "/settings/data", label: "Files & data", hint: "Upload limits, retention, exports" },
      { href: "/settings/audit", label: "Audit log", hint: "Everything that happened" },
      { href: "/trash", label: "Trash", hint: "Restore deleted items" },
    ],
  },
];

export default async function SettingsHome() {
  await requirePermission("settings.manage");
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader title="Settings" description="Everything you can change without a code update. Every change is recorded in the audit log." />
      {GROUPS.map((g) => (
        <section key={g.title} className="space-y-2" aria-label={g.title}>
          <h2 className="text-sm font-medium text-muted-foreground">{g.title}</h2>
          <Card className="py-0">
            <CardContent className="divide-y p-0">
              {g.items.map((i: { href: string; label: string; hint: string; soon?: boolean }) =>
                i.soon ? (
                  <div key={i.href} className="flex items-center gap-3 px-4 py-3 opacity-50">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{i.label}</span>
                      <span className="block text-xs text-muted-foreground">{i.hint} · coming next</span>
                    </span>
                  </div>
                ) : (
                <Link key={i.href} href={i.href} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{i.label}</span>
                    <span className="block text-xs text-muted-foreground">{i.hint}</span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
                ),
              )}
            </CardContent>
          </Card>
        </section>
      ))}
    </div>
  );
}
