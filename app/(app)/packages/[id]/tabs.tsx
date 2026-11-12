"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function PackageTabs({ packageId }: { packageId: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/packages/${packageId}`, label: "Settings" },
    { href: `/packages/${packageId}/template`, label: "Template" },
  ];
  return (
    <nav className="flex gap-1 border-b text-sm">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2",
              active ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
