import type { identitySeal } from "./identity";
import type { PolicyRow, RuntimeRow, PermitRow, KeyRow } from "./rows";
export type PublicUser = { name: string; email: string };
export type Seal = Awaited<ReturnType<typeof identitySeal>>;
export type Verification = {
  valid: boolean;
  records?: number;
  unavailable?: boolean;
  name?: string;
  code?: string;
  reason?: string;
  meaning?: string;
  status?: string;
  checkedAt?: string;
  signatureValid?: boolean;
};
export type ApiKey = Pick<
  KeyRow,
  "id" | "label" | "prefix" | "scope" | "created" | "expires"
>;
export type PublicPolicy = Omit<
  PolicyRow,
  "owner" | "key_hash" | "allowed" | "denied"
> & { allowed: string[]; denied: string[]; enrolled: number };
export type RuntimeSummary = RuntimeRow & {
  name: string;
  role: string;
  status: string;
  organization: string;
  policy_label: string;
  policy_status: string;
};
export type NetworkData = {
  policies: PublicPolicy[];
  agents: RuntimeSummary[];
  permits: PermitRow[];
};
export type BrowserModelContext = {
  registerTool(
    tool: {
      name: string;
      description: string;
      inputSchema: object;
      annotations: object;
      execute(input: Record<string, unknown>): Promise<unknown>;
    },
    options: { signal: AbortSignal },
  ): unknown;
};

export type PassportDetail = {
  agent: import("./model").Agent;
  records: import("./model").WorkRecord[];
  identity: Seal;
};
