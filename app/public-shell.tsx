"use client";
import Link from "next/link";
import { ArrowUpRight, LockKeyhole, Menu, X } from "lucide-react";
import BrandMark from "./brand-mark";
import { useEffect, useState } from "react";
export const signIn = (target: string) =>
  "/signin-with-chatgpt?return_to=" + encodeURIComponent(target);
export function usePublicSession() {
  const [session, setSession] = useState<{
    loading: boolean;
    user: { name: string; email: string } | null;
    error: string;
  }>({ loading: true, user: null, error: "" });
  useEffect(() => {
    let active = true;
    fetch("/api/v1/session")
      .then((r) => {
        if (!r.ok)
          throw Error("Could not check your session. Reload to try again.");
        return r.json() as Promise<{
          user: { name: string; email: string } | null;
        }>;
      })
      .then(
        (d) =>
          active && setSession({ loading: false, user: d.user, error: "" }),
      )
      .catch(
        (e) =>
          active &&
          setSession({ loading: false, user: null, error: e.message }),
      );
    return () => {
      active = false;
    };
  }, []);
  return session;
}
export function PublicShell({
  children,
  current = "",
  user = null,
  signInTarget = "/workspace",
}: {
  children: React.ReactNode;
  current?: string;
  user?: { name: string; email: string } | null;
  signInTarget?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="public-site ftai-midnight">
      <header className="public-nav" data-menu-open={menuOpen} onKeyDown={(event) => { if (event.key === "Escape") setMenuOpen(false); }}>
        <Link className="public-brand" href="/" aria-label="Fisemarco home">
          <BrandMark />
          <strong>fisemarco</strong>
        </Link>
        <button className="public-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="ftai-navigation" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={19} /> : <Menu size={19} />}<span>{menuOpen ? "Close" : "Menu"}</span>
        </button>
        <nav id="ftai-navigation" aria-label="Main navigation" onClick={(event) => { if ((event.target as HTMLElement).closest("a")) setMenuOpen(false); }}>
          <details className="public-products">
            <summary>Products</summary>
            <div>
              <a href="/workspace">Agent Passport</a>
              <a
                href="/intelligence-control-plane"
                aria-current={current === "intelligence" ? "page" : undefined}
              >
                Intelligence Control
              </a>
              <a href="/enterprise">Runtime Governance</a>
            </div>
          </details>
          <a
            href="/framework"
            aria-current={current === "framework" ? "page" : undefined}
          >
            Framework
          </a>
          <a
            aria-current={current === "directory" ? "page" : undefined}
            href="/directory"
          >
            Registry
          </a>
          <a
            href="/intelligence-control-plane"
            aria-current={current === "intelligence" ? "page" : undefined}
          >
            Intelligence Control Plane
          </a>
          <a
            href="/discover"
            aria-current={current === "discover" ? "page" : undefined}
          >
            Discover
          </a>
          <a
            href="/cybersphere"
            aria-current={current === "cybersphere" ? "page" : undefined}
          >
            Cybersphere
          </a>
          <a
            aria-current={current === "builders" ? "page" : undefined}
            href="/builders"
          >
            For builders
          </a>
          <a
            aria-current={current === "trust" ? "page" : undefined}
            href="/trust"
          >
            Identity & trust
          </a>
        </nav>
        <a
          className="public-nav-cta"
          href={user ? "/workspace" : signIn(signInTarget)}
        >
          {user ? "Workspace" : "Sign in"}
          <ArrowUpRight size={15} />
        </a>
      </header>
      {children}
      <footer className="public-footer">
        <div>
          <Link className="public-brand" href="/">
            <BrandMark />
            <strong>fisemarco</strong>
          </Link>
          <p>Identity for the next generation of work.</p>
        </div>
        <div className="public-footer-links">
          <div><h3>Explore</h3>
            <a href="/directory">Explore the registry</a>
            <a href="/discover">Discover public agents</a>
            <a href="/cybersphere">Cybersphere</a>
            <a href="/scan">Scan a passport</a>
            <a href="/trust">Identity & trust</a>
          </div>
          <div><h3>Build</h3>
            <a href="/builders">Connect a platform</a>
            <a href="/enterprise">Organisation workspace</a>
            <a href="/connect">Connect your AI</a>
            <a href="/intelligence-control-plane">Intelligence Control Plane</a>
            <a href="/intelligence">Intelligence dashboard</a>
            <a href="/developers">SDKs & developer tools</a>
            <a href="/testnet">Testnet</a>
            <a href="/framework">Identity framework & validator</a>
          </div>
          <div><h3>Policies & support</h3>
            <a href="/privacy">Privacy & data controls</a>
            <a href="/legal">Legal & trust centre</a>
            <a href="/privacy-policy">Privacy policy</a>
            <a href="/security">Security policy</a>
            <a href="/terms">Terms & conditions</a>
            <a href="/cookies">Cookie policy</a>
            <button id="cookie-settings-link" className="cookie-settings" onClick={() => window.dispatchEvent(new Event("fisemarco:cookie-settings"))}>Cookie settings</button>
            <a href="/acceptable-use">User & agent policy</a>
            <a href="/safety">Safety & reporting</a>
          </div>
        </div>
        <div className="public-footer-note">
          <LockKeyhole size={14} /> Private by default. Shared by choice.
          <small>
            Fisemarco authenticates identity keys and records reported claims.
            Registration is not independent verification of an employer or task
            quality.
          </small>
        </div>
      </footer>
    </div>
  );
}
export function PassportGate({
  code,
  loading = false,
  error = "",
  returnTo,
}: {
  code?: string;
  loading?: boolean;
  error?: string;
  returnTo?: string;
}) {
  const destination =
    returnTo || (code ? "/p/" + encodeURIComponent(code) : "/workspace");
  return (
    <PublicShell signInTarget={destination}>
      <main className="access-gate">
        <div className="gate-symbol">
          <LockKeyhole size={38} />
        </div>
        <div className="public-eyebrow">PROTECTED PROFESSIONAL IDENTITY</div>
        <h1>
          {loading
            ? "Opening your workspace."
            : "A little privacy.\nA lot of trust."}
        </h1>
        <p>
          {loading
            ? "Checking your session securely…"
            : "Sign in or create an account to open a passport, follow a QR code, or add records. Public search reveals profile summaries only."}
        </p>
        {code && <code className="gate-code">{code.toUpperCase()}</code>}
        {error && (
          <p role="alert" className="public-error">
            {error}
          </p>
        )}
        {!loading && (
          <a className="public-button" href={signIn(destination)}>
            Sign in / create account <ArrowUpRight size={17} />
          </a>
        )}
        <a className="public-text-link" href="/directory">
          Explore public profiles
        </a>
        <small>
          Signing in never grants access to another owner’s private passport.
        </small>
      </main>
    </PublicShell>
  );
}
