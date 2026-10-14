import { db, config, HttpError } from "./server";
import { digest } from "./crypto";

/** Atomic fixed-window limits. The edge must overwrite CF-Connecting-IP. */
export async function rateLimit(
  subject: string,
  limit: number,
  seconds: number,
) {
  const now = Math.floor(Date.now() / 1000);
  const window = Math.floor(now / seconds);
  // A keyed, rotating digest avoids retaining raw IP addresses or reusable IP hashes.
  const id = await digest(config().jwk.d + ":" + window + ":" + subject);
  await db()
    .prepare("DELETE FROM request_limits WHERE expires<?")
    .bind(now)
    .run();
  const row = await db()
    .prepare(
      "INSERT INTO request_limits(id,count,expires) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=request_limits.count+1 RETURNING count",
    )
    .bind(id, (window + 1) * seconds)
    .first<{ count: number }>();
  if (!row || row.count > limit)
    throw new HttpError(
      429,
      "Request limit reached. Retry after this rate-limit window ends.",
    );
}
export function clientBucket(req: Request) {
  return req.headers.get("cf-connecting-ip") || "shared-proxy";
}
export function rejectCrossOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin)
    throw new HttpError(403, "Cross-origin mutations are not allowed.");
}
