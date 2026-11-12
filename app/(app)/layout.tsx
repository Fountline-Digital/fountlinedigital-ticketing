import { requireUser } from "@/lib/session";
import { permissionsFor, ROLE_LABELS, type Role } from "@/lib/permissions";
import { AppSidebar, type NavSection } from "@/components/app-sidebar";
import { Logo } from "@/components/logo";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

// Everything inside app/(app)/ requires sign-in + two-factor.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, membership } = await requireUser();
  const role = membership.role as Role;
  const can = await permissionsFor(membership.orgId, role);

  const sections: NavSection[] = [
    {
      label: "Work",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
        { href: "/tickets", label: "Tickets", icon: "tickets", soon: true },
        { href: "/projects", label: "Projects", icon: "projects" },
        ...(can["clients.view"] ? [{ href: "/clients", label: "Clients", icon: "clients" as const }] : []),
      ],
    },
  ];

  const admin = [
    ...(can["packages.manage"] ? [{ href: "/packages", label: "Packages", icon: "packages" as const }] : []),
    ...(can["users.view"] ? [{ href: "/settings/users", label: "Users & invites", icon: "users" as const }] : []),
    ...(can["settings.manage"] ? [{ href: "/settings/general", label: "Settings", icon: "settings" as const, soon: true }] : []),
  ];
  if (admin.length > 0) sections.push({ label: "Admin", items: admin });

  return (
    <SidebarProvider>
      <AppSidebar sections={sections} user={{ name: user.name, email: user.email, roleLabel: ROLE_LABELS[role] }} />
      <SidebarInset>
        <header className="flex h-20 items-center gap-3 border-b bg-background px-4">
          <SidebarTrigger />
          <Logo className="h-14 md:hidden" />
        </header>
        <div className="flex-1 p-4 md:p-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
