import { PublicShell } from "../public-shell";
import { policies, policyVersion } from "@/lib/policies";

export function PolicyNotice() {
  return (
    <aside className="policy-status" aria-label="Document status">
      <strong>Draft for review · {policyVersion}</strong>
      <p>
        Operator: Fisemarco OÜ, registry code 14933422, Energia tn 13a-19, Tallinn, Estonia (Kristiine district).
        Contact: hello@fisemarco.com. Supplier arrangements, retention schedules and hosted cookie inventory
        need verification. These documents are not a certification of compliance
        or final contractual terms.
      </p>
    </aside>
  );
}

export default function PolicyDocument({ policyKey }: { policyKey: string }) {
  const policy = policies[policyKey];
  return (
    <PublicShell>
      <main className="policy-page">
        <a className="public-text-link" href="/legal">
          ← Legal & trust centre
        </a>
        <header>
          <span className="public-eyebrow">Fisemarco / LEGAL & TRUST</span>
          <h1>{policy.title}</h1>
          <p className="policy-summary">{policy.summary}</p>
          <p className="policy-version">
            Updated draft: 13 October 2026 · Version {policyVersion} · Not yet
            effective contractual terms
          </p>
        </header>
        <PolicyNotice />
        <nav className="policy-contents" aria-label="On this page">
          <strong>On this page</strong>
          {policy.sections.map((s, i) => (
            <a key={s.title} href={`#section-${i + 1}`}>
              {i + 1}. {s.title}
            </a>
          ))}
        </nav>
        <div className="policy-body">
          {policy.sections.map((s, i) => (
            <section id={`section-${i + 1}`} key={s.title}>
              <h2>
                {i + 1}. {s.title}
              </h2>
              {s.paragraphs.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </section>
          ))}
        </div>
        <section className="policy-actions">
          <h2>Use your controls</h2>
          <p>
            <a href="/privacy">Export or erase passport data</a> ·{" "}
            <a href="/safety">Report a concern or track an appeal</a> ·{" "}
            <a href="/legal">All policies</a>
          </p>
          <p>
            Privacy and security contact: hello@fisemarco.com. Do not include
            private keys or sensitive documents in your initial message.
          </p>
        </section>
        <section className="policy-sources">
          <h2>Legal references</h2>
          <p>
            These sources informed the draft. Applicability depends on the
            service, processing and operator circumstances.
          </p>
          <ul>
            {policy.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url}>{s.title}</a>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </PublicShell>
  );
}
