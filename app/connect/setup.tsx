"use client";
import { useState } from "react";
const origin = "https://fisemarco.com";
const prompt = `Connect the AI runtime I am building to Fisemarco (FTAI-compatible). Start with ftai_builder_setup if the FTAI connection is available; otherwise read ${origin}/llm-start.md. Inspect my existing identities before creating one. Help me configure authorised enrollment, persist its identity across restarts, assign it to my organisation, and assess it for FTAI Runtime Identity certification. Explain failed checks and issue a certificate only when I request it and the checks pass. Read my Intelligence Control policy and propose configuration using actual tools and evaluated models; save only configuration I request, preserve existing settings and use expectedVersion. Start new integrations in shadow mode unless I choose otherwise. Integrate the local IntelligenceControl executor with output validators and bounded authority. Inspect real metrics and traces; never invent capability evaluation evidence. Keep keys and raw context in the runtime, never in chat or tool arguments. Keep the passport private. Test enrollment, restart continuity, denied work, revocation and trace delivery.`;
export function ConnectKit() {
  const [copied, setCopied] = useState("");
  const [failed, setFailed] = useState(false);
  async function copy(text: string, name: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(name);
      setFailed(false);
    } catch {
      setFailed(true);
      setCopied("");
    }
  }
  return (
    <section className="connect-kit" aria-labelledby="connect-prompt">
      <div>
        <span className="public-eyebrow">ONE INSTRUCTION</span>
        <h2 id="connect-prompt">Tell your assistant what to build.</h2>
        <p>
          Paste this into your coding assistant. Connect the Fisemarco plugin first
          when available.
        </p>
        <textarea
          aria-label="Fisemarco setup instruction"
          readOnly
          value={prompt}
          rows={7}
        />
        <button type="button" onClick={() => copy(prompt, "instruction")}>
          {copied === "instruction"
            ? "Instruction copied"
            : "Copy setup instruction"}
        </button>
      </div>
      <div>
        <h3>One MCP endpoint</h3>
        <p>
          For clients supporting Streamable HTTP and the hosting provider’s
          OAuth flow.
        </p>
        <input
          aria-label="Fisemarco MCP endpoint"
          readOnly
          value={origin + "/mcp"}
        />
        <button type="button" onClick={() => copy(origin + "/mcp", "endpoint")}>
          {copied === "endpoint" ? "Endpoint copied" : "Copy endpoint"}
        </button>
        <p role="status" aria-live="polite">
          {failed
            ? "Clipboard unavailable. Select the text above and copy it manually."
            : copied
              ? "Copied to clipboard."
              : "Start with ftai_builder_setup after connecting."}
        </p>
        <a href="/llm-start.md">Open the complete setup guide →</a>
      </div>
    </section>
  );
}
