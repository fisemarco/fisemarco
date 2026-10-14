"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, ShieldCheck } from "lucide-react";
import { kinds, type Agent, type WorkRecord } from "@/lib/model";
export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
) {
  const res = await fetch("/api/v1/" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data: unknown = await res.json();
  if (!res.ok)
    throw new Error(
      data &&
        typeof data === "object" &&
        "error" in data &&
        typeof data.error === "string"
        ? data.error
        : "Unable to complete this request.",
    );
  return data as T;
}
export function Field({
  label,
  name,
  defaultValue,
  required = false,
  type = "text",
  hint,
  ...rest
}: React.ComponentProps<typeof Input> & {
  label: string;
  name: string;
  hint?: string;
}) {
  return (
    <div className="field">
      <Label htmlFor={name}>
        {label}
        {required && <span className="required">*</span>}
      </Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        {...rest}
      />
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function SelectField({
  label,
  name,
  children,
  defaultValue,
  ...rest
}: React.ComponentProps<typeof NativeSelect> & {
  label: string;
  name: string;
}) {
  return (
    <div className="field">
      <Label htmlFor={name}>{label}</Label>
      <NativeSelect id={name} name={name} defaultValue={defaultValue} {...rest}>
        {children}
      </NativeSelect>
    </div>
  );
}
const split = (s: FormDataEntryValue | null) =>
  String(s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
export function PassportForm({
  agent,
  onClose,
  onSaved,
}: {
  agent?: Agent;
  onClose: () => void;
  onSaved: (a: Agent) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (key: string) => String(f.get(key) || "");
    setBusy(true);
    setError("");
    try {
      const body = {
        name: v("name"),
        role: v("role"),
        organization: v("organization"),
        status: v("status") || "active",
        visibility: v("visibility") || "private",
        revision: agent?.revision,
        profile: {
          description: v("description"),
          creator: v("creator"),
          operator: v("operator"),
          model: v("model"),
          version: v("version"),
          skills: split(f.get("skills")),
          allowed: split(f.get("allowed")),
          denied: split(f.get("denied")),
          externalDid: v("externalDid"),
          endpoint: v("endpoint"),
        },
      };
      const data = await api<{ agent: Agent }>(
        agent ? "agents/" + agent.code : "agents",
        {
          method: agent ? "PATCH" : "POST",
          body: JSON.stringify(body),
        },
      );
      onSaved(data.agent);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="form-dialog">
        <DialogHeader>
          <span className="eyebrow">Fisemarco PROFESSIONAL REGISTRY</span>
          <DialogTitle>
            {agent ? "Edit passport" : "Create an agent passport"}
          </DialogTitle>
          <DialogDescription>
            {agent
              ? "Changes are saved as a signed identity update. Your personnel code stays the same."
              : "Give an AI agent a permanent personnel code. You can build its professional record over time."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <div className="form-scroll">
            <div className="form-section-label">01 / IDENTITY</div>
            <div className="form-grid">
              <Field
                label="Agent name"
                name="name"
                required
                maxLength={200}
                defaultValue={agent?.name}
                placeholder="e.g. Atlas"
              />
              <Field
                label="Professional role"
                name="role"
                required
                maxLength={200}
                defaultValue={agent?.role}
                placeholder="e.g. Research analyst"
              />
              <Field
                label="Owning organization"
                name="organization"
                required
                maxLength={200}
                defaultValue={agent?.organization}
                placeholder="Your organization"
              />
              <Field
                label="Creator"
                name="creator"
                maxLength={200}
                defaultValue={agent?.profile.creator}
                placeholder="Who built this agent?"
              />
            </div>
            <div className="field">
              <Label htmlFor="description">About the agent</Label>
              <Textarea
                id="description"
                name="description"
                maxLength={2000}
                defaultValue={agent?.profile.description}
                placeholder="Responsibilities, scope, and where this agent is most useful."
              />
            </div>
            <div className="form-section-label">
              02 / CAPABILITIES & TECHNOLOGY
            </div>
            <div className="form-grid">
              <Field
                label="Operator"
                name="operator"
                maxLength={200}
                defaultValue={agent?.profile.operator}
              />
              <Field
                label="Model / runtime"
                name="model"
                maxLength={200}
                defaultValue={agent?.profile.model}
                placeholder="Model and runtime name"
              />
              <Field
                label="Current version"
                name="version"
                maxLength={200}
                defaultValue={agent?.profile.version}
                placeholder="1.0.0"
              />
              <Field
                label="Agent endpoint"
                name="endpoint"
                type="url"
                defaultValue={agent?.profile.endpoint}
                placeholder="https://…"
              />
            </div>
            <Field
              label="Capabilities"
              name="skills"
              defaultValue={agent?.profile.skills.join(", ")}
              placeholder="Research, data analysis, report writing"
              hint="Separate each capability with a comma. Capabilities are owner-declared."
            />
            <Field
              label="External DID (optional)"
              name="externalDid"
              defaultValue={agent?.profile.externalDid}
              placeholder="did:…"
              hint="An external identity reference. Control of this DID is not verified by FTAI."
            />
            <div className="form-section-label">03 / AUTHORITY & ACCESS</div>
            <Field
              label="Allowed actions"
              name="allowed"
              defaultValue={agent?.profile.allowed.join(", ")}
              placeholder="Read documents, draft reports"
              hint="Separate actions with commas. Authority must also be enforced in the agent’s runtime."
            />
            <Field
              label="Prohibited actions"
              name="denied"
              defaultValue={agent?.profile.denied.join(", ")}
              placeholder="Transfer funds, delete records"
            />
            <div className="form-grid">
              <SelectField
                label="Passport visibility"
                name="visibility"
                defaultValue={agent?.visibility || "private"}
              >
                <NativeSelectOption value="private">
                  Private — only your workspace
                </NativeSelectOption>
                <NativeSelectOption value="shared">
                  Listed — public profile, passport requires sign-in
                </NativeSelectOption>
              </SelectField>
              {agent && (
                <SelectField
                  label="Lifecycle status"
                  name="status"
                  defaultValue={agent.status}
                >
                  <NativeSelectOption value="active">Active</NativeSelectOption>
                  <NativeSelectOption value="suspended">
                    Suspended
                  </NativeSelectOption>
                  <NativeSelectOption value="retired">
                    Retired
                  </NativeSelectOption>
                </SelectField>
              )}
            </div>
            <div className="form-note">
              <ShieldCheck size={18} />
              <p>
                Registration links this passport to your signed-in account.
                Organization ownership and capabilities remain owner-declared.
                Listed profile summaries are searchable publicly. Signed-in
                visitors can open the complete passport and evidence links.
                Private passports remain visible only to your workspace.
              </p>
            </div>
          </div>
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          <div className="dialog-actions">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button disabled={busy}>
              {busy && <Loader2 className="spin" />}
              {agent ? "Save changes" : "Create passport"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function RecordForm({
  agent,
  records,
  initialKind = "employment",
  onClose,
  onSaved,
}: {
  agent: Agent;
  records: WorkRecord[];
  initialKind?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState(initialKind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [intervention, setIntervention] = useState(false);
  const [id, setId] = useState(() => crypto.randomUUID());
  const [bodyKey, setBodyKey] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input: Record<string, FormDataEntryValue | number | boolean> = {
      ...Object.fromEntries(f),
      kind,
    };
    ["durationSeconds", "score", "samples", "rating"].forEach((k) => {
      if (k in input) input[k] = Number(input[k]);
    });
    if (kind === "task") input.intervention = intervention;
    const content = JSON.stringify(input);
    const requestId = bodyKey && bodyKey !== content ? crypto.randomUUID() : id;
    setId(requestId);
    setBodyKey(content);
    input.id = requestId;
    setBusy(true);
    setError("");
    try {
      await api(`agents/${agent.code}/records`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const jobs = records.filter((r) => r.kind === "employment" && !r.withdrawn);
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="form-dialog">
        <DialogHeader>
          <span className="eyebrow">{agent.code}</span>
          <DialogTitle>Add to the professional record</DialogTitle>
          <DialogDescription>
            Each entry is timestamped and signed. Corrections preserve the
            original record.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <div className="form-scroll">
            <SelectField
              label="Record type"
              name="kind"
              value={kind}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                setKind(e.target.value);
                setError("");
              }}
            >
              {Object.entries(kinds)
                .filter(
                  ([k]) =>
                    ![
                      "profile",
                      "correction",
                      "history_import",
                      "runtime_access",
                    ].includes(k),
                )
                .map(([k, v]) => (
                  <NativeSelectOption key={k} value={k}>
                    {v}
                  </NativeSelectOption>
                ))}
            </SelectField>
            <Field
              label="Record title"
              name="title"
              required
              maxLength={200}
              placeholder={
                kind === "task"
                  ? "e.g. Completed Q3 market analysis"
                  : "A concise description of this record"
              }
            />
            <div className="form-grid" key={kind}>
              {kind === "employment" && (
                <>
                  <Field
                    label="Employer"
                    name="employer"
                    required
                    defaultValue={agent.organization}
                  />
                  <Field
                    label="Role"
                    name="role"
                    required
                    defaultValue={agent.role}
                  />
                  <Field
                    label="Start date"
                    name="startDate"
                    required
                    type="date"
                  />
                  <Field
                    label="End date (optional)"
                    name="endDate"
                    type="date"
                  />
                  <Field
                    label="Compensation (optional)"
                    name="compensation"
                    placeholder="e.g. €800 / month"
                  />
                </>
              )}
              {kind === "employment_end" && (
                <>
                  <SelectField
                    label="Employment to close"
                    name="employmentId"
                    required
                  >
                    <NativeSelectOption value="">
                      Choose employment
                    </NativeSelectOption>
                    {jobs
                      .filter(
                        (j) =>
                          !j.payload.endDate &&
                          !records.some(
                            (r) =>
                              r.kind === "employment_end" &&
                              !r.withdrawn &&
                              r.payload.employmentId === j.id,
                          ),
                      )
                      .map((j) => (
                        <NativeSelectOption key={j.id} value={j.id}>
                          {j.payload.employer} — {j.payload.role}
                        </NativeSelectOption>
                      ))}
                  </SelectField>
                  <Field label="End date" name="endDate" required type="date" />
                </>
              )}
              {kind === "task" && (
                <>
                  <SelectField label="Outcome" name="outcome">
                    <NativeSelectOption value="success">
                      Successful
                    </NativeSelectOption>
                    <NativeSelectOption value="partial">
                      Partially successful
                    </NativeSelectOption>
                    <NativeSelectOption value="failed">
                      Failed
                    </NativeSelectOption>
                  </SelectField>
                  <Field
                    label="Duration (seconds)"
                    name="durationSeconds"
                    required
                    type="number"
                    min={0}
                    max={31536000}
                  />
                  <SelectField label="Employment record" name="employmentId">
                    <NativeSelectOption value="">Unassigned</NativeSelectOption>
                    {jobs.map((j) => (
                      <NativeSelectOption key={j.id} value={j.id}>
                        {j.payload.employer} — {j.payload.role}
                      </NativeSelectOption>
                    ))}
                  </SelectField>
                  <Field
                    label="Agent version"
                    name="version"
                    required
                    defaultValue={agent.profile.version}
                  />
                  <label className="check-field">
                    <Checkbox
                      checked={intervention}
                      onCheckedChange={(v) => setIntervention(v === true)}
                    />
                    Human intervention was needed
                  </label>
                </>
              )}
              {kind === "benchmark" && (
                <>
                  <Field label="Evaluation suite" name="suite" required />
                  <Field
                    label="Score (0–100)"
                    name="score"
                    required
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                  />
                  <Field
                    label="Number of samples"
                    name="samples"
                    required
                    type="number"
                    min={1}
                    max={100000000}
                  />
                  <Field
                    label="Agent version"
                    name="version"
                    required
                    defaultValue={agent.profile.version}
                  />
                </>
              )}
              {kind === "credential" && (
                <>
                  <Field label="Credential issuer" name="issuer" required />
                  <Field label="Credential reference" name="credentialId" />
                  <Field
                    label="Issue date"
                    name="issued"
                    required
                    type="date"
                  />
                  <Field
                    label="Expiry date (optional)"
                    name="expires"
                    type="date"
                  />
                </>
              )}
              {kind === "incident" && (
                <>
                  <SelectField label="Severity" name="severity">
                    {["low", "medium", "high", "critical"].map((v) => (
                      <NativeSelectOption key={v} value={v}>
                        {v}
                      </NativeSelectOption>
                    ))}
                  </SelectField>
                  <SelectField label="Resolution" name="state">
                    <NativeSelectOption value="open">Open</NativeSelectOption>
                    <NativeSelectOption value="resolved">
                      Resolved
                    </NativeSelectOption>
                  </SelectField>
                  <Field
                    label="Agent version"
                    name="version"
                    required
                    defaultValue={agent.profile.version}
                  />
                </>
              )}
              {kind === "incident_resolution" && (
                <SelectField
                  label="Incident to resolve"
                  name="incidentId"
                  required
                >
                  <NativeSelectOption value="">
                    Choose an open incident
                  </NativeSelectOption>
                  {records
                    .filter(
                      (r) =>
                        r.kind === "incident" &&
                        !r.withdrawn &&
                        r.payload.state !== "resolved" &&
                        !records.some(
                          (e) =>
                            e.kind === "incident_resolution" &&
                            !e.withdrawn &&
                            e.payload.incidentId === r.id,
                        ),
                    )
                    .map((r) => (
                      <NativeSelectOption key={r.id} value={r.id}>
                        {r.title}
                      </NativeSelectOption>
                    ))}
                </SelectField>
              )}
              {kind === "version" && (
                <>
                  <Field label="Version" name="version" required />
                  <Field
                    label="Model / runtime"
                    name="model"
                    required
                    defaultValue={agent.profile.model}
                  />
                </>
              )}
              {kind === "review" && (
                <>
                  <Field label="Employer" name="employer" required />
                  <Field
                    label="Rating (1–5)"
                    name="rating"
                    required
                    type="number"
                    min={1}
                    max={5}
                    step="0.1"
                  />
                  <SelectField
                    label="Employment record"
                    name="employmentId"
                    required
                  >
                    <NativeSelectOption value="">
                      Choose employment
                    </NativeSelectOption>
                    {jobs.map((j) => (
                      <NativeSelectOption key={j.id} value={j.id}>
                        {j.payload.employer} — {j.payload.role}
                      </NativeSelectOption>
                    ))}
                  </SelectField>
                </>
              )}
            </div>
            <div className="form-section-label">SUPPORTING EVIDENCE</div>
            <Field
              label="Evidence URL"
              name="evidenceUrl"
              type="url"
              placeholder="https://…"
              hint="Link to an accessible evaluation, task receipt, or document. FTAI does not fetch or independently review this link."
            />
            <Field
              label="Evidence SHA-256 (optional)"
              name="evidenceHash"
              pattern="[a-fA-F0-9]{64}"
              placeholder="64-character file hash"
              hint="A fingerprint that lets a reviewer check an original evidence file."
            />
            <div className="field">
              <Label htmlFor="notes">Context & notes</Label>
              <Textarea
                id="notes"
                name="notes"
                maxLength={4000}
                placeholder="Methodology, results, limitations, or relevant context."
              />
            </div>
            <p className="form-note">
              This will be labeled owner-reported. An attached link or a valid
              signature does not make a claim independently verified.
            </p>
          </div>
          {error && (
            <div role="alert" className="error-box">
              {error}
            </div>
          )}
          <div className="dialog-actions">
            <Button
              variant="outline"
              type="button"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button disabled={busy}>
              {busy && <Loader2 className="spin" />}Save signed record
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
