"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Camera, ArrowRight, X } from "lucide-react";
import jsQR from "jsqr";
import { PassportGate, PublicShell, usePublicSession } from "../public-shell";
import { passportCode } from "@/lib/scan";
export default function Scanner() {
  const router = useRouter();
  const session = usePublicSession();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const media = useRef<MediaStream | null>(null);
  const opening = useRef(false);
  const mounted = useRef(true);
  const stop = useCallback(() => {
    media.current?.getTracks().forEach((t) => t.stop());
    media.current = null;
    setStream(null);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      media.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  const open = useCallback(
    (raw: string) => {
      const code = passportCode(raw, window.location.origin);
      if (!code) {
        setError(
          "Use a Fisemarco personnel code or a passport QR from this registry.",
        );
        return false;
      }
      if (opening.current) return true;
      opening.current = true;
      stop();
      router.push("/p/" + code);
      return true;
    },
    [router, stop],
  );
  async function camera() {
    setError("");
    setBusy(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error(
          "Camera scanning is unavailable in this browser. Upload a QR image or enter the code.",
        );
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      if (!mounted.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      media.current = s;
      setStream(s);
    } catch (e) {
      setError(
        (e as Error).name === "NotAllowedError"
          ? "Camera permission was declined. Upload a QR image or enter the personnel code."
          : (e as Error).name === "NotFoundError"
            ? "No camera was found. Upload a QR image or enter the personnel code."
            : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!stream || !video.current) return;
    const v = video.current;
    v.srcObject = stream;
    v.play().catch(() =>
      setError(
        "Camera playback could not start. Use an image or code instead.",
      ),
    );
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const timer = setInterval(() => {
      if (v.readyState < 2 || !ctx) return;
      canvas.width = Math.min(800, v.videoWidth);
      canvas.height = Math.round((v.videoHeight * canvas.width) / v.videoWidth);
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const qr = jsQR(pixels.data, pixels.width, pixels.height);
      if (qr) open(qr.data);
    }, 350);
    return () => clearInterval(timer);
  }, [stream, open]);
  async function upload(f?: File) {
    if (!f) return;
    setError("");
    if (f.size > 12 * 1024 * 1024) {
      setError("Choose a QR image smaller than 12 MB.");
      return;
    }
    stop();
    setBusy(true);
    const url = URL.createObjectURL(f);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const qr = jsQR(pixels.data, pixels.width, pixels.height);
      if (!qr)
        throw Error(
          "No readable QR code was found. Try a sharper image or enter the code.",
        );
      open(qr.data);
    } catch (e) {
      setError(
        (e as Error).message === "The source image cannot be decoded."
          ? "This image could not be opened. Use PNG or JPEG."
          : (e as Error).message,
      );
    } finally {
      URL.revokeObjectURL(url);
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  }
  if (session.loading || !session.user)
    return (
      <PassportGate
        returnTo="/scan"
        loading={session.loading}
        error={session.error}
      />
    );
  return (
    <PublicShell user={session.user}>
      <main className="public-section scan-page">
        <div className="public-eyebrow">SCAN · IDENTIFY · VERIFY</div>
        <h1>
          Open a passport.
          <br />
          <em>Know the identity.</em>
        </h1>
        <p>
          Scan a Fisemarco QR code, upload its image, or enter a personnel code.
          Your images stay in this browser.
        </p>
        <div className="scan-box">
          <div className="scan-actions">
            {stream ? (
              <button className="public-button secondary" onClick={stop}>
                <X size={16} />
                Stop camera
              </button>
            ) : (
              <button
                className="public-button"
                onClick={camera}
                disabled={busy}
              >
                <Camera size={17} />
                {busy ? "Opening…" : "Use camera"}
              </button>
            )}
            <button
              className="public-button secondary"
              onClick={() => file.current?.click()}
              disabled={busy}
            >
              Upload QR image
            </button>
            <input
              ref={file}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => upload(e.target.files?.[0])}
            />
          </div>
          {stream && (
            <div className="scan-video">
              <video
                ref={video}
                muted
                playsInline
                aria-label="Live QR camera preview"
              />
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              open(value);
            }}
          >
            <label htmlFor="scan-personnel">
              Or enter a personnel code / passport URL
            </label>
            <div className="scan-input-row">
              <input
                id="scan-personnel"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                maxLength={500}
                placeholder="FTAI-XXXX-XXXX-XXXX"
                autoComplete="off"
              />
              <button className="public-button" type="submit">
                Open <ArrowRight size={16} />
              </button>
            </div>
          </form>
          {error && (
            <div className="public-error scan-error" role="alert">
              {error}
            </div>
          )}
          <small>
            Only this registry’s QR destinations are accepted. Private passports
            still require the owning account; sign-in alone does not grant
            access.
          </small>
        </div>
      </main>
    </PublicShell>
  );
}
