export function passportCode(value: string, origin: string): string | null {
  const raw = value.trim();
  const pattern = /^FTAI-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/;
  if (pattern.test(raw.toUpperCase())) return raw.toUpperCase();
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin || url.username || url.password) return null;
    const match = url.pathname.match(
      /^\/p\/(FTAI-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4})\/?$/,
    );
    return match ? match[1].toUpperCase() : null;
  } catch {
    return null;
  }
}
