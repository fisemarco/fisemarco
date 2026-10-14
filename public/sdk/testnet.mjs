/** FTAI Testnet SDK. These credentials never authorize production work. */
import { generateKeyPairSync, createHash, sign, randomUUID } from "node:crypto";
const hash = (s) => createHash("sha256").update(s).digest("hex");
export class FTAITestnet {
  constructor(baseUrl, key) {
    const u = new URL(baseUrl);
    if (
      u.protocol !== "https:" &&
      !(
        u.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(u.hostname)
      )
    )
      throw Error("HTTPS required");
    this.base = u.origin;
    this.enrollmentKey = key;
    const pair = generateKeyPairSync("ed25519");
    this.key = pair.privateKey;
    this.publicKey = pair.publicKey.export({ format: "jwk" });
    this.code = null;
  }
  async send(endpoint, body, headers = {}) {
    const r = await fetch(this.base + "/api/v1/testnet/" + endpoint, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json", ...headers },
      body,
      signal: AbortSignal.timeout(30000),
    });
    const d = await r.json();
    if (!r.ok)
      throw Object.assign(Error(d.error || "Testnet error"), {
        status: r.status,
      });
    if (d.productionValid !== false || d.environment !== "testnet")
      throw Error("Unexpected environment");
    return d;
  }
  async enroll(name) {
    const body = JSON.stringify({ name, publicKey: this.publicKey });
    const message = ["FTAI-Testnet-Enrollment-v1", this.base, hash(body)].join(
      "\n",
    );
    const d = await this.send("enroll", body, {
      Authorization: "Bearer " + this.enrollmentKey,
      "X-FTAI-Signature": sign(null, Buffer.from(message), this.key).toString(
        "base64url",
      ),
    });
    this.code = d.code;
    return d;
  }
  async request(endpoint, input) {
    if (!["authorize", "consume"].includes(endpoint) || !this.code)
      throw Error("Enroll first and use an allowed testnet endpoint");
    const body = JSON.stringify(input),
      time = String(Math.floor(Date.now() / 1000)),
      nonce = randomUUID(),
      path = "/api/v1/testnet/" + endpoint;
    const message = [
      "FTAI-Testnet-Request-v1",
      this.base,
      this.code,
      "POST",
      path,
      time,
      nonce,
      hash(body),
    ].join("\n");
    return this.send(endpoint, body, {
      "X-FTAI-Agent": this.code,
      "X-FTAI-Timestamp": time,
      "X-FTAI-Nonce": nonce,
      "X-FTAI-Signature": sign(null, Buffer.from(message), this.key).toString(
        "base64url",
      ),
    });
  }
}
