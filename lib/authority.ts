import { z } from "zod";
const labels = z.array(z.string().trim().min(1).max(120)).min(1).max(30);
export const constraintsSchema = z
  .object({
    actions: labels,
    resources: labels,
    countries: z
      .array(z.string().regex(/^[A-Z]{2}$/))
      .min(1)
      .max(30),
    currency: z.string().regex(/^[A-Z]{3}$/),
    maxAmountMinor: z.number().int().min(0).max(1_000_000_000_000),
    approvalAboveMinor: z.number().int().min(0).max(1_000_000_000_000),
    mayDelegate: z.boolean(),
    requireApproval: z.boolean().default(false),
  })
  .strict()
  .refine(
    (v) => v.approvalAboveMinor <= v.maxAmountMinor,
    "Approval threshold must not exceed the maximum.",
  );
export type Constraints = z.infer<typeof constraintsSchema>;
export const actionSchema = z
  .object({
    action: z.string().min(1).max(120),
    resource: z.string().min(1).max(120),
    country: z.string().regex(/^[A-Z]{2}$/),
    currency: z.string().regex(/^[A-Z]{3}$/),
    amountMinor: z.number().int().min(0).max(1_000_000_000_000),
  })
  .strict();
export type Grant = {
  id: string;
  organisation: string;
  parent: string | null;
  subject: string;
  constraints: string;
  expires: string;
  revoked: number;
  created: string;
  receipt: string;
};
export function attenuates(parent: Constraints, child: Constraints) {
  return (
    parent.mayDelegate &&
    (!parent.requireApproval || child.requireApproval) &&
    child.currency === parent.currency &&
    child.maxAmountMinor <= parent.maxAmountMinor &&
    child.approvalAboveMinor <= parent.approvalAboveMinor &&
    child.actions.every((v) => parent.actions.includes(v)) &&
    child.resources.every((v) => parent.resources.includes(v)) &&
    child.countries.every((v) => parent.countries.includes(v))
  );
}
export function inspectChain(chain: Grant[], now = Date.now()) {
  if (!chain.length || chain.length > 8)
    return "A complete chain of at most eight grants is required.";
  const seen = new Set<string>();
  for (let i = 0; i < chain.length; i++) {
    const g = chain[i];
    if (seen.has(g.id)) return "Delegation cycle detected.";
    seen.add(g.id);
    if (
      g.revoked ||
      !Number.isFinite(Date.parse(g.expires)) ||
      Date.parse(g.expires) <= now
    )
      return "A grant in the chain is revoked or expired.";
    if (!constraintsSchema.safeParse(JSON.parse(g.constraints)).success)
      return "Invalid constraints.";
    const parent = chain[i + 1];
    if (g.parent) {
      if (
        !parent ||
        parent.id !== g.parent ||
        parent.organisation !== g.organisation
      )
        return "A trusted parent is missing.";
      if (
        Date.parse(g.expires) > Date.parse(parent.expires) ||
        !attenuates(JSON.parse(parent.constraints), JSON.parse(g.constraints))
      )
        return "Child authority exceeds its parent.";
    } else if (parent) return "Unexpected parent after root.";
  }
  return null;
}
export function evaluateAuthority(
  chain: Grant[],
  request: z.infer<typeof actionSchema>,
  now = Date.now(),
) {
  const error = inspectChain(chain, now);
  if (error) return { decision: "DENY" as const, reason: error };
  const c: Constraints = JSON.parse(chain[0].constraints);
  if (
    !c.actions.includes(request.action) ||
    !c.resources.includes(request.resource) ||
    !c.countries.includes(request.country) ||
    c.currency !== request.currency ||
    request.amountMinor > c.maxAmountMinor
  )
    return {
      decision: "DENY" as const,
      reason: "The requested action is outside the delegated constraints.",
    };
  if (c.requireApproval || request.amountMinor > c.approvalAboveMinor)
    return {
      decision: "ESCALATE" as const,
      reason:
        "Human approval is required. This response does not authorize execution.",
    };
  return {
    decision: "ALLOW" as const,
    reason:
      "The declared authority chain permits this request. Resource-local controls and a runtime permit still apply.",
  };
}
