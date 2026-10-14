"use client";

import { useEffect, useRef, useState } from "react";

const key = "fisemarco.cookie-notice";
const version = "2026-10-13";
const lifetime = 180 * 24 * 60 * 60 * 1000;

export default function CookieNotice() {
  const [open, setOpen] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      setOpen(!saved || saved.version !== version || typeof saved.expires !== "number" || saved.expires <= Date.now());
    } catch { setOpen(true); }
    const reopen = () => {
      setOpen(true);
      requestAnimationFrame(() => close.current?.focus());
    };
    window.addEventListener("fisemarco:cookie-settings", reopen);
    return () => window.removeEventListener("fisemarco:cookie-settings", reopen);
  }, []);
  function dismiss() {
    try { localStorage.setItem(key, JSON.stringify({ version, expires: Date.now() + lifetime })); }
    catch { setStorageError(true); }
    setOpen(false);
    requestAnimationFrame(() => document.getElementById("cookie-settings-link")?.focus());
  }
  return <>
    {open && <section className="cookie-notice" aria-labelledby="cookie-title" onKeyDown={e => { if (e.key === "Escape") dismiss(); }}>
      <div>
        <h2 id="cookie-title">Your privacy, by default</h2>
        <p>This application uses no advertising or analytics trackers. Hosting and sign-in services may use cookies for authentication and security. We remember your dismissal for 180 days on this device.</p>
        <p><a href="/cookies">Cookie policy</a> · <a href="/privacy-policy">Privacy policy</a></p>
        {storageError && <p role="status">Your browser blocked storage. This notice may appear again when you return.</p>}
      </div>
      <button ref={close} onClick={dismiss}>Dismiss notice</button>
    </section>}
  </>;
}
