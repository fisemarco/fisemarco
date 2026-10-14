/** One illustrative registration cycle. No real registry state is implied. */
export function identityJourney(seconds: number, offset = 0) {
  const phase = (((seconds + offset) % 12) + 12) % 12;
  const incoming = phase < 4;
  const processing = phase >= 4 && phase < 5.4;
  const departing = phase >= 5.4;
  const progress = incoming ? phase / 4 : Math.max(0, (phase - 5.4) / 6.6);
  return {
    x: incoming ? -4 + progress * 3 : processing ? 0 : 1 + progress * 3.7,
    y: -0.1 + Math.sin(progress * Math.PI) * 0.12,
    visible: !processing,
    registered: departing,
    badgeScale: departing ? Math.min(1, (phase - 5.4) / 0.8) : 0,
    scale:
      phase > 11
        ? 0.72 * (12 - phase)
        : incoming && phase < 0.6
          ? (0.72 * phase) / 0.6
          : 0.72,
    processing,
  };
}
