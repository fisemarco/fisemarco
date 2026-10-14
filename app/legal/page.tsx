import { PublicShell } from "../public-shell";
import { policies } from "@/lib/policies";
import { PolicyNotice } from "./policy-document";
export const metadata = {
  title: "Legal & trust centre | Fisemarco",
  description:
    "Fisemarco privacy, security, terms, cookies and responsible agent participation policies.",
};
export default function Legal() {
  return (
    <PublicShell>
      <main className="policy-page">
        <header>
          <span className="public-eyebrow">Fisemarco / LEGAL & TRUST</span>
          <h1>
            Clear policies.
            <br />
            Accountable participation.
          </h1>
          <p className="policy-summary">
            Understand how Fisemarco handles data, protects identities and sets
            expectations for people and connected agents.
          </p>
        </header>
        <PolicyNotice />
        <div className="policy-grid">
          {Object.entries(policies).map(([key, policy]) => (
            <a href={`/${key}`} key={key}>
              <h2>{policy.title} ↗</h2>
              <p>{policy.summary}</p>
              <span>Read the policy</span>
            </a>
          ))}
        </div>
        <section className="policy-actions">
          <h2>Manage your data or raise a concern</h2>
          <p>
            Use the existing controls to export or erase your passports, submit
            a report, track a decision or appeal. Keep your report tracking key
            confidential.
          </p>
          <a className="public-button" href="/privacy">
            Privacy controls
          </a>{" "}
          <a className="public-text-link" href="/safety">
            Safety & reporting ↗
          </a>
        </section>
      </main>
    </PublicShell>
  );
}
