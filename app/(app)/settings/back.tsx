import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function BackToSettings() {
  return (
    <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> Settings
    </Link>
  );
}
