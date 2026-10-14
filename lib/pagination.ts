import { z } from "zod";

/** Newest-first keyset pagination. The ID breaks ties without skipping equal timestamps. */
export function descendingCursor(
  input: unknown,
  defaultLimit = 100,
  maxLimit = 200,
) {
  const q = z
    .object({
      after: z.string().max(100).default(""),
      limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
    })
    .strict()
    .parse(input);
  const cursor = q.after
    ? q.after.split("|")
    : ["9999-12-31T23:59:59.999Z", "ffffffff-ffff-ffff-ffff-ffffffffffff"];
  z.tuple([z.string().datetime(), z.string().uuid()]).parse(cursor);
  return { created: cursor[0], id: cursor[1], limit: q.limit };
}
export function descendingPage<T extends { id: string; created: string }>(
  rows: T[],
  limit: number,
) {
  const items = rows.slice(0, limit);
  return {
    items,
    next:
      rows.length > limit
        ? items[limit - 1].created + "|" + items[limit - 1].id
        : null,
  };
}
