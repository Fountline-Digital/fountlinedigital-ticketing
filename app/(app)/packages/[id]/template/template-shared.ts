"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import type { Result } from "./actions";

export type PhaseData = {
  id: string;
  position: number;
  name: string;
  description: string;
  gate: "none" | "manager" | "client" | "both";
  revisionRounds: number | null;
};

export type TaskData = {
  id: string;
  phaseId: string;
  position: number;
  code: string;
  title: string;
  description: string;
  defaultRole: string;
  teamRoleId: string | null;
  estimateMinutes: number | null;
  isClientVisible: boolean;
  checklist: string[];
  dependsOn: string[];
};

export const GATE_LABELS: Record<PhaseData["gate"], string> = {
  none: "No approval",
  manager: "Manager approves",
  client: "Client approves",
  both: "Manager + client approve",
};

export const ROLE_LABELS: Record<string, string> = { manager: "Manager", worker: "Worker", contractor: "Contractor" };

export const hours = (minutes: number | null) => (minutes === null ? null : Math.round((minutes / 60) * 10) / 10);

export function useAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, after?: (r: Result) => void) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else if (r.ok) toast.success(r.ok);
      after?.(r);
    });
  return { pending, run };
}


export type TeamRoleOption = { value: string; label: string; color: string };
