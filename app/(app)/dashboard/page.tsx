import { requireUser } from "@/lib/session";

export default async function DashboardPage() {
  const { user, memberships } = await requireUser();

  return (
    <div className="max-w-2xl space-y-2">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p>Signed in as {user.name || user.email}.</p>
      <p className="text-sm text-gray-600">
        Roles: {memberships.map((m) => m.role).join(", ")}. Login and two-factor are working. Dashboards come next.
      </p>
    </div>
  );
}
