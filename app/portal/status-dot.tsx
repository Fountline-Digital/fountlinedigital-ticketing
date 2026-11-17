export function StatusDot({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-sm">
      <span className="size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      {name}
    </span>
  );
}
