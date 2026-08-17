/** Shared with the server's normaliser — codes are read aloud and typed by hand. */
export function normalise(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, "")
    .slice(0, 4);
}
