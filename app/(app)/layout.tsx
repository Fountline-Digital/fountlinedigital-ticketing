import { requireUser } from "@/lib/session";
import { SignOutButton } from "@/components/sign-out-button";

// Everything inside app/(app)/ requires sign-in + two-factor.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, membership } = await requireUser();

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="font-semibold">Fountline Digital</span>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-600">
            {user.email} · {membership.role}
          </span>
          <SignOutButton className="underline" />
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
