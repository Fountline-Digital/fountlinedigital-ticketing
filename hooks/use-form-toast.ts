"use client";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

/** Shows a toast once per server response (responses carry an `at` timestamp). */
export function useFormToast(state: { ok?: string; error?: string; at?: number }, onOk?: () => void) {
  const handled = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!state.at || handled.current === state.at) return;
    handled.current = state.at;
    if (state.error) toast.error(state.error);
    if (state.ok) {
      toast.success(state.ok);
      onOk?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.at]);
}
