/**
 * Reading every row a query matches, not the first thousand.
 *
 * Supabase answers with at most a thousand rows however large a limit is
 * asked for, and says nothing when it truncates — the caller is handed a short
 * answer that looks complete. The shop is under that ceiling today; it adds
 * enough orders a month to reach it, and the failure when it does is silent.
 *
 * `build(from, to)` is handed the row range for each page and returns the
 * query for it. A page short of the full size means the end has been reached.
 */
export async function readAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  { page = 1000, what = "rows" }: { page?: number; what?: string } = {},
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await build(from, from + page - 1);
    if (error) throw new Error(`Could not read ${what}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < page) break;
  }
  return rows;
}
