"use client";
import type {
  PublicUser,
  PublicPolicy,
  RuntimeSummary,
  NetworkData,
} from "@/lib/client-types";
import { useState, useEffect, useCallback } from "react";
import {
  Fingerprint,
  ShieldCheck,
  KeyRound,
  Plus,
  ArrowUpRight,
  Copy,
  Download,
  RefreshCw,
  Radio,
  Pause,
  Play,
  Loader2,
  ShieldAlert,
  ArrowRight,
  Activity,
  Network,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelectOption } from "@/components/ui/native-select";
import { toast } from "sonner";
import { api, Field, SelectField } from "./passport-forms";
const date = (value: string) => new Date(value).toLocaleString();
const emptyData: NetworkData = { policies: [], agents: [], permits: [] };
function runtimeState(agent: RuntimeSummary, checkedAt: number) {
  if (agent.revoked) return "Revoked";
  if (!agent.last_seen) return "Not reporting";
  if (checkedAt - Date.parse(agent.last_seen) > 120000)
    return "Last seen >2 min";
  return agent.runtime_status;
}
export default function NetworkPanel({
  user,
  onOpenPassport,
}: {
  user: PublicUser | null;
  onOpenPassport: (code: string) => void;
}) {
  const [data, setData] = useState<NetworkData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState(0);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<Partial<PublicPolicy> | null>(null);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<
    | (
        | { type: "rotate" | "pause"; policy: PublicPolicy; agent?: never }
        | { type: "revoke"; agent: RuntimeSummary; policy?: never }
      )
    | null
  >(null);
  const [formError, setFormError] = useState("");
  const [keyReplacement, setKeyReplacement] = useState<RuntimeSummary | null>(
    null,
  );
  const [newPublicKey, setNewPublicKey] = useState("");
  const reload = useCallback(() => {
    if (!user) return Promise.resolve();
    return api<NetworkData>("enrollment-policies")
      .then((data) => {
        setData(data);
        setError("");
        setCheckedAt(Date.now());
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user]);
  useEffect(() => {
    reload();
    const timer = setInterval(reload, 30000);
    return () => clearInterval(timer);
  }, [reload]);
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied");
    } catch {
      toast.error("Select and copy the displayed text.");
    }
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    const f = new FormData(e.currentTarget);
    const body = {
      label: String(f.get("label")),
      organization: String(f.get("organization")),
      allowed: String(f.get("allowed"))
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      denied: String(f.get("denied"))
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      maxAgents: Number(f.get("maxAgents")),
      status: String(f.get("status") || "active"),
      revision: edit?.revision,
    };
    try {
      const d = await api<{ key: string }>(
        "enrollment-policies" + (edit?.id ? "/" + edit?.id : ""),
        { method: edit?.id ? "PATCH" : "POST", body: JSON.stringify(body) },
      );
      setEdit(null);
      if (d.key) setSecret(d.key);
      toast.success("Enrollment policy saved");
      await reload();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function act() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.type === "rotate") {
        const p = confirm.policy;
        const d = await api<{ key: string }>(
          `enrollment-policies/${p.id}/rotate`,
          {
            method: "POST",
            body: "{}",
          },
        );
        setSecret(d.key);
      } else if (confirm.type === "revoke") {
        await api(
          `enrollment-policies/${confirm.agent.policy_id}/revoke-agent`,
          {
            method: "POST",
            body: JSON.stringify({ agent: confirm.agent.agent }),
          },
        );
      } else {
        const p = confirm.policy;
        await api("enrollment-policies/" + p.id, {
          method: "PATCH",
          body: JSON.stringify({
            ...p,
            maxAgents: p.max_agents,
            status: p.status === "active" ? "paused" : "active",
          }),
        });
      }
      setConfirm(null);
      await reload();
      toast.success("Access policy updated");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function rekey(e: React.FormEvent) {
    e.preventDefault();
    if (!keyReplacement) return;
    setBusy(true);
    try {
      let publicKey;
      try {
        publicKey = JSON.parse(newPublicKey);
      } catch {
        throw new Error("Paste a valid public JWK JSON object.");
      }
      await api(`enrollment-policies/${keyReplacement.policy_id}/replace-key`, {
        method: "POST",
        body: JSON.stringify({ agent: keyReplacement.agent, publicKey }),
      });
      setKeyReplacement(null);
      setNewPublicKey("");
      await reload();
      toast.success("Signing key replaced; old key rejected");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const origin =
    typeof window === "undefined"
      ? "https://YOUR_FTAI_SITE"
      : window.location.origin;
  const code = `import { FTAIClient } from './ftai.mjs';\n\nconst agent = new FTAIClient({\n  baseUrl: '${origin}',\n  // Supply the enrollment key through your\n  // runtime's secret manager / environment.\n  externalId: 'research-agent-production',\n  name: 'Research agent',\n  role: 'Research analyst',\n  profile: { version: '1.0.0',\n    skills: ['research'] }\n});\n\nawait agent.init(); // enroll, sync, report\n\n// Use a stable UUID from your task queue.\nawait agent.runTask({\n  taskId: job.id,\n  title: 'Research report',\n  action: 'research'\n}, async ({ signal }) => {\n  return yourAgent.run(job, { signal });\n});`;
  return (
    <>
      <div className="eyebrow">AUTOMATIC IDENTITY · CONTROLLED ACCESS</div>
      <div className="page-heading">
        <div>
          <h1>
            Connect your agent fleet<span>.</span>
          </h1>
          <p>
            Register on startup. Check permission before work. Keep the
            professional record current.
          </p>
        </div>
        {user ? (
          <Button
            onClick={() => {
              setEdit({});
              setFormError("");
            }}
          >
            <Plus />
            Create enrollment policy
          </Button>
        ) : (
          <Button asChild>
            <a
              href="/signin-with-chatgpt?return_to=%2F%3Fview%3Dnetwork"
              target="_top"
            >
              Set up your organization
              <ArrowRight />
            </a>
          </Button>
        )}
      </div>
      <div className="network-flow">
        {(
          [
            [
              Fingerprint,
              "01",
              "Enroll automatically",
              "Organization key + agent key",
            ],
            [
              KeyRound,
              "02",
              "Prove identity",
              "Signed requests, replay protection",
            ],
            [
              ShieldCheck,
              "03",
              "Get a work permit",
              "Allowed action, active passport",
            ],
            [Activity, "04", "Record the outcome", "Version, result, evidence"],
          ] as const
        ).map(([Icon, n, title, desc]) => (
          <div key={n}>
            <Icon />
            <span>{n}</span>
            <h3>{title}</h3>
            <p>{desc}</p>
          </div>
        ))}
      </div>
      {!user && (
        <div className="network-public">
          <div>
            <Badge variant="outline">Public enrollment API</Badge>
            <h2>One integration. Automatic registration.</h2>
            <p>
              An operator creates an enrollment policy and adds its key to the
              agent runtime. The client then registers each identity and
              requests a permit before every wrapped task.
            </p>
          </div>
          <div>
            <strong>For participating runtimes</strong>
            <p>
              Agents and platforms must adopt this integration. Fisemarco cannot
              discover every agent, force unrelated software to enroll, or infer
              private histories it has never received.
            </p>
          </div>
        </div>
      )}
      {error && (
        <div className="error-box" role="alert">
          {error}
          <Button variant="outline" onClick={reload}>
            Retry
          </Button>
        </div>
      )}
      {user && (
        <>
          <div className="stats-grid">
            {[
              [
                "Enrollment policies",
                data.policies.length,
                "Organization-managed rules",
              ],
              [
                "Connected agents",
                data.agents.length,
                "Registered runtime identities",
              ],
              [
                "Recently seen",
                data.agents.filter(
                  (a) =>
                    !a.revoked &&
                    a.last_seen &&
                    checkedAt - Date.parse(a.last_seen) < 120000,
                ).length,
                "Reported within 2 minutes",
              ],
              [
                "Recent permits",
                data.permits.length,
                "Latest 50 work requests",
              ],
            ].map(([k, v, d]) => (
              <div className="stat" key={String(k)}>
                <span>{k}</span>
                <strong>{v}</strong>
                <small>{d}</small>
              </div>
            ))}
          </div>
          <div className="section-heading">
            <h2>Enrollment policies</h2>
            <Button variant="outline" disabled={loading} onClick={reload}>
              <RefreshCw className={loading ? "spin" : ""} />
              Refresh
            </Button>
          </div>
          {data.policies.length ? (
            <div className="policy-grid">
              {data.policies.map((p) => (
                <section className="panel policy-card" key={p.id}>
                  <div className="panel-heading">
                    <h2>{p.label}</h2>
                    <Badge
                      className={
                        "status " +
                        (p.status === "active" ? "active" : "suspended")
                      }
                      variant="outline"
                    >
                      {p.status}
                    </Badge>
                  </div>
                  <p>{p.organization}</p>
                  <div className="policy-capacity">
                    <strong>
                      {p.enrolled}
                      <small> / {p.max_agents} agents</small>
                    </strong>
                    <span>Policy revision {p.revision}</span>
                  </div>
                  <div className="skill-tags">
                    {p.allowed.map((a: string) => (
                      <Badge variant="secondary" key={a}>
                        {a}
                      </Badge>
                    ))}
                  </div>
                  <p className="small muted">
                    Enrollment key {p.key_prefix}… · expires{" "}
                    {new Date(p.key_expires).toLocaleDateString()}
                  </p>
                  <div className="policy-actions">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEdit(p);
                        setFormError("");
                      }}
                    >
                      Edit rules
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setConfirm({ type: "pause", policy: p })}
                    >
                      {p.status === "active" ? <Pause /> : <Play />}
                      {p.status === "active" ? "Pause work" : "Resume"}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setConfirm({ type: "rotate", policy: p })}
                    >
                      <KeyRound />
                      Rotate key
                    </Button>
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="small-empty">
              <Network />
              <h3>Give your runtimes an entry point.</h3>
              <p>
                Create a policy for an organization, choose allowed actions, and
                issue its first enrollment key.
              </p>
              <Button
                onClick={() => {
                  setEdit({});
                  setFormError("");
                }}
              >
                <Plus />
                Create enrollment policy
              </Button>
            </div>
          )}
          <div className="section-heading network-section">
            <h2>
              Connected runtime identities <span>{data.agents.length}</span>
            </h2>
            <span className="small muted">Refreshes every 30 seconds</span>
          </div>
          {data.agents.length ? (
            <div className="table-panel">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead>Organization policy</TableHead>
                    <TableHead>Reported runtime state</TableHead>
                    <TableHead>Passport</TableHead>
                    <TableHead>Key access</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.agents.map((a) => (
                    <TableRow key={a.agent}>
                      <TableCell>
                        <button
                          className="record-link"
                          onClick={() => onOpenPassport(a.agent)}
                        >
                          {a.name}
                          <small>{a.agent}</small>
                        </button>
                      </TableCell>
                      <TableCell>
                        {a.policy_label}
                        <small className="block muted">{a.organization}</small>
                      </TableCell>
                      <TableCell>
                        <span className="runtime-state">
                          <Radio size={13} />
                          {runtimeState(a, checkedAt)}
                        </span>
                        <small className="block muted">
                          {a.last_seen ? date(a.last_seen) : "No heartbeat yet"}
                        </small>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{a.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="key-actions">
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setKeyReplacement(a);
                              setNewPublicKey("");
                            }}
                          >
                            Replace key
                          </Button>
                          {!a.revoked && (
                            <Button
                              variant="ghost"
                              onClick={() =>
                                setConfirm({ type: "revoke", agent: a })
                              }
                            >
                              Revoke
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="small-empty">
              <Fingerprint />
              <h3>Waiting for your first runtime.</h3>
              <p>
                Once its operator installs the client and sets an enrollment
                key, the agent appears here automatically.
              </p>
            </div>
          )}
          <div className="section-heading network-section">
            <h2>Recent work permits</h2>
            <span className="small muted">
              Execution results are runtime-reported
            </span>
          </div>
          {data.permits.length ? (
            <div className="table-panel">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Work</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Issued</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.permits.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <button
                          className="record-link"
                          onClick={() => onOpenPassport(p.agent)}
                        >
                          {p.title}
                          <small>{p.agent}</small>
                        </button>
                      </TableCell>
                      <TableCell>{p.action}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {p.state === "issued" &&
                          p.expires < new Date().toISOString()
                            ? "expired"
                            : p.state}
                        </Badge>
                        {p.state === "started" && (
                          <small className="block muted">
                            Outcome pending; work may have stopped
                          </small>
                        )}
                      </TableCell>
                      <TableCell>{date(p.created)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="muted panel">No work permits have been requested.</p>
          )}
        </>
      )}
      <div className="network-section section-heading">
        <h2>Connect a runtime</h2>
        <div className="actions">
          <Button variant="outline" asChild>
            <a href="/sdk/ftai.mjs" download>
              <Download />
              Download Node.js client
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href="/runtime-protocol.md" target="_blank" rel="noreferrer">
              Protocol reference
              <ArrowUpRight />
            </a>
          </Button>
        </div>
      </div>
      <div className="api-layout">
        <section className="code-panel">
          <div>
            <span>Node.js 22+ · Works with any task function</span>
            <button
              aria-label="Copy integration code"
              onClick={() => copy(code)}
            >
              <Copy size={15} />
            </button>
          </div>
          <pre>{code}</pre>
        </section>
        <section className="panel">
          <h3>One-time operator setup</h3>
          <ol className="help-list numbered">
            <li>
              Create a policy with the organization name and exact allowed
              actions.
            </li>
            <li>
              Store its enrollment key as <code>FTAI_ENROLLMENT_KEY</code> in
              the runtime’s secret manager.
            </li>
            <li>
              Download the client and give each agent a stable{" "}
              <code>externalId</code> and persistent state directory.
            </li>
            <li>
              Call <code>init()</code> on startup. Route every task through{" "}
              <code>runTask()</code>.
            </li>
            <li>
              Pass known historical records through <code>history</code>.
              Imported claims remain labeled as reported history.
            </li>
          </ol>
          <div className="form-note">
            <ShieldAlert size={18} />
            <p>
              The work gate applies to integrated code paths. Enforce it in your
              scheduler or tool gateway so an agent cannot bypass the wrapper.
              Never give the language model access to the organization
              enrollment secret.
            </p>
          </div>
          <p className="small muted" style={{ marginTop: 16 }}>
            The client sends identity metadata, status and outcome summaries. It
            does not read private files, infer ownership, or upload task inputs
            and outputs automatically.
          </p>
        </section>
      </div>
      <Dialog open={!!edit} onOpenChange={(v) => !v && !busy && setEdit(null)}>
        <DialogContent className="form-dialog">
          <DialogHeader>
            <DialogTitle>
              {edit?.id ? "Edit enrollment policy" : "Create enrollment policy"}
            </DialogTitle>
            <DialogDescription>
              Agents enroll under this organization and inherit the allowed
              actions. The organization name is owner-declared.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save}>
            <div className="form-scroll">
              <Field
                label="Policy name"
                name="label"
                required
                defaultValue={edit?.label}
                maxLength={80}
                placeholder="e.g. Production research agents"
              />
              <Field
                label="Organization"
                name="organization"
                required
                readOnly={!!edit?.id}
                defaultValue={edit?.organization}
                maxLength={200}
              />
              <Field
                label="Allowed actions"
                name="allowed"
                required
                defaultValue={edit?.allowed?.join(", ")}
                placeholder="research, draft-report"
                hint="Exact, case-sensitive action names, separated by commas. New actions also need approval in each agent’s passport."
              />
              <Field
                label="Denied actions"
                name="denied"
                defaultValue={edit?.denied?.join(", ")}
                placeholder="transfer-money, delete-records"
                hint="Denials override allowances."
              />
              <div className="form-grid">
                <Field
                  label="Maximum enrolled agents"
                  name="maxAgents"
                  required
                  type="number"
                  min={1}
                  max={10000}
                  defaultValue={edit?.max_agents || 100}
                />
                <SelectField
                  label="Policy status"
                  name="status"
                  defaultValue={edit?.status || "active"}
                >
                  <NativeSelectOption value="active">Active</NativeSelectOption>
                  <NativeSelectOption value="paused">
                    Paused — block new work
                  </NativeSelectOption>
                </SelectField>
              </div>
              <div className="form-note">
                New passports are always private. Enrollment keys expire in 90
                days. Pausing a policy blocks new enrollment and work permits
                for its entire fleet.
              </div>
            </div>
            {formError && (
              <div className="error-box" role="alert">
                {formError}
              </div>
            )}
            <div className="dialog-actions">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setEdit(null)}
              >
                Cancel
              </Button>
              <Button disabled={busy}>
                {busy && <Loader2 className="spin" />}Save policy
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!secret} onOpenChange={(v) => !v && setSecret("")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save your enrollment key</DialogTitle>
            <DialogDescription>
              Shown once. Keep it in the operator’s secret manager. It can
              register agents under this policy.
            </DialogDescription>
          </DialogHeader>
          <Textarea readOnly aria-label="Enrollment key" value={secret} />
          <Button onClick={() => copy(secret)}>
            <Copy />
            Copy enrollment key
          </Button>
          <p className="small muted">
            Set FTAI_ENROLLMENT_KEY in your runtime environment. Registered
            agents subsequently authenticate with their own private keys.
          </p>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!confirm}
        onOpenChange={(v) => !v && !busy && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.type === "rotate"
                ? "Rotate the enrollment key?"
                : confirm?.type === "revoke"
                  ? "Revoke this runtime key?"
                  : confirm?.policy?.status === "active"
                    ? "Pause this fleet’s work?"
                    : "Resume this fleet’s work?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.type === "rotate"
                ? "The previous enrollment key stops working immediately. Already registered agents retain their individual identities."
                : confirm?.type === "revoke"
                  ? "The current key will no longer authenticate. Keep the same passport by using Replace key after generating a new key in the runtime."
                  : "New work permits follow this policy immediately. Already running code can only be interrupted if its runtime respects cancellation."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button disabled={busy} onClick={act}>
              {busy && <Loader2 className="spin" />}Confirm
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={!!keyReplacement}
        onOpenChange={(v) => !v && !busy && setKeyReplacement(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace the agent’s signing key</DialogTitle>
            <DialogDescription>
              Preserve the personnel code. Generate a replacement using
              prepareKeyRotation() in the client, then paste only its public JWK
              here.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={rekey}>
            <Textarea
              aria-label="New public key"
              value={newPublicKey}
              onChange={(e) => setNewPublicKey(e.target.value)}
              placeholder={'{"kty":"OKP","crv":"Ed25519","x":"…"}'}
              required
            />
            <p className="small muted">
              After saving, call activateKeyRotation() in the runtime. The old
              key stops working immediately.
            </p>
            <div className="dialog-actions">
              <Button disabled={busy}>Replace key</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
