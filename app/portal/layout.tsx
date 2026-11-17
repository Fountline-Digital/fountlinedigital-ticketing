import Link from "next/link";
import { inArray } from "drizzle-orm";
import { Eye } from "lucide-react";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { PortalAccountMenu, PortalNav } from "@/components/portal/portal-nav";
import { recentNotifications } from "@/lib/dashboard";
import { portalOptions, requirePortal } from "@/lib/portal";
import { timeAgo } from "@/lib/time-ago";
import { stopPreview } from "./actions";

// The client portal. Separate from the team app: its own header, no sidebar,
// and every query scoped to the signed-in client's own company.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePortal({ skipTerms: true });
  const opts = portalOptions(ctx.org);
  const companies = ctx.clientIds.length ? await db.select({ name: clients.name }).from(clients).where(inArray(clients.id, ctx.clientIds)) : [];
  const bell = ctx.preview ? null : await recentNotifications(ctx.user.id, ctx.orgId, 10);

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      {ctx.preview && (
        <div role="status" className="flex flex-wrap items-center justify-center gap-3 border-b border-primary bg-primary px-4 py-2 text-sm text-primary-foreground">
          <Eye className="size-4" />
          <span>
            Previewing as <b>{ctx.preview.contactName}</b>. Read-only; nothing you click is saved.
          </span>
          <form action={stopPreview}>
            <Button type="submit" size="sm" variant="outline" className="h-7 border-black bg-transparent text-black hover:bg-black hover:text-white">
              Exit preview
            </Button>
          </form>
        </div>
      )}
      {opts.bannerMessage && <div className="border-b px-4 py-2 text-center text-sm">{opts.bannerMessage}</div>}

      <header className="border-b">
        <div className="mx-auto flex h-20 max-w-6xl items-center gap-4 px-4">
          <Link href="/portal" aria-label="Portal home">
            <Logo className="h-12" />
          </Link>
          <div className="hidden flex-1 md:block">
            <PortalNav />
          </div>
          <div className="ml-auto flex items-center gap-1">
            {bell && (
              <NotificationBell
                links={{ all: "/portal/notifications", settings: "/portal/notifications/settings" }}
                initial={{
                  unread: bell.unread,
                  items: bell.items.map((n) => ({ id: n.id, title: n.title, body: n.body, url: n.url, ago: timeAgo(n.createdAt), unread: !n.readAt })),
                }}
              />
            )}
            <PortalAccountMenu name={ctx.preview ? ctx.preview.contactName : ctx.user.name} email={ctx.user.email} company={companies.map((c) => c.name).join(", ") || null} />
          </div>
        </div>
        <div className="border-t px-4 py-2 md:hidden">
          <PortalNav />
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl p-4 outline-none md:p-8">
        {children}
      </main>

      {(opts.supportEmail || opts.supportPhone) && (
        <footer className="border-t px-4 py-6 text-center text-xs text-muted-foreground">
          Need help?{" "}
          {opts.supportEmail && (
            <a href={`mailto:${opts.supportEmail}`} className="text-primary hover:underline">
              {opts.supportEmail}
            </a>
          )}
          {opts.supportEmail && opts.supportPhone && " · "}
          {opts.supportPhone && (
            <a href={`tel:${opts.supportPhone.replace(/[^\d+]/g, "")}`} className="text-primary hover:underline">
              {opts.supportPhone}
            </a>
          )}
        </footer>
      )}
    </div>
  );
}
