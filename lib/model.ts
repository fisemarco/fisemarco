import type { z } from "zod";
import type { recordSchema } from "./server";
type RecordInput = z.infer<typeof recordSchema>;
type UnionKeys<T> = T extends unknown ? keyof T : never;
type UnionValue<T, K> = T extends unknown
  ? K extends keyof T
    ? T[K]
    : never
  : never;
export type RecordPayload = {
  [K in UnionKeys<RecordInput>]?: UnionValue<RecordInput, K>;
} & {
  profile?: Profile;
  organization?: string;
  name?: string;
  model?: string;
  status?: string;
  visibility?: string;
  [key: string]: unknown;
};
export type Profile = {
  description: string;
  creator: string;
  operator: string;
  model: string;
  version: string;
  skills: string[];
  allowed: string[];
  denied: string[];
  externalDid: string;
  endpoint: string;
};
export type Agent = {
  code: string;
  name: string;
  role: string;
  organization: string;
  profile: Profile;
  status: "active" | "suspended" | "retired";
  visibility: "private" | "shared";
  revision: number;
  created: string;
  updated: string;
  canEdit: boolean;
  did: string;
};
export type WorkRecord = {
  id: string;
  agent: string;
  sequence: number;
  kind: string;
  title: string;
  payload: RecordPayload;
  actor: string;
  created: string;
  previous_hash: string;
  hash: string;
  jws: string;
  withdrawn?: boolean;
};
export const kinds: Record<string, string> = {
  employment: "Employment",
  employment_end: "Employment ended",
  task: "Task outcome",
  benchmark: "Benchmark",
  credential: "Credential",
  incident: "Incident",
  incident_resolution: "Incident resolved",
  version: "Version release",
  review: "Employer review",
  correction: "Record withdrawal",
  profile: "Identity update",
  history_import: "Imported history",
  runtime_access: "Runtime key access",
};
export function effectiveJobs(records: WorkRecord[]) {
  const live = records.filter((r) => !r.withdrawn);
  return live
    .filter((r) => r.kind === "employment")
    .map((r) => {
      const end = live.find(
        (e) => e.kind === "employment_end" && e.payload.employmentId === r.id,
      );
      return end
        ? { ...r, payload: { ...r.payload, endDate: end.payload.endDate } }
        : r;
    });
}
export function metrics(records: WorkRecord[]) {
  const live = records.filter((r) => !r.withdrawn);
  const tasks = live.filter((r) => r.kind === "task");
  const success = tasks.filter((r) => r.payload.outcome === "success").length;
  const durations = tasks
    .map((r) => r.payload.durationSeconds)
    .filter((n) => typeof n === "number");
  return {
    tasks: tasks.length,
    success: tasks.length
      ? Math.round((success / tasks.length) * 1000) / 10
      : null,
    intervention: tasks.length
      ? Math.round(
          (tasks.filter((r) => r.payload.intervention).length / tasks.length) *
            1000,
        ) / 10
      : null,
    average: durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null,
    evidence: live.filter(
      (r) => r.payload.evidenceUrl || r.payload.evidenceHash,
    ).length,
    incidents: live.filter(
      (r) =>
        r.kind === "incident" &&
        r.payload.state !== "resolved" &&
        !live.some(
          (e) =>
            e.kind === "incident_resolution" && e.payload.incidentId === r.id,
        ),
    ).length,
    jobs: effectiveJobs(records),
    benchmarks: live.filter((r) => r.kind === "benchmark"),
  };
}
