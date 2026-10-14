"use client";
import { useState } from "react";
import {
  decide,
  policySchema,
  stepSchema,
  type Capability,
} from "@/lib/intelligence-engine";
const tools = [
  "crm.account",
  "crm.buyer",
  "calendar.schedule",
  "accounting.invoice",
];
const policy = policySchema.parse({
  mode: "enforce",
  allowedTools: tools,
  models: [
    {
      id: "example-local",
      provider: "example",
      tier: "local",
      quality: 0.98,
      taskTypes: ["generation", "classification"],
      region: "FI",
      external: false,
    },
    {
      id: "example-frontier",
      provider: "example",
      tier: "frontier",
      quality: 0.99,
      taskTypes: ["reasoning", "planning"],
      region: "FI",
      external: true,
    },
  ],
});
const capability: Capability = {
  id: "lead.score",
  version: 1,
  description: "Validated example lead scoring",
  taskTypes: ["classification"],
  aliases: ["score lead"],
  quality: 0.98,
  permissions: ["sales.read"],
  risk: "low",
  status: "validated",
  method: "lead.score",
  inputSchema: {},
  outputSchema: {},
  source: "Illustrative fixture",
};
const steps = [
  { intent: "Find target account", tool: { id: tools[0], quality: 1 } },
  { intent: "Find buyer", tool: { id: tools[1], quality: 1 } },
  {
    intent: "Check existing relationship",
    context: [
      {
        id: "relationship",
        kind: "episodic",
        bytes: 100,
        relevant: true,
        sensitive: false,
        validated: true,
        answer: true,
      },
    ],
  },
  { intent: "Score lead", capability: "lead.score" },
  { intent: "Generate initial outreach", localConfidence: 0.98 },
  { intent: "Handle unusual objection", novel: true, complex: true },
  { intent: "Schedule follow-up", tool: { id: tools[2], quality: 1 } },
];
export function StepExplorer() {
  const [selected, setSelected] = useState(0);
  const decisions = steps.map((s, i) =>
    decide(
      stepSchema.parse({
        ...s,
        stepId: "sales-" + i,
        action: "sales.read",
        resource: "example-account",
        availableModels: ["example-local", "example-frontier"],
      }),
      policy,
      [capability],
    ),
  );
  const d = decisions[selected];
  const external = decisions.filter((x) => x.requires_external_llm).length;
  return (
    <div className="icp-explorer">
      <div
        className="icp-step-list"
        role="group"
        aria-label="Select a sales workflow step"
      >
        {steps.map((s, i) => (
          <button
            key={s.intent}
            aria-pressed={i === selected}
            onClick={() => setSelected(i)}
          >
            <small>0{i + 1}</small>
            <span>{s.intent}</span>
            <b>{decisions[i].recommended_route}</b>
          </button>
        ))}
      </div>
      <div className="icp-step-detail" aria-live="polite">
        <span className="public-eyebrow">EXAMPLE / STEP 0{selected + 1}</span>
        <h3>{steps[selected].intent}</h3>
        <dl>
          <div>
            <dt>Task type</dt>
            <dd>{d.task_type}</dd>
          </div>
          <div>
            <dt>Route</dt>
            <dd>{d.recommended_route}</dd>
          </div>
          <div>
            <dt>External model</dt>
            <dd>{d.requires_external_llm ? "Required" : "Not required"}</dd>
          </div>
          <div>
            <dt>Why this route</dt>
            <dd>{d.reason_codes.join(" · ")}</dd>
          </div>
          <div>
            <dt>Quality requirement</dt>
            <dd>{(d.required_quality * 100).toFixed(0)}% declared threshold</dd>
          </div>
        </dl>
        <div className="icp-demo-totals">
          <strong>
            {decisions.length}
            <small>example steps</small>
          </strong>
          <strong>
            {external}
            <small>external routes</small>
          </strong>
          <strong>
            {((100 * external) / decisions.length).toFixed(1)}%
            <small>example dependency</small>
          </strong>
        </div>
        <small>
          Derived from example resource declarations. Routing recommendations,
          not model invocations or measured savings.
        </small>
      </div>
    </div>
  );
}

export function Architecture() {
  const examples = [
    {
      label: "Invoice status",
      intent: "Check invoice status",
      tool: { id: "accounting.invoice", quality: 1 },
    },
    {
      label: "Support ticket",
      intent: "Classify support ticket",
      localConfidence: 0.98,
    },
    {
      label: "Acquisition strategy",
      intent: "Plan acquisition strategy",
      complex: true,
      novel: true,
    },
  ];
  const [selected, setSelected] = useState(0);
  const result = decide(
    stepSchema.parse({
      ...(({ label, ...step }) => {
        void label;
        return step;
      })(examples[selected]),
      stepId: "hero",
      action: "sales.read",
      resource: "example",
      availableModels: ["example-local", "example-frontier"],
    }),
    policy,
  );
  return (
    <div
      className="icp-architecture"
      aria-label="Agent step routing architecture"
    >
      <span>YOUR EXISTING AGENT</span>
      <b>↓</b>
      <strong>Fisemarco INTELLIGENCE CONTROL</strong>
      <p>What does this step actually need?</p>
      <div
        className="icp-hero-examples"
        role="group"
        aria-label="Choose a routing example"
      >
        {examples.map((e, i) => (
          <button
            key={e.label}
            aria-pressed={i === selected}
            onClick={() => setSelected(i)}
          >
            {e.label}
          </button>
        ))}
      </div>
      <p aria-live="polite">
        {examples[selected].intent} →{" "}
        <strong>{result.recommended_route}</strong>
      </p>
      <b>↓</b>
      <div>
        {[
          "Rules",
          "Context / memory",
          "Tools",
          "Capabilities",
          "Local AI",
          "Private AI",
          "Cloud AI",
          "Frontier AI",
          "Human",
        ].map((label, i) => (
          <span
            className={
              result.recommended_tier === i ? "icp-route-selected" : ""
            }
            key={label}
          >
            <small>0{i}</small>
            {label}
          </span>
        ))}
      </div>
      <small>Illustrative routing; no providers are called.</small>
      <p>
        <small>
          Policy → safety → quality → privacy → reliability → latency → cost
        </small>
      </p>
    </div>
  );
}
