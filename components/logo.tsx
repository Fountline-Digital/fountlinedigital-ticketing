import { cn } from "@/lib/utils";

// White logo. Always place it on a black background.
// File lives at public/brand/FD_Logo_White.svg
export function Logo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/FD_Logo_White.svg" alt="Fountline Digital" className={cn("h-8 w-auto", className)} />
  );
}
