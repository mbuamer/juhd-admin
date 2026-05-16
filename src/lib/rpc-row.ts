/** Normalize Supabase RPC payloads (array row, single object, or empty). */
export function rpcFirstRow(data: unknown): Record<string, unknown> | null {
  if (data == null) return null;

  if (Array.isArray(data)) {
    if (data.length === 0) return null;
    const r = data[0];
    if (r && typeof r === "object" && !Array.isArray(r)) return r as Record<string, unknown>;
    return null;
  }

  if (typeof data === "object") {
    const o = data as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length === 0) return null;
    const looksLikeRow = keys.some((k) =>
      /_(total|today|week|month|period|count)$/.test(k) ||
      /^(posts|comments|likes|checkins|deletions)_/i.test(k) ||
      k === "top_gyms" ||
      k === "posts_by_type"
    );
    if (looksLikeRow) return o;
  }

  return null;
}
