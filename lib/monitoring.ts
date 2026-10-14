export type OutcomeCount = {
  agent: string;
  window: string;
  outcome: string;
  count: number;
};
export function outcomeTrend(agent: string, activity: OutcomeCount[]) {
  const rows = activity.filter((r) => r.agent === agent);
  const stats = (window: string) => {
    const sample = rows.filter((r) => r.window === window);
    return {
      n: sample.reduce((n, r) => n + r.count, 0),
      failed: sample
        .filter((r) => r.outcome === "failed")
        .reduce((n, r) => n + r.count, 0),
    };
  };
  const current = stats("current"),
    previous = stats("previous");
  const enough = current.n >= 20 && previous.n >= 20;
  const delta = enough
    ? current.failed / current.n - previous.failed / previous.n
    : null;
  // Compare integer cross-products so an exact 20-point increase is not lost to floating point rounding.
  const breached =
    enough &&
    (current.failed * previous.n - previous.failed * current.n) * 5 >=
      current.n * previous.n;
  return {
    agent,
    current,
    previous,
    failureRateIncrease: delta,
    alert: breached
      ? "Reported failure rate increased by at least 20 percentage points"
      : enough
        ? "No threshold breach"
        : "Insufficient samples (20 per window required)",
    provenance: "authenticated-runtime-reported",
  };
}
