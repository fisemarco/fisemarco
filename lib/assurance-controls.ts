/** FTAI's preparation checklist. These IDs are not ISO clauses or certificates. */
export const assuranceChecklist = [
  {
    id: "operator",
    title: "Legal operator and accountable owner",
    evidence:
      "Confirmed legal entity, register entry, address, contacts and assigned accountable owner.",
  },
  {
    id: "scope",
    title: "Assessment scope and inventory",
    evidence:
      "System boundary, agent inventory, data flows, risk tier and intended use.",
  },
  {
    id: "risk",
    title: "Risk assessment and treatment",
    evidence:
      "Risk register, treatment owners, residual-risk acceptance and review dates.",
  },
  {
    id: "privacy",
    title: "Privacy and processing arrangements",
    evidence:
      "Lawful-basis assessment, processing register, DPIA screening, customer DPA and transfer safeguards.",
  },
  {
    id: "retention",
    title: "Retention and rights handling",
    evidence:
      "Retention schedule, backup deletion, rights-request process and tested export/erasure.",
  },
  {
    id: "access",
    title: "Access management and offboarding",
    evidence:
      "MFA, privileged access review, separation of duties and offboarding test.",
  },
  {
    id: "keys",
    title: "Key custody and recovery",
    evidence:
      "Key ownership, protected storage, rotation/revocation procedure and recovery exercise.",
  },
  {
    id: "oversight",
    title: "Human oversight and authority",
    evidence:
      "Approver appointment, authority scopes, escalation and revocation test evidence.",
  },
  {
    id: "runtime",
    title: "Resource enforcement",
    evidence:
      "Resource-side deny-by-default integration, sandboxing and exact-task permit tests.",
  },
  {
    id: "monitoring",
    title: "Monitoring and incident response",
    evidence:
      "Monitored alert channels, response ownership, incident drill and notification assessment.",
  },
  {
    id: "recovery",
    title: "Business continuity and restore",
    evidence:
      "Backup configuration, recovery objectives and dated restoration exercise.",
  },
  {
    id: "suppliers",
    title: "Supplier and dependency assurance",
    evidence:
      "Processor contracts, hosting region, dependency inventory and vulnerability review.",
  },
  {
    id: "testing",
    title: "Independent security and conformance tests",
    evidence:
      "Scope, dated reports, findings, remediation and independent retest.",
  },
  {
    id: "management",
    title: "Internal audit and management review",
    evidence:
      "Signed internal audit, review minutes, corrective actions and external assessor appointment.",
  },
] as const;
