import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { canSeeLeads } from "@/lib/leads";
import { permissionsFor, ROLE_LABELS, type Role } from "@/lib/permissions";
import { AppSidebar, type NavSection } from "@/components/app-sidebar";
import { Logo } from "@/components/logo";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { recentNotifications } from "@/lib/dashboard";
import { timeAgo } from "@/lib/time-ago";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

// Everything inside app/(app)/ requires sign-in + two-factor.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, membership } = await requireUser();
  const role = membership.role as Role;
  if (role === "client") redirect("/portal");
  const can = await permissionsFor(membership.orgId, role);
  const showLeads = await canSeeLeads({ orgId: membership.orgId, role, membership });

  const sections: NavSection[] = [
    {
      label: "Work",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
        { href: "/tickets", label: "Tickets", icon: "tickets" },
        { href: "/projects", label: "Projects", icon: "projects" },
        ...(showLeads ? [{ href: "/leads", label: "Leads", icon: "leads" as const }] : []),
        ...(can["clients.view"] ? [{ href: "/clients", label: "Clients", icon: "clients" as const }] : []),
      ],
    },
  ];

  const admin = [
    ...(can["packages.manage"] ? [{ href: "/packages", label: "Packages", icon: "packages" as const }] : []),
    ...(can["packages.manage"] ? [{ href: "/designs", label: "Website designs", icon: "designs" as const }] : []),
    ...(can["users.view"] ? [{ href: "/settings/users", label: "Users & invites", icon: "users" as const }] : []),
    ...(can["settings.manage"] ? [{ href: "/settings/team-roles", label: "Team roles", icon: "teams" as const }] : []),
    ...(can["audit.view"] ? [{ href: "/settings/audit", label: "Audit log", icon: "audit" as const }] : []),
    ...(can["projects.manage"] ? [{ href: "/trash", label: "Trash", icon: "trash" as const }] : []),
    ...(can["settings.manage"] ? [{ href: "/settings/legal", label: "Terms & privacy", icon: "legal" as const }] : []),
    ...(can["settings.manage"] ? [{ href: "/settings/notifications", label: "Notifications", icon: "bell" as const }] : []),
    ...(can["settings.manage"] ? [{ href: "/settings", label: "Settings", icon: "settings" as const }] : []),
  ];
  if (admin.length > 0) sections.push({ label: "Admin", items: admin });

  const bell = await recentNotifications(user.id, membership.orgId, 10);

  return (
    <SidebarProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <AppSidebar sections={sections} user={{ name: user.name, email: user.email, roleLabel: ROLE_LABELS[role] }} />
      <SidebarInset>
        <header className="flex h-20 items-center gap-3 border-b bg-background px-4">
          <SidebarTrigger />
          <Logo className="h-14 md:hidden" />
          <div className="ml-auto">
            <NotificationBell
              initial={{
                unread: bell.unread,
                items: bell.items.map((n) => ({ id: n.id, title: n.title, body: n.body, url: n.url, ago: timeAgo(n.createdAt), unread: !n.readAt })),
              }}
            />
          </div>
        </header>
        <div id="main" tabIndex={-1} className="flex-1 p-4 outline-none md:p-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
