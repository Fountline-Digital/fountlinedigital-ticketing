import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { user, membership } = await requireUser();
  const firstName = (user.name || "").split(" ")[0];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        description={`Signed in as ${ROLE_LABELS[membership.role as Role]}`}
      />
      {error === "forbidden" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          You don&apos;t have access to that page.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {["Open tickets", "Active projects", "Waiting on client"].map((label) => (
          <Card key={label}>
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardTitle className="text-3xl">—</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">Coming with the tickets screens</CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
