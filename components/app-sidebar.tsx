"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  ChevronsUpDown,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  Ticket,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";

export type NavIcon = "dashboard" | "tickets" | "projects" | "clients" | "packages" | "users" | "settings";
export type NavItem = { href: string; label: string; icon: NavIcon; soon?: boolean };
export type NavSection = { label: string; items: NavItem[] };

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  tickets: Ticket,
  projects: FolderKanban,
  clients: Building2,
  packages: Package,
  users: Users,
  settings: Settings,
};

export function AppSidebar({
  sections,
  user,
}: {
  sections: NavSection[];
  user: { name: string; email: string; roleLabel: string };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const initials = (user.name || user.email).slice(0, 2).toUpperCase();

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-5">
        <Link href="/dashboard">
          <Logo inverted className="text-sm" />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const Icon = ICONS[item.icon];
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <SidebarMenuItem key={item.href}>
                      {item.soon ? (
                        <SidebarMenuButton disabled aria-disabled className="opacity-50">
                          <Icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton isActive={active} render={<Link href={item.href} />}>
                          <Icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      )}
                      {item.soon && <SidebarMenuBadge>Soon</SidebarMenuBadge>}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#c0c0c0] text-xs font-semibold text-black">
                  {initials}
                </span>
                <span className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name || user.email}</span>
                  <span className="truncate text-xs opacity-70">{user.roleLabel}</span>
                </span>
                <ChevronsUpDown className="ml-auto size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="min-w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    <div className="truncate text-foreground">{user.name || user.email}</div>
                    <div className="truncate font-normal">{user.email}</div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await authClient.signOut();
                    router.push("/sign-in");
                    router.refresh();
                  }}
                >
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
