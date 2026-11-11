import { cn } from "@/lib/utils";

// Text wordmark for now. Swap for the real logo file once it's in /public/brand/.
export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1.5 font-semibold tracking-[0.18em] uppercase",
        inverted ? "text-white" : "text-black",
        className,
      )}
    >
      Fountline
      <span className="text-[#c0c0c0]">Digital</span>
    </span>
  );
}
