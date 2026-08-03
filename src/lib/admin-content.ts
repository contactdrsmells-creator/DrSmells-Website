/**
 * Client helper for admin content writes.
 *
 * Admin pages used to call supabase.from(...).insert/update/delete directly
 * from the browser using the public anon key, which meant those tables had to
 * be publicly writable. These go through the server instead, so the session and
 * role are checked and the tables can be locked down.
 *
 * Returns { error } in the same shape the Supabase client used, so call sites
 * keep their existing error handling.
 */

interface Result {
  error: { message: string } | null;
  data?: unknown;
}

async function send(method: string, body: unknown, query = ""): Promise<Result> {
  try {
    const res = await fetch(`/api/admin/content${query}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "DELETE" ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: { message: json.error || `Request failed (${res.status})` } };
    return { error: null, data: json.data };
  } catch (err) {
    return { error: { message: err instanceof Error ? err.message : "Request failed" } };
  }
}

export function createRecord(table: string, data: unknown): Promise<Result> {
  return send("POST", { table, data });
}

/** `id` is optional in several admin types; a missing one is reported, not sent. */
export function updateRecord(table: string, id: string | undefined, data: unknown): Promise<Result> {
  if (!id) return Promise.resolve({ error: { message: "Nothing to update — record has no id" } });
  return send("PUT", { table, id, data });
}

export function deleteRecord(table: string, id: string): Promise<Result> {
  return send("DELETE", null, `?table=${encodeURIComponent(table)}&id=${encodeURIComponent(id)}`);
}

/** site_settings is keyed by `key` rather than id. */
export function upsertSetting(key: string, value: unknown): Promise<Result> {
  return send("PUT", {
    table: "site_settings",
    data: { key, value, updated_at: new Date().toISOString() },
  });
}
