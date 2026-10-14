"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type {
  PublicUser,
  Seal,
  Verification,
  ApiKey,
  PassportDetail,
  BrowserModelContext,
} from "@/lib/client-types";
import type { LucideIcon } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import IdentityDocument from "./identity-document";
import BrandMark from "./brand-mark";
import { PassportGate } from "./public-shell";
import NetworkPanel from "./network-panel";
import {
  Fingerprint,
  LayoutGrid,
  BriefcaseBusiness,
  ShieldCheck,
  Code2,
  ArrowUpRight,
  Plus,
  Search,
  ArrowRight,
  BookOpen,
  Globe2,
  ArrowLeft,
  Copy,
  Download,
  Share2,
  Pencil,
  Check,
  ExternalLink,
  Clock3,
  FileCheck2,
  ShieldAlert,
  Layers3,
  Loader2,
  KeyRound,
  Trash2,
  CheckCircle2,
  ChevronRight,
  Link2,
  Activity,
  LockKeyhole,
} from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
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
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Toaster, toast } from "sonner";
import QRCode from "qrcode";
import {
  PassportForm,
  RecordForm,
  api,
  Field,
  SelectField,
} from "./passport-forms";
import {
  type Agent,
  type WorkRecord,
  metrics,
  kinds,
  effectiveJobs,
} from "@/lib/model";
const date = (s?: string) =>
  s
    ? new Date(s).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Present";
function activeJob(r: WorkRecord) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    r.kind === "employment" &&
    !r.withdrawn &&
    !!r.payload.startDate &&
    r.payload.startDate <= today &&
    (!r.payload.endDate || r.payload.endDate >= today)
  );
}
const compact = (n: number) => n.toLocaleString();
function markWithdrawals(records: WorkRecord[]) {
  const ids = new Set(
    records
      .filter((r) => r.kind === "correction")
      .map((r) => r.payload.targetId),
  );
  return records.map((r) => ({ ...r, withdrawn: ids.has(r.id) }));
}
function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  let hash = 0;
  for (const c of name) hash += c.charCodeAt(0);
  return (
    <span
      className={`agent-avatar ${large ? "large" : ""}`}
      style={
        {
          "--agent-color": ["#335fce", "#8250be", "#24766f", "#ba6437"][
            hash % 4
          ],
        } as React.CSSProperties
      }
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}
function Empty({
  icon: Icon = FileCheck2,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="small-empty">
      <Icon />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export default function PassportApp({ initialCode }: { initialCode?: string }) {
  const router = useRouter();
  const [returnTo, setReturnTo] = useState(
    initialCode ? "/p/" + encodeURIComponent(initialCode) : "/workspace",
  );
  useEffect(() => {
    setReturnTo(window.location.pathname + window.location.search);
  }, []);
  const [view, setView] = useState("Passports");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [allRecords, setAllRecords] = useState<WorkRecord[]>([]);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Agent | null>(null);
  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [form, setForm] = useState<"create" | "edit" | null>(null);
  const [recordKind, setRecordKind] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorkRecord | null>(null);
  const [withdraw, setWithdraw] = useState<WorkRecord | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [identity, setIdentity] = useState<Seal | null>(null);
  const [integrity, setIntegrity] = useState<Verification | null>(null);
  const [share, setShare] = useState(false);
  const [qr, setQr] = useState("");
  const [verifyInput, setVerifyInput] = useState("");
  const [verifyResult, setVerifyResult] = useState<Verification | null>(null);
  const [versionFilter, setVersionFilter] = useState("all");
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKey, setNewKey] = useState("");
  const [keyForm, setKeyForm] = useState(false);
  const [revoke, setRevoke] = useState<ApiKey | null>(null);
  const refresh = useCallback(() => {
    return Promise.all([
      api<{ user: PublicUser | null }>("session"),
      api<{ agents: Agent[]; records: WorkRecord[] }>("agents"),
    ])
      .then(([session, data]) => {
        setError("");
        setUser(session.user);
        if (
          !initialCode &&
          (!session.user ||
            new URLSearchParams(window.location.search).get("view") ===
              "network")
        )
          setView("Agent network");
        if (
          session.user &&
          new URLSearchParams(window.location.search).get("create") === "1"
        ) {
          setForm("create");
          window.history.replaceState({}, "", "/workspace");
        }
        setAgents(data.agents);
        setAllRecords(markWithdrawals(data.records));
        return session;
      })
      .catch((e) => {
        setError(e.message);
      })
      .finally(() => setLoaded(true));
  }, [initialCode]);
  const openAgent = useCallback(async (code: string) => {
    setBusy(true);
    setError("");
    setIntegrity(null);
    try {
      const data = await api<PassportDetail>(
        "agents/" + encodeURIComponent(code.trim().toUpperCase()),
      );
      setSelected(data.agent);
      setRecords(data.records);
      setIdentity(data.identity);
      setVersionFilter("all");
      setView("Passports");
      window.history.replaceState({}, "", `/p/${data.agent.code}`);
      api<Verification>(`agents/${data.agent.code}/verify`)
        .then((d) => setIntegrity({ ...d, valid: d.signatureValid ?? d.valid }))
        .catch(() => setIntegrity({ valid: false, unavailable: true }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    refresh().then((session) => {
      if (initialCode && session?.user) openAgent(initialCode);
    });
  }, [refresh, openAgent, initialCode]);
  useEffect(() => {
    if (view === "Developer API" && user)
      api<{ keys: ApiKey[] }>("keys")
        .then((d) => setKeys(d.keys))
        .catch((e) => toast.error(e.message));
  }, [view, user]);
  useEffect(() => {
    if (share && selected)
      QRCode.toDataURL(`${window.location.origin}/p/${selected.code}`, {
        width: 260,
        margin: 2,
        color: { dark: "#13273f", light: "#ffffff" },
      })
        .then(setQr)
        .catch(() => toast.error("Could not generate the QR code."));
  }, [share, selected]);
  useEffect(() => {
    const context = (
      document as Document & { modelContext?: BrowserModelContext }
    ).modelContext;
    if (!context?.registerTool || !user) return;
    const controller = new AbortController();
    const entries = [
      {
        name: "search_passports",
        description:
          "Search the signed-in workspace by agent name or personnel code and update the visible registry.",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string", maxLength: 200 } },
          required: ["query"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async (input: Record<string, unknown>) => {
          if (typeof input?.query !== "string" || input.query.length > 200)
            throw new Error("query must be a string of at most 200 characters");
          setSearch(input.query);
          window.history.replaceState({}, "", "/workspace");
          setSelected(null);
          setView("Passports");
          return agents
            .filter((a) =>
              (a.name + " " + a.code)
                .toLowerCase()
                .includes(String(input.query).toLowerCase()),
            )
            .map((a) => ({ code: a.code, name: a.name, role: a.role }));
        },
      },
      {
        name: "start_passport_registration",
        description:
          "Open the registration form. This does not create a passport.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async (input: Record<string, unknown>) => {
          if (!input || Object.keys(input).length)
            throw new Error("No arguments are accepted");
          if (!user) throw new Error("Sign in first");
          setForm("create");
          return { registrationFormOpen: true };
        },
      },
    ];
    for (const t of entries)
      try {
        Promise.resolve(
          context.registerTool(t, { signal: controller.signal }),
        ).catch(() => {});
      } catch {}
    return () => controller.abort();
  }, [agents, user]);
  function navigate(v: string) {
    setView(v);
    setSelected(null);
    setError("");
    window.history.replaceState({}, "", "/workspace");
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Clipboard unavailable. Select and copy the displayed text.");
    }
  }
  function create() {
    if (!user) {
      router.push("/signin-with-chatgpt?return_to=%2Fworkspace%3Fcreate%3D1");
      return;
    }
    setForm("create");
  }
  async function saved(agent: Agent) {
    setForm(null);
    toast.success(selected ? "Passport updated" : "Passport created");
    await refresh();
    await openAgent(agent.code);
  }
  async function recordSaved() {
    setRecordKind(null);
    toast.success("Signed record saved");
    await refresh();
    if (selected) await openAgent(selected.code);
  }
  async function withdrawRecord() {
    if (!withdraw || !selected) return;
    setBusy(true);
    try {
      await api(`agents/${selected.code}/records`, {
        method: "POST",
        body: JSON.stringify({
          id: crypto.randomUUID(),
          kind: "correction",
          title: "Withdrawn: " + withdraw.title.slice(0, 185),
          targetId: withdraw.id,
          notes: reason,
        }),
      });
      setWithdraw(null);
      setDetail(null);
      setReason("");
      toast.success("Record withdrawn; original preserved");
      await refresh();
      await openAgent(selected.code);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verifyInputNow(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setVerifyResult(null);
    try {
      let input = verifyInput.trim();
      if (input.startsWith("{")) {
        const parsed = JSON.parse(input);
        input = parsed.jws || "";
      }
      if (/^FTAI-[A-Z0-9-]+$/i.test(input)) {
        const d = await api<Verification>(
          `agents/${input.toUpperCase()}/verify`,
        );
        const p = await api<PassportDetail>("agents/" + input.toUpperCase());
        setVerifyResult({
          ...d,
          code: input.toUpperCase(),
          name: p.agent.name,
          status: p.agent.status,
          reason: d.meaning,
        });
      } else {
        const d = await api<Verification>("verify", {
          method: "POST",
          body: JSON.stringify({ jws: input }),
        });
        setVerifyResult(d);
      }
    } catch (e) {
      setVerifyResult({ valid: false, reason: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  async function createKey(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const d = await api<{ token: string }>("keys", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(f)),
      });
      setNewKey(d.token);
      setKeyForm(false);
      setKeys((await api<{ keys: ApiKey[] }>("keys")).keys);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const m = metrics(allRecords);
  const filtered = agents.filter(
    (a) =>
      (a.name + " " + a.code + " " + a.role + " " + a.organization)
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (statusFilter === "all" || a.status === statusFilter),
  );
  const pm = metrics(
    versionFilter === "all"
      ? records
      : records.filter((r) => r.payload.version === versionFilter),
  );
  const currentJobs = effectiveJobs(records).filter(activeJob);
  const liveRecords = records.filter((r) => !r.withdrawn);
  const jobs = effectiveJobs(allRecords);
  if (!loaded || !user)
    return (
      <PassportGate
        code={initialCode}
        returnTo={returnTo}
        loading={!loaded}
        error={error}
      />
    );
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "248px" } as React.CSSProperties}
    >
      <Toaster position="bottom-right" richColors />
      <Sidebar>
        <SidebarHeader className="brand">
          <BrandMark size={31} />
          <strong>fisemarco</strong>
        </SidebarHeader>
        <SidebarContent>
          <div className="workspace-label">
            <span className="workspace-icon">W</span>
            <div>
              My workspace<small>Professional registry</small>
            </div>
          </div>
          <div className="nav-label">WORKSPACE</div>
          <SidebarMenu>
            {(
              [
                [LayoutGrid, "Passports"],
                [Globe2, "Agent network"],
                [BriefcaseBusiness, "Employment"],
                [ShieldCheck, "Verify a passport"],
              ] as const
            ).map(([Icon, label]) => (
              <SidebarMenuItem key={label}>
                <SidebarMenuButton
                  isActive={view === label}
                  onClick={() => navigate(label)}
                >
                  <Icon />
                  <span>{label}</span>
                  {label === "Passports" && agents.length > 0 && (
                    <span className="nav-count">{agents.length}</span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          <div className="nav-label">RESOURCES</div>
          <SidebarMenu>
            {(
              [
                [Code2, "Developer API"],
                [BookOpen, "Trust & standards"],
              ] as const
            ).map(([Icon, label]) => (
              <SidebarMenuItem key={label}>
                <SidebarMenuButton
                  isActive={view === label}
                  onClick={() => navigate(label)}
                >
                  <Icon />
                  <span>{label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <Link href="/" className="text-link" style={{ padding: "12px" }}>
            <Globe2 size={16} /> Public registry
          </Link>
          <div className="registry-note">
            <Globe2 size={18} />
            <strong>Identity that travels.</strong>
            <p>
              One professional record.
              <br />
              Every chapter of their work.
            </p>
          </div>
          <div className="account">
            <span>{user?.name?.slice(0, 1).toUpperCase() || "W"}</span>
            <div className="account-name">
              {user?.name || "My workspace"}
              <small>
                {user ? (
                  <a href="/signout-with-chatgpt?return_to=/" target="_top">
                    Sign out
                  </a>
                ) : (
                  <a href="/signin-with-chatgpt?return_to=/" target="_top">
                    Sign in with ChatGPT
                  </a>
                )}
              </small>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="topbar">
          <div>
            <SidebarTrigger />
            <span>Workspace</span>
            <span className="crumb">/</span>
            <strong>{selected ? selected.name : view}</strong>
          </div>
          <span className="secure-label">
            <ShieldCheck size={15} /> Protected workspace
          </span>
        </header>
        <main className="main">
          {error && (
            <div className="error-box" role="alert">
              {error}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  initialCode ? openAgent(initialCode) : refresh()
                }
              >
                Try again
              </Button>
            </div>
          )}
          {!loaded && (
            <div className="loading">
              <Loader2 className="spin" />
              Opening your registry…
            </div>
          )}
          {view === "Passports" && !selected && (
            <>
              <div className="eyebrow">THE PROFESSIONAL IDENTITY FOR AI</div>
              <div className="page-heading">
                <div>
                  <h1>
                    Your passports<span>.</span>
                  </h1>
                  <p>
                    A permanent identity. A professional record that grows with
                    every job.
                  </p>
                </div>
                <Button onClick={create}>
                  <Plus />
                  Create passport
                </Button>
              </div>
              <div className="stats-grid">
                {[
                  [
                    "Total passports",
                    agents.length,
                    "Registered AI identities",
                  ],
                  [
                    "Active employees",
                    new Set(
                      effectiveJobs(allRecords)
                        .filter(activeJob)
                        .filter(
                          (r) =>
                            agents.find((a) => a.code === r.agent)?.status ===
                            "active",
                        )
                        .map((r) => r.agent),
                    ).size,
                    "Currently employed",
                  ],
                  [
                    "Work records",
                    allRecords.filter(
                      (r) =>
                        !["profile", "correction"].includes(r.kind) &&
                        !r.withdrawn,
                    ).length,
                    "Traceable contributions",
                  ],
                  ["Evidence attached", m.evidence, "Supporting work records"],
                ].map(([label, value, caption]) => (
                  <div className="stat" key={String(label)}>
                    <span>
                      {label}
                      <ArrowUpRight size={16} />
                    </span>
                    <strong>{compact(Number(value))}</strong>
                    <small>{caption}</small>
                  </div>
                ))}
              </div>
              <div className="section-heading">
                <h2>
                  Passport registry <span>{agents.length}</span>
                </h2>
                <div className="filter-row">
                  {agents.length > 0 && (
                    <NativeSelect
                      aria-label="Filter by status"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                    >
                      <NativeSelectOption value="all">
                        All statuses
                      </NativeSelectOption>
                      {["active", "suspended", "retired"].map((s) => (
                        <NativeSelectOption key={s}>{s}</NativeSelectOption>
                      ))}
                    </NativeSelect>
                  )}
                  <div className="search">
                    <Search size={17} />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search name or personnel code"
                      aria-label="Search passports"
                    />
                  </div>
                </div>
              </div>
              {agents.length === 0 ? (
                <div className="registry-empty">
                  <div className="empty-symbol">
                    <Fingerprint />
                  </div>
                  <span className="eyebrow">YOUR REGISTRY STARTS HERE</span>
                  <h2>Give your first agent an identity.</h2>
                  <p>
                    Register an AI agent or employee and start building
                    <br />a work history they can carry anywhere.
                  </p>
                  <Button onClick={create}>
                    <Plus />
                    Create your first passport
                  </Button>
                  <div className="empty-features">
                    <span>
                      <ShieldCheck />
                      Signed records
                    </span>
                    <span>
                      <Globe2 />
                      Portable identity
                    </span>
                    <span>
                      <BriefcaseBusiness />
                      Employment history
                    </span>
                  </div>
                </div>
              ) : filtered.length === 0 ? (
                <Empty
                  icon={Search}
                  title="No matching passports"
                  description="Try another name, personnel code, or status."
                  action={
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSearch("");
                        setStatusFilter("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <div className="passport-grid">
                  {filtered.map((a) => {
                    const rs = allRecords.filter((r) => r.agent === a.code);
                    const p = metrics(rs);
                    return (
                      <button
                        className="passport-tile"
                        key={a.code}
                        onClick={() => openAgent(a.code)}
                      >
                        <div className="tile-top">
                          <Avatar name={a.name} />
                          <Badge
                            variant="outline"
                            className={"status " + a.status}
                          >
                            {a.status}
                          </Badge>
                        </div>
                        <h3>{a.name}</h3>
                        <p>{a.role}</p>
                        <div className="tile-code">
                          <Fingerprint size={14} />
                          {a.code}
                        </div>
                        <div className="tile-meta">
                          <span>
                            Owner<strong>{a.organization}</strong>
                          </span>
                          <span>
                            Task outcomes<strong>{p.tasks}</strong>
                          </span>
                        </div>
                        <div className="tile-bottom">
                          <span>
                            {a.visibility === "private" ? (
                              <LockKeyhole size={13} />
                            ) : (
                              <Globe2 size={13} />
                            )}{" "}
                            {a.visibility === "private"
                              ? "Private passport"
                              : "Listed · sign-in protected"}
                          </span>
                          <ArrowUpRight size={17} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="bottom-strip">
                <div>
                  <span className="mono">01 — IDENTITY</span>
                  <h3>
                    More than a profile.
                    <br />A record you can verify.
                  </h3>
                </div>
                <p>
                  Every passport connects an agent to its owner,
                  <br />
                  capabilities, authority, and the evidence behind its work.
                </p>
                <Button
                  variant="outline"
                  onClick={() => navigate("Trust & standards")}
                >
                  Explore the trust model
                  <ArrowRight />
                </Button>
              </div>
            </>
          )}
          {selected && view === "Passports" && (
            <>
              <button
                className="back-link"
                onClick={() => navigate("Passports")}
              >
                <ArrowLeft size={15} />
                All passports
              </button>
              <div className="profile-heading">
                <div className="profile-title">
                  <Avatar name={selected.name} large />
                  <div>
                    <div className="eyebrow">AI EMPLOYEE PASSPORT</div>
                    <h1>
                      {selected.name}
                      <Badge
                        className={"status " + selected.status}
                        variant="outline"
                      >
                        {selected.status}
                      </Badge>
                    </h1>
                    <p>
                      {selected.role} <span>·</span> {selected.organization}
                    </p>
                  </div>
                </div>
                <div className="actions">
                  <Button variant="outline" onClick={() => setShare(true)}>
                    <Share2 />
                    Share
                  </Button>
                  <Button variant="outline" asChild>
                    <a href={`/api/v1/agents/${selected.code}/export`} download>
                      <Download />
                      Export
                    </a>
                  </Button>
                  {selected.canEdit && (
                    <Button onClick={() => setForm("edit")}>
                      <Pencil />
                      Edit passport
                    </Button>
                  )}
                </div>
              </div>
              <div className="profile-columns">
                <IdentityDocument
                  agent={selected}
                  seal={identity}
                  onCopy={copy}
                />
                <div className="assurance-panel">
                  <div className="assurance-title">
                    <ShieldCheck />
                    <h3>Record integrity</h3>
                  </div>
                  {integrity ? (
                    <div
                      className={
                        integrity.valid ? "integrity-ok" : "integrity-bad"
                      }
                    >
                      {integrity.valid ? (
                        <CheckCircle2 size={17} />
                      ) : (
                        <ShieldAlert size={17} />
                      )}
                      <strong>
                        {integrity.valid
                          ? "Signatures verified"
                          : integrity.unavailable
                            ? "Verification unavailable"
                            : "Integrity check failed"}
                      </strong>
                    </div>
                  ) : (
                    <div className="muted">
                      <Loader2 className="spin inline-icon" />
                      Checking signatures…
                    </div>
                  )}
                  <p>
                    {integrity?.records ?? records.length} signed records ·
                    revision {selected.revision}
                  </p>
                  <div className="assurance-divider" />
                  <span className="label">CLAIM ASSURANCE</span>
                  <strong className="assurance-level">Reported claims</strong>
                  <p>
                    Identity details and work outcomes are reported by the owner
                    or authenticated runtime. Inspect the source and evidence in
                    each record.
                  </p>
                  <button
                    className="text-link"
                    onClick={() => navigate("Trust & standards")}
                  >
                    Understand verification
                    <ArrowUpRight size={14} />
                  </button>
                </div>
              </div>
              <Tabs defaultValue="overview" className="profile-tabs">
                <TabsList variant="line">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="employment">
                    Employment <span>{metrics(records).jobs.length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="performance">Performance</TabsTrigger>
                  <TabsTrigger value="authority">Authority</TabsTrigger>
                  <TabsTrigger value="records">
                    Records <span>{records.length}</span>
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="overview">
                  <div className="detail-grid">
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>Professional identity</h2>
                        <Fingerprint size={19} />
                      </div>
                      <p className="description">
                        {selected.profile.description ||
                          "No description has been added to this passport."}
                      </p>
                      <dl className="identity-list">
                        {[
                          ["Owner", selected.organization],
                          ["Creator", selected.profile.creator],
                          ["Operator", selected.profile.operator],
                          ["Model / runtime", selected.profile.model],
                          ["Current version", selected.profile.version],
                          [
                            "Current employer",
                            currentJobs
                              .map((j) => j.payload.employer)
                              .join(", ") || "No current employment",
                          ],
                          ["Registered", date(selected.created)],
                          [
                            "Visibility",
                            selected.visibility === "private"
                              ? "Private to your workspace"
                              : "Listed · sign-in required",
                          ],
                        ].map(([k, v]) => (
                          <div key={k}>
                            <dt>{k}</dt>
                            <dd>{v || "Not provided"}</dd>
                          </div>
                        ))}
                      </dl>
                      <div className="did-block">
                        <small>REGISTRY-MANAGED DECENTRALIZED ID</small>
                        <code>{selected.did}</code>
                        <button
                          aria-label="Copy DID"
                          onClick={() => copy(selected.did)}
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                      {selected.profile.externalDid && (
                        <p className="small muted wrap">
                          External DID (unverified):{" "}
                          {selected.profile.externalDid}
                        </p>
                      )}
                      {selected.profile.endpoint && (
                        <a
                          className="text-link"
                          href={selected.profile.endpoint}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Agent endpoint
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </section>
                    <div className="panel-stack">
                      <section className="panel">
                        <div className="panel-heading">
                          <h2>Capabilities</h2>
                          <Layers3 size={19} />
                        </div>
                        {selected.profile.skills.length ? (
                          <>
                            <div className="skill-tags">
                              {selected.profile.skills.map((s) => (
                                <Badge variant="secondary" key={s}>
                                  {s}
                                </Badge>
                              ))}
                            </div>
                            <p className="small muted">
                              Declared by the passport owner.
                            </p>
                          </>
                        ) : (
                          <p className="muted">No capabilities added yet.</p>
                        )}
                      </section>
                      <section className="panel">
                        <div className="panel-heading">
                          <h2>Credentials</h2>
                          <FileCheck2 size={19} />
                        </div>
                        {liveRecords.filter((r) => r.kind === "credential")
                          .length ? (
                          liveRecords
                            .filter((r) => r.kind === "credential")
                            .map((r) => (
                              <button
                                className="credential-row"
                                key={r.id}
                                onClick={() => setDetail(r)}
                              >
                                <FileCheck2 size={20} />
                                <div>
                                  <strong>{r.title}</strong>
                                  <small>
                                    {r.payload.issuer} ·{" "}
                                    {r.payload.expires &&
                                    r.payload.expires <
                                      new Date().toISOString().slice(0, 10)
                                      ? "Expired"
                                      : "Owner-reported"}
                                  </small>
                                </div>
                                <ChevronRight size={17} />
                              </button>
                            ))
                        ) : (
                          <p className="muted">No credentials on record.</p>
                        )}
                        {selected.canEdit && (
                          <Button
                            variant="outline"
                            disabled={selected.status !== "active"}
                            onClick={() => setRecordKind("credential")}
                          >
                            <Plus />
                            Add credential
                          </Button>
                        )}
                      </section>
                      <section className="panel subtle">
                        <div className="panel-heading">
                          <h2>Incident record</h2>
                          <ShieldAlert size={18} />
                        </div>
                        <p>
                          {metrics(records).incidents
                            ? `${metrics(records).incidents} open incident${metrics(records).incidents === 1 ? "" : "s"}`
                            : "No open incidents recorded"}
                        </p>
                        <p className="small muted">
                          Absence of reported incidents is not a safety
                          certification.
                        </p>
                        {liveRecords
                          .filter((r) => r.kind === "incident")
                          .map((r) => (
                            <button
                              className="credential-row"
                              key={r.id}
                              onClick={() => setDetail(r)}
                            >
                              <ShieldAlert size={17} />
                              <div>
                                <strong>{r.title}</strong>
                                <small>
                                  {r.payload.severity} ·{" "}
                                  {r.payload.state === "resolved" ||
                                  liveRecords.some(
                                    (e) =>
                                      e.kind === "incident_resolution" &&
                                      e.payload.incidentId === r.id,
                                  )
                                    ? "Resolved"
                                    : "Open"}
                                </small>
                              </div>
                              <ChevronRight size={15} />
                            </button>
                          ))}
                      </section>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="employment">
                  <div className="section-heading tab-heading">
                    <div>
                      <h2>Employment history</h2>
                      <p className="muted small">
                        An enduring record of where this agent has worked.
                      </p>
                    </div>
                    {selected.canEdit && (
                      <Button
                        disabled={selected.status !== "active"}
                        onClick={() => setRecordKind("employment")}
                      >
                        <Plus />
                        Add employment
                      </Button>
                    )}
                  </div>
                  {metrics(records).jobs.length ? (
                    <div className="timeline">
                      {metrics(records)
                        .jobs.slice()
                        .reverse()
                        .map((r) => (
                          <div className="employment-card" key={r.id}>
                            <div className="employment-icon">
                              <BriefcaseBusiness />
                            </div>
                            <div className="employment-main">
                              <div className="employment-top">
                                <h3>{r.payload.role}</h3>
                                <Badge variant="outline">
                                  {activeJob(r)
                                    ? "Current"
                                    : (r.payload.startDate || "") >
                                        new Date().toISOString().slice(0, 10)
                                      ? "Upcoming"
                                      : "Completed"}
                                </Badge>
                              </div>
                              <strong>{r.payload.employer}</strong>
                              <p>
                                {date(r.payload.startDate)} —{" "}
                                {date(r.payload.endDate)}
                              </p>
                              {r.payload.compensation && (
                                <p>{r.payload.compensation}</p>
                              )}
                              <div className="employment-footer">
                                <span>
                                  {
                                    liveRecords.filter(
                                      (t) =>
                                        t.payload.employmentId === r.id &&
                                        t.kind === "task",
                                    ).length
                                  }{" "}
                                  task outcomes · Reported results
                                </span>
                                {selected.canEdit && activeJob(r) && (
                                  <button
                                    className="text-link"
                                    onClick={() =>
                                      setRecordKind("employment_end")
                                    }
                                  >
                                    End employment
                                  </button>
                                )}
                                <button
                                  onClick={() =>
                                    setDetail(
                                      records.find((x) => x.id === r.id) || r,
                                    )
                                  }
                                  className="text-link"
                                >
                                  Inspect record
                                  <ArrowUpRight size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <Empty
                      icon={BriefcaseBusiness}
                      title="Every career starts somewhere."
                      description="Add the agent’s first role, employer, and dates of employment."
                    />
                  )}
                </TabsContent>
                <TabsContent value="performance">
                  <div className="section-heading tab-heading">
                    <div>
                      <h2>Performance, with context</h2>
                      <p className="small muted">
                        Calculated from recorded task outcomes. Withdrawn
                        records are excluded.
                      </p>
                    </div>
                    <div className="actions">
                      <NativeSelect
                        aria-label="Performance version"
                        value={versionFilter}
                        onChange={(e) => setVersionFilter(e.target.value)}
                      >
                        <NativeSelectOption value="all">
                          All versions
                        </NativeSelectOption>
                        {[
                          ...new Set(
                            records
                              .map((r) => r.payload.version)
                              .filter(Boolean),
                          ),
                        ].map((v) => (
                          <NativeSelectOption key={v} value={v}>
                            {v}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      {selected.canEdit && (
                        <Button
                          disabled={selected.status !== "active"}
                          onClick={() => setRecordKind("task")}
                        >
                          <Plus />
                          Record outcome
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="stats-grid">
                    {[
                      [
                        "Task outcomes",
                        pm.tasks,
                        "Every recorded result counts",
                      ],
                      [
                        "Success rate",
                        pm.success === null ? "—" : pm.success + "%",
                        "Successful / all outcomes",
                      ],
                      [
                        "Human intervention",
                        pm.intervention === null ? "—" : pm.intervention + "%",
                        "Tasks requiring assistance",
                      ],
                      [
                        "Average duration",
                        pm.average === null ? "—" : pm.average + "s",
                        "Across recorded outcomes",
                      ],
                    ].map(([k, v, n]) => (
                      <div className="stat" key={String(k)}>
                        <span>{k}</span>
                        <strong>{v}</strong>
                        <small>{n}</small>
                      </div>
                    ))}
                  </div>
                  <div className="panel">
                    <div className="panel-heading">
                      <h2>Benchmark results</h2>
                      {selected.canEdit && (
                        <Button
                          variant="outline"
                          disabled={selected.status !== "active"}
                          onClick={() => setRecordKind("benchmark")}
                        >
                          <Plus />
                          Add benchmark
                        </Button>
                      )}
                    </div>
                    {pm.benchmarks.length ? (
                      pm.benchmarks.map((r) => (
                        <button
                          className="benchmark-row"
                          key={r.id}
                          onClick={() => setDetail(r)}
                        >
                          <div>
                            <strong>{r.payload.suite}</strong>
                            <small>
                              {r.payload.samples} samples · v{r.payload.version}{" "}
                              · Reported results
                            </small>
                          </div>
                          <div className="score-track">
                            <span style={{ width: r.payload.score + "%" }} />
                          </div>
                          <strong>
                            {r.payload.score}
                            <small>/100</small>
                          </strong>
                          <ChevronRight size={16} />
                        </button>
                      ))
                    ) : (
                      <Empty
                        icon={Activity}
                        title="No benchmark results yet"
                        description="Record a named evaluation suite, version, sample size, and evidence."
                      />
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="authority">
                  <div className="tab-heading">
                    <h2>Authority & boundaries</h2>
                    <p className="muted small">
                      Declared permissions document the agent’s scope. Your
                      runtime must enforce these boundaries.
                    </p>
                  </div>
                  <div className="detail-grid authority-grid">
                    {(
                      [
                        [true, "Allowed actions", selected.profile.allowed],
                        [false, "Prohibited actions", selected.profile.denied],
                      ] as const
                    ).map(([allow, title, items]) => (
                      <section className="panel" key={title}>
                        <div className="panel-heading">
                          <h2>{title}</h2>
                          {allow ? (
                            <CheckCircle2 size={20} />
                          ) : (
                            <ShieldAlert size={20} />
                          )}
                        </div>
                        {items.length ? (
                          items.map((p: string) => (
                            <div
                              className={
                                "permission " + (allow ? "allowed" : "denied")
                              }
                              key={p}
                            >
                              {allow ? (
                                <Check size={16} />
                              ) : (
                                <LockKeyhole size={16} />
                              )}{" "}
                              {p}
                            </div>
                          ))
                        ) : (
                          <p className="muted">No actions declared.</p>
                        )}
                      </section>
                    ))}
                  </div>
                  <div className="form-note">
                    <ShieldAlert size={18} />
                    <p>
                      A passport is a professional record, not a runtime access
                      token. Never grant an agent privileges solely because it
                      has a valid passport signature.
                    </p>
                  </div>
                </TabsContent>
                <TabsContent value="records">
                  <div className="section-heading tab-heading">
                    <div>
                      <h2>Signed record ledger</h2>
                      <p className="muted small">
                        Every change is traceable. Originals remain after
                        withdrawal.
                      </p>
                    </div>
                    {selected.canEdit && (
                      <Button
                        disabled={selected.status !== "active"}
                        onClick={() => setRecordKind("task")}
                      >
                        <Plus />
                        Add record
                      </Button>
                    )}
                  </div>
                  <div className="table-panel">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Record</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Recorded</TableHead>
                          <TableHead>Evidence</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {records
                          .slice()
                          .reverse()
                          .map((r) => (
                            <TableRow key={r.id}>
                              <TableCell>
                                <button
                                  className="record-link"
                                  onClick={() => setDetail(r)}
                                >
                                  {r.title}
                                  <small>
                                    #{String(r.sequence).padStart(3, "0")} ·{" "}
                                    {r.hash.slice(0, 12)}
                                  </small>
                                </button>
                              </TableCell>
                              <TableCell>{kinds[r.kind]}</TableCell>
                              <TableCell>{date(r.created)}</TableCell>
                              <TableCell>
                                {r.payload.evidenceUrl ||
                                r.payload.evidenceHash ? (
                                  <span className="evidence-label">
                                    <Link2 size={13} />
                                    Attached
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {r.withdrawn
                                    ? "Withdrawn"
                                    : r.kind === "correction"
                                      ? "Correction"
                                      : "Signed"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
          {view === "Employment" && (
            <>
              <div className="eyebrow">THE AI WORKFORCE</div>
              <div className="page-heading">
                <div>
                  <h1>
                    Employment records<span>.</span>
                  </h1>
                  <p>
                    Every employer. Every role. A continuous professional
                    history.
                  </p>
                </div>
                <Button
                  onClick={() => {
                    if (!agents.length) {
                      create();
                      return;
                    }
                    if (agents.length === 1)
                      openAgent(agents[0].code).then(() =>
                        setRecordKind("employment"),
                      );
                    else {
                      navigate("Passports");
                      toast.info("Open a passport to add employment.");
                    }
                  }}
                >
                  <Plus />
                  Add employment
                </Button>
              </div>
              {jobs.length ? (
                <div className="table-panel">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>AI employee</TableHead>
                        <TableHead>Employer & role</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs
                        .slice()
                        .reverse()
                        .map((r) => (
                          <TableRow key={r.id}>
                            <TableCell>
                              <button
                                className="record-link"
                                onClick={() => openAgent(r.agent)}
                              >
                                {agents.find((a) => a.code === r.agent)?.name}
                                <small>{r.agent}</small>
                              </button>
                            </TableCell>
                            <TableCell>
                              {r.payload.employer}
                              <small className="block muted">
                                {r.payload.role}
                              </small>
                            </TableCell>
                            <TableCell>
                              {date(r.payload.startDate)}
                              <small className="block muted">
                                to {date(r.payload.endDate)}
                              </small>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {activeJob(r)
                                  ? "Current"
                                  : (r.payload.startDate || "") >
                                      new Date().toISOString().slice(0, 10)
                                    ? "Upcoming"
                                    : "Completed"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                aria-label="Open employee passport"
                                variant="ghost"
                                size="icon"
                                onClick={() => openAgent(r.agent)}
                              >
                                <ArrowUpRight />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <Empty
                  icon={BriefcaseBusiness}
                  title="Your workforce history starts here."
                  description="Open an agent’s passport and add its first employment record."
                  action={
                    <Button
                      variant="outline"
                      onClick={() => navigate("Passports")}
                    >
                      View passports
                      <ArrowRight />
                    </Button>
                  }
                />
              )}
              <div className="form-note">
                <BookOpen size={18} />
                <p>
                  Employment entries are owner-reported and preserve their
                  evidence and recording date. End a role with an employment-end
                  entry; the original role and all linked work remain intact.
                </p>
              </div>
            </>
          )}
          {view === "Verify a passport" && (
            <>
              <div className="eyebrow">TRUST, WITH EVIDENCE</div>
              <div className="page-heading">
                <div>
                  <h1>
                    Verify a passport<span>.</span>
                  </h1>
                  <p>
                    Check the signatures, record history, and current status
                    behind an identity.
                  </p>
                </div>
              </div>
              <div className="verification-layout">
                <section className="panel verification-form">
                  <div className="verify-icon">
                    <ShieldCheck />
                  </div>
                  <h2>Start with the personnel code.</h2>
                  <p className="muted">
                    Enter a Fisemarco code, a signed credential, or the contents of
                    an exported passport.
                  </p>
                  <div className="passport-file">
                    <label htmlFor="passport-file">
                      Or choose a passport export
                    </label>
                    <Input
                      id="passport-file"
                      type="file"
                      accept=".json,.jwt,application/json"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 20 * 1024 * 1024) {
                          toast.error(
                            "Choose an export smaller than 20 MB, or paste its snapshot credential.",
                          );
                          return;
                        }
                        try {
                          const text = await file.text();
                          const jws = text.trim().startsWith("{")
                            ? JSON.parse(text).jws
                            : text.trim();
                          if (typeof jws !== "string" || jws.length > 60000)
                            throw new Error(
                              "This file does not contain a supported snapshot credential.",
                            );
                          setVerifyInput(jws);
                          setVerifyResult(null);
                          toast.success("Snapshot loaded. Verify it below.");
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    />
                    <small>
                      Read locally. Verification checks the signed snapshot and
                      current status.
                    </small>
                  </div>
                  <form onSubmit={verifyInputNow}>
                    <label htmlFor="verify-value">
                      Personnel code or signed passport
                    </label>
                    <Textarea
                      id="verify-value"
                      value={verifyInput}
                      onChange={(e) => setVerifyInput(e.target.value)}
                      placeholder="FTAI-XXXX-XXXX-XXXX"
                      required
                      maxLength={65536}
                    />
                    <Button disabled={busy || !verifyInput.trim()}>
                      {busy ? <Loader2 className="spin" /> : <ShieldCheck />}
                      Verify record
                    </Button>
                  </form>
                  {verifyResult && (
                    <div
                      className={
                        "verification-result " +
                        (verifyResult.valid ? "success" : "failed")
                      }
                      role="status"
                    >
                      {verifyResult.valid ? <CheckCircle2 /> : <ShieldAlert />}
                      <div>
                        <h3>
                          {verifyResult.valid
                            ? "Record integrity confirmed"
                            : "Verification not confirmed"}
                        </h3>
                        {verifyResult.name && (
                          <strong>
                            {verifyResult.name} · {verifyResult.code}
                          </strong>
                        )}
                        <p>{verifyResult.reason}</p>
                        {verifyResult.status && (
                          <p>Passport status: {verifyResult.status}</p>
                        )}
                        {verifyResult.checkedAt && (
                          <small>
                            Checked{" "}
                            {new Date(verifyResult.checkedAt).toLocaleString()}
                          </small>
                        )}
                        {verifyResult.code && (
                          <button
                            className="text-link"
                            onClick={() => openAgent(verifyResult.code!)}
                          >
                            Open passport
                            <ArrowRight size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </section>
                <aside className="verify-guide">
                  <span className="mono">WHAT WE CHECK</span>
                  {(
                    [
                      [
                        Fingerprint,
                        "Issuer identity",
                        "The signature belongs to this registry’s published signing key.",
                      ],
                      [
                        ShieldCheck,
                        "Record integrity",
                        "The signed content and its sequence have not been changed.",
                      ],
                      [
                        Clock3,
                        "Current status",
                        "Signed exports are checked for freshness, withdrawal, and passport status.",
                      ],
                    ] as const
                  ).map(([Icon, t, d]) => (
                    <div key={t}>
                      <Icon />
                      <h3>{t}</h3>
                      <p>{d}</p>
                    </div>
                  ))}
                  <div className="guide-note">
                    A valid signature confirms the source of a claim. Review the
                    evidence and issuer before relying on the claim itself.
                  </div>
                </aside>
              </div>
            </>
          )}
          {view === "Agent network" && (
            <NetworkPanel user={user} onOpenPassport={openAgent} />
          )}
          {view === "Developer API" && (
            <>
              <div className="eyebrow">BUILT TO CONNECT</div>
              <div className="page-heading">
                <div>
                  <h1>
                    The passport API<span>.</span>
                  </h1>
                  <p>
                    Read identities. Record outcomes. Verify professional
                    history.
                  </p>
                </div>
              </div>
              <div className="api-layout">
                <div>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Access keys</h2>
                      <Button disabled={!user} onClick={() => setKeyForm(true)}>
                        <Plus />
                        Create key
                      </Button>
                    </div>
                    <p className="muted small">
                      Keys belong to your workspace, expire after 90 days, and
                      are shown once. The site’s audience policy still applies
                      to API requests.
                    </p>
                    {keys.length ? (
                      <div className="key-list">
                        {keys.map((k) => (
                          <div key={k.id}>
                            <KeyRound size={18} />
                            <div>
                              <strong>{k.label}</strong>
                              <small>
                                {k.prefix}… · {k.scope} · Expires{" "}
                                {date(k.expires)}
                              </small>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={"Revoke " + k.label}
                              onClick={() => setRevoke(k)}
                            >
                              <Trash2 size={16} />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="key-empty">
                        {user
                          ? "No API keys created."
                          : "Sign in to create an API key."}
                      </p>
                    )}
                  </section>
                  <section className="panel api-docs">
                    <div className="panel-heading">
                      <h2>Endpoints</h2>
                      <Code2 size={18} />
                    </div>
                    {[
                      [
                        "GET",
                        "/api/v1/agents",
                        "List passports in your workspace.",
                      ],
                      [
                        "POST",
                        "/api/v1/agents",
                        "Register an agent with name, role, organization, and profile.",
                      ],
                      [
                        "GET",
                        "/api/v1/agents/{code}",
                        "Retrieve the passport, full ledger, and computed metrics.",
                      ],
                      [
                        "PATCH",
                        "/api/v1/agents/{code}",
                        "Update identity details with the current revision number.",
                      ],
                      [
                        "POST",
                        "/api/v1/agents/{code}/records",
                        "Append an outcome, employment, benchmark, or other record.",
                      ],
                      [
                        "GET",
                        "/api/v1/agents/{code}/verify",
                        "Verify record signatures and the full hash chain.",
                      ],
                      [
                        "GET",
                        "/api/v1/agents/{code}/export",
                        "Download a signed credential bundle; add ?format=jwt for VC-JWT.",
                      ],
                      [
                        "POST",
                        "/api/v1/verify",
                        'Verify an exported credential with { "jws": "…" }.',
                      ],
                    ].map(([method, path, desc]) => (
                      <div className="endpoint" key={method + path}>
                        <span>{method}</span>
                        <div>
                          <code>{path}</code>
                          <p>{desc}</p>
                        </div>
                      </div>
                    ))}
                  </section>
                </div>
                <div>
                  <section className="code-panel">
                    <div>
                      <span>Record a task outcome</span>
                      <button
                        aria-label="Copy API example"
                        onClick={() =>
                          copy(
                            JSON.stringify(
                              {
                                id: crypto.randomUUID(),
                                kind: "task",
                                title: "Quarterly analysis completed",
                                outcome: "success",
                                durationSeconds: 192,
                                intervention: false,
                                version: "1.0.0",
                                evidenceUrl: "",
                                notes: "Include your evaluation context.",
                              },
                              null,
                              2,
                            ),
                          )
                        }
                      >
                        <Copy size={15} />
                      </button>
                    </div>
                    <pre>{`POST /api/v1/agents/{code}/records
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "id": "a-unique-uuid-per-task",
  "kind": "task",
  "title": "Quarterly analysis completed",
  "outcome": "success",
  "durationSeconds": 192,
  "intervention": false,
  "version": "1.0.0",
  "evidenceUrl": "",
  "notes": "Evaluation context"
}`}</pre>
                  </section>
                  <section className="panel">
                    <h3>Integration essentials</h3>
                    <ul className="help-list">
                      <li>
                        Send a valid UUID in <code>id</code>. Retrying the same
                        record is safe; conflicting reuse returns 409.
                      </li>
                      <li>
                        Write keys can add records to passports owned by their
                        workspace. Read keys cannot modify data.
                      </li>
                      <li>
                        Browser sessions can call the same API. Private hosting
                        requires site access before API authentication.
                      </li>
                      <li>
                        Exported passport snapshots expire after 24 hours. Check
                        the current registry status before relying on one.
                      </li>
                      <li>
                        Task metrics include successful, partial, and failed
                        outcomes. They describe submitted records, not all agent
                        activity.
                      </li>
                    </ul>
                    <a
                      className="text-link"
                      href="/api-reference.json"
                      download
                    >
                      Download OpenAPI reference
                      <Download size={14} />
                    </a>
                  </section>
                </div>
              </div>
            </>
          )}
          {view === "Trust & standards" && (
            <>
              <div className="eyebrow">THE Fisemarco TRUST MODEL</div>
              <div className="page-heading">
                <div>
                  <h1>
                    Trust has a paper trail<span>.</span>
                  </h1>
                  <p>
                    Understand exactly what a passport proves, and what it does
                    not.
                  </p>
                </div>
              </div>
              <section className="trust-banner">
                <ShieldCheck />
                <div>
                  <span className="mono">THE CORE PRINCIPLE</span>
                  <h2>Provenance first. Performance with evidence.</h2>
                  <p>
                    Fisemarco preserves who recorded a claim, when it was recorded,
                    and the evidence attached to it. There is no opaque trust
                    score and no pay-to-verify badge.
                  </p>
                </div>
              </section>
              <div className="trust-grid">
                {[
                  [
                    "01",
                    "A permanent personnel code",
                    "An agent keeps its personnel code through job changes and new versions. The registry-managed DID identifies its passport; it does not prove control of the agent’s runtime.",
                  ],
                  [
                    "02",
                    "A signed, append-only history",
                    "Every identity update and work record receives an Ed25519 signature and is linked to the previous record by a SHA-256 hash. Withdrawals remain visible.",
                  ],
                  [
                    "03",
                    "Honest claim assurance",
                    "Employment, reviews, credentials, capabilities, and outcomes are owner-reported or runtime-reported. A signature authenticates the registry’s receipt of a claim. It does not independently validate the employer or the work.",
                  ],
                  [
                    "04",
                    "Evidence you can inspect",
                    "Records can include an HTTPS evidence link and a SHA-256 file fingerprint. Review the source, methodology, sample size, and version before drawing conclusions.",
                  ],
                  [
                    "05",
                    "Context over a single score",
                    "Performance is calculated from non-withdrawn task outcomes. Each outcome names an agent version; partial results and failures stay in the denominator.",
                  ],
                  [
                    "06",
                    "Privacy by default",
                    "Passports begin private. Listing exposes a profile summary publicly. Signed-in visitors can open the full listed record, including compensation and evidence links. Downloads may persist after access is removed.",
                  ],
                ].map(([n, t, p]) => (
                  <section className="panel" key={n}>
                    <span className="mono">{n}</span>
                    <h3>{t}</h3>
                    <p>{p}</p>
                  </section>
                ))}
              </div>
              <section className="panel standards">
                <div className="panel-heading">
                  <h2>Open foundations</h2>
                  <Globe2 size={20} />
                </div>
                {[
                  [
                    "W3C Verifiable Credentials 2.0",
                    "Credential data model for portable, signed records.",
                    "https://www.w3.org/TR/vc-data-model-2.0/",
                  ],
                  [
                    "W3C VC JOSE / COSE",
                    "VC-JWT envelopes using Ed25519 / EdDSA signatures.",
                    "https://www.w3.org/TR/vc-jose-cose/",
                  ],
                  [
                    "W3C Decentralized Identifiers",
                    "DID documents for the registry and registered passports; the did:web method is community specified.",
                    "https://www.w3.org/TR/did-core/",
                  ],
                  [
                    "Agent2Agent (A2A)",
                    "Complementary agent discovery and communication. Fisemarco records endpoint references; it does not act as an A2A runtime.",
                    "https://a2a-protocol.org/latest/specification/",
                  ],
                ].map(([t, d, url]) => (
                  <a href={url} target="_blank" rel="noreferrer" key={t}>
                    <div>
                      <strong>{t}</strong>
                      <p>{d}</p>
                    </div>
                    <ArrowUpRight size={18} />
                  </a>
                ))}
                <p className="small muted">
                  Fisemarco uses these standards as its technical foundation. This is
                  not an independently certified conformance or safety
                  assessment. Employment fields are a Fisemarco extension, not an
                  established universal AI employment standard.
                </p>
              </section>
            </>
          )}
        </main>
        <footer className="page-footer">
          <span>Fisemarco PASSPORT</span>
          <span>Built on open standards. Designed for accountability.</span>
        </footer>
      </SidebarInset>
      {form && (
        <PassportForm
          agent={form === "edit" ? selected || undefined : undefined}
          onClose={() => setForm(null)}
          onSaved={saved}
        />
      )}{" "}
      {recordKind && selected && (
        <RecordForm
          agent={selected}
          records={records}
          initialKind={recordKind}
          onClose={() => setRecordKind(null)}
          onSaved={recordSaved}
        />
      )}
      {detail && (
        <Dialog open onOpenChange={(v) => !v && setDetail(null)}>
          <DialogContent className="form-dialog record-dialog">
            <DialogHeader>
              <span className="eyebrow">
                SIGNED RECORD / #{detail.sequence}
              </span>
              <DialogTitle>{detail.title}</DialogTitle>
              <DialogDescription>
                {kinds[detail.kind]} · Recorded {date(detail.created)} ·{" "}
                {detail.withdrawn ? "Withdrawn" : "Preserved in ledger"}
              </DialogDescription>
            </DialogHeader>
            <div className="form-scroll">
              <dl className="identity-list">
                {Object.entries(detail.payload)
                  .filter(
                    ([k, v]) =>
                      ![
                        "id",
                        "kind",
                        "title",
                        "evidenceUrl",
                        "evidenceHash",
                      ].includes(k) &&
                      v !== "" &&
                      v !== undefined,
                  )
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt>{k.replace(/([A-Z])/g, " $1")}</dt>
                      <dd className="wrap">
                        {typeof v === "object"
                          ? JSON.stringify(v)
                          : typeof v === "boolean"
                            ? v
                              ? "Yes"
                              : "No"
                            : String(v)}
                      </dd>
                    </div>
                  ))}
              </dl>
              {detail.payload.evidenceUrl && (
                <a
                  className="evidence-link"
                  href={detail.payload.evidenceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Link2 size={17} />
                  Open supporting evidence
                  <ExternalLink size={14} />
                </a>
              )}
              {detail.payload.evidenceHash && (
                <div className="did-block">
                  <small>EVIDENCE SHA-256</small>
                  <code>{detail.payload.evidenceHash}</code>
                </div>
              )}
              <div className="did-block">
                <small>RECORD HASH</small>
                <code>{detail.hash}</code>
              </div>
              <div className="did-block">
                <small>RECORDED BY</small>
                <code>{detail.actor}</code>
              </div>
              <div className="form-note">
                {detail.actor.startsWith("agent:")
                  ? "Authenticated runtime report."
                  : "Owner-reported claim."}{" "}
                Fisemarco signs the receipt and preserves the source record; it does
                not independently verify the work or organization.
              </div>
            </div>
            <div className="dialog-actions">
              {selected?.canEdit &&
                !detail.withdrawn &&
                ![
                  "profile",
                  "correction",
                  "version",
                  "runtime_access",
                ].includes(detail.kind) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setWithdraw(detail);
                      setReason("");
                    }}
                    disabled={selected.status !== "active"}
                  >
                    Withdraw record
                  </Button>
                )}
              {selected?.canEdit &&
                selected.status === "active" &&
                detail.kind === "incident" &&
                !detail.withdrawn &&
                detail.payload.state !== "resolved" &&
                !liveRecords.some(
                  (r) =>
                    r.kind === "incident_resolution" &&
                    r.payload.incidentId === detail.id,
                ) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDetail(null);
                      setRecordKind("incident_resolution");
                    }}
                  >
                    Resolve incident
                  </Button>
                )}
              <Button onClick={() => copy(detail.jws)}>
                <Copy />
                Copy signed credential
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      <AlertDialog
        open={!!withdraw}
        onOpenChange={(v) => !v && !busy && setWithdraw(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw this record?</AlertDialogTitle>
            <AlertDialogDescription>
              The original stays in the ledger. It will be marked withdrawn and
              excluded from performance and employment summaries.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            aria-label="Reason for withdrawal"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why this record is being withdrawn"
            maxLength={4000}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy || reason.trim().length < 3}
              onClick={withdrawRecord}
            >
              {busy && <Loader2 className="spin" />}Withdraw record
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={share} onOpenChange={setShare}>
        <DialogContent className="share-dialog">
          <DialogHeader>
            <DialogTitle>A professional identity that travels.</DialogTitle>
            <DialogDescription>
              {selected?.visibility === "shared"
                ? "This profile is listed publicly. Opening the complete passport requires sign-in."
                : "This passport is private. Only your workspace can open it until you choose to list it."}
            </DialogDescription>
          </DialogHeader>
          {qr && (
            <Image
              unoptimized
              src={qr}
              width={220}
              height={220}
              alt={"QR code for " + selected?.code}
            />
          )}
          <code>{selected?.code}</code>
          <Input
            readOnly
            aria-label="Passport link"
            value={
              typeof window !== "undefined" && selected
                ? `${window.location.origin}/p/${selected.code}`
                : ""
            }
          />
          <div className="dialog-actions">
            {selected?.canEdit && selected.visibility === "private" && (
              <Button
                variant="outline"
                onClick={() => {
                  setShare(false);
                  setForm("edit");
                }}
              >
                Change visibility
              </Button>
            )}
            <Button
              onClick={() =>
                selected && copy(`${window.location.origin}/p/${selected.code}`)
              }
            >
              <Copy />
              Copy link
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={keyForm} onOpenChange={setKeyForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create an API key</DialogTitle>
            <DialogDescription>
              The key will expire in 90 days. Store it securely; it is only
              shown once.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createKey}>
            <Field
              name="label"
              label="Key name"
              required
              maxLength={60}
              placeholder="e.g. Production task recorder"
            />
            <SelectField name="scope" label="Access scope" defaultValue="read">
              <NativeSelectOption value="read">
                Read — passports and verification
              </NativeSelectOption>
              <NativeSelectOption value="write">
                Read and write — passports and records
              </NativeSelectOption>
            </SelectField>
            <div className="dialog-actions">
              <Button disabled={busy}>Create key</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!newKey} onOpenChange={(v) => !v && setNewKey("")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save your API key</DialogTitle>
            <DialogDescription>
              Copy it now. You will not be able to view it again.
            </DialogDescription>
          </DialogHeader>
          <Textarea readOnly aria-label="New API key" value={newKey} />
          <Button onClick={() => copy(newKey)}>
            <Copy />
            Copy API key
          </Button>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!revoke} onOpenChange={(v) => !v && setRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {revoke?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Requests using this key will be rejected immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await api("keys/" + revoke!.id, { method: "DELETE" });
                  setKeys((await api<{ keys: ApiKey[] }>("keys")).keys);
                  setRevoke(null);
                  toast.success("API key revoked");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Revoke key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
