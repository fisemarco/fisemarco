import type * as schema from "../db/schema";
import type { Agent } from "./model";
type Snake<S extends string> = S extends `${infer H}${infer T}`
  ? `${H extends Lowercase<H> ? "" : "_"}${Lowercase<H>}${Snake<T>}`
  : S;
type Raw<T> = { [K in keyof T as Snake<K & string>]: T[K] };
export type AgentRow = Omit<
  Raw<typeof schema.agents.$inferSelect>,
  "status" | "visibility"
> &
  Pick<Agent, "status" | "visibility">;
export type RecordRow = Raw<typeof schema.records.$inferSelect>;
export type PolicyRow = Raw<typeof schema.enrollmentPolicies.$inferSelect>;
export type RuntimeRow = Raw<typeof schema.runtimeAgents.$inferSelect>;
export type PermitRow = Raw<typeof schema.workPermits.$inferSelect>;
export type KeyRow = Raw<typeof schema.apiKeys.$inferSelect>;
