"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import type { Result } from "../actions";

export function useTicketAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, after?: (r: Result) => void, quiet = false) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else if (r.ok && !quiet) toast.success(r.ok);
      after?.(r);
    });
  return { pending, run };
}
