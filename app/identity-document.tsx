"use client";
import Image from "next/image";
import BrandMark from "./brand-mark";
import type { Seal } from "@/lib/client-types";
import {
  Fingerprint,
  ShieldCheck,
  Copy,
  LockKeyhole,
  ArrowDownToLine,
} from "lucide-react";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { Agent } from "@/lib/model";
export default function IdentityDocument({
  agent,
  seal,
  onCopy,
}: {
  agent: Agent;
  seal: Seal | null;
  onCopy: (value: string) => void;
}) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(window.location.origin + "/p/" + agent.code, {
      width: 180,
      margin: 1,
      color: { dark: "#102a38", light: "#ffffff" },
    })
      .then((s) => active && setQr(s))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [agent.code]);
  const birth = seal?.birthHash || "";
  return (
    <div className="identity-document-wrap">
      <article
        className="identity-document"
        aria-label={"Lifetime identity card for " + agent.name}
      >
        <div className="identity-guilloche" aria-hidden="true" />
        <div className="identity-card-top">
          <span>
            <BrandMark size={24} />
            <b>Fisemarco</b> PASSPORT
          </span>
          <span className="identity-lock">
            <LockKeyhole size={12} /> LIFETIME IDENTITY
          </span>
        </div>
        <div className="identity-card-main">
          <div className="identity-portrait" aria-hidden="true">
            <Fingerprint size={76} strokeWidth={0.85} />
            <span>{agent.code.slice(-4)}</span>
          </div>
          <div className="identity-card-person">
            <small>AI AGENT / AI EMPLOYEE</small>
            <h2>{agent.name}</h2>
            <p>{agent.role}</p>
            <div>
              <small>ORGANIZATION · REPORTED</small>
              <strong>{agent.organization}</strong>
            </div>
          </div>
          <div className="identity-foil" aria-hidden="true">
            <ShieldCheck size={25} />
            <span>
              Fisemarco
              <br />
              IDENTITY
            </span>
          </div>
        </div>
        <button
          className="identity-code"
          onClick={() => onCopy(agent.code)}
          title="Copy permanent personnel code"
        >
          <span>
            <small>PERMANENT PERSONNEL CODE</small>
            {agent.code}
          </span>
          <Copy size={16} />
        </button>
        <div className="identity-card-base">
          <div>
            <small>FIRST ISSUED</small>
            <strong>
              {new Date(agent.created).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </strong>
            <small>IDENTITY DOES NOT EXPIRE</small>
          </div>
          <div>
            <small>CURRENT RECORD</small>
            <strong>{String(agent.revision).padStart(4, "0")}</strong>
            <span className="identity-state">{agent.status}</span>
          </div>
          <a
            href={"/p/" + agent.code}
            className="identity-qr"
            aria-label="Open sign-in protected passport"
          >
            {qr ? (
              <Image
                unoptimized
                src={qr}
                width={78}
                height={78}
                alt="Sign in to view this passport QR code"
              />
            ) : (
              <LockKeyhole size={30} />
            )}
            <span>SCAN · SIGN IN · VERIFY</span>
          </a>
        </div>
        <div className="identity-machine" aria-hidden="true">
          Fisemarco&lt;{agent.code.replaceAll("-", "")}&lt;&lt;
          {(birth || "").slice(0, 20).toUpperCase()}
        </div>
      </article>
      <div className="identity-seal-bar">
        <div>
          <LockKeyhole size={18} />
          <span>
            <strong>
              {seal?.signatureValid
                ? "Original identity sealed"
                : "Checking original identity"}
            </strong>
            <small>Permanent code. Signed changes. Original preserved.</small>
          </span>
        </div>
        {seal && (
          <a
            href={"/api/v1/agents/" + agent.code + "/identity-lock"}
            download={agent.code + "-identity-seal.json"}
            aria-label="Download original identity seal"
          >
            <ArrowDownToLine size={18} />
          </a>
        )}
      </div>
      {seal && (
        <details className="identity-seal-details">
          <summary>Inspect the lifetime identity seal</summary>
          <p>
            Normal edits preserve this original registration. Explicit privacy
            erasure retires the code and removes its records. Current details
            can change through signed additions.
          </p>
          <dl>
            <dt>Permanent identity</dt>
            <dd>{seal.identityId}</dd>
            <dt>Birth record SHA-256</dt>
            <dd>{seal.birthHash}</dd>
          </dl>
          <button onClick={() => onCopy(seal.birthHash)}>
            Copy seal fingerprint <Copy size={13} />
          </button>
          <p>
            Keep an independent copy to detect a rewritten identity. Privileged
            infrastructure access remains a trust boundary.
          </p>
        </details>
      )}
    </div>
  );
}
