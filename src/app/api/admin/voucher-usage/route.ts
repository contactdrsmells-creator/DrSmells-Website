import { createClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/admin-auth";

/**
 * What a voucher has actually earned, counted from paid orders.
 *
 * Replaces the vouchers.used_count column, which was incremented when the
 * order was created — before the customer reached the payment page. Every
 * abandoned checkout burned a use, so the figure counted attempts rather than
 * sales, and against a shop where most checkouts are abandoned it ran far
 * ahead of reality. It was also a read-then-write, so two people checking out
 * at once both read the same number and one use vanished.
 *
 * Counting the orders removes both problems: there is one record of what
 * happened, and it cannot drift from it.
 *
 * Without `code`, returns a count per voucher for the list. With one, returns
 * the orders themselves.
 */

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

interface OrderRow {
  order_number: string;
  total: number | string | null;
  discount: number | string | null;
  voucher_code: string | null;
  payment_status: string | null;
  created_at: string;
  shipping: { name?: string; email?: string } | null;
}

const money = (value: unknown) => Number(value) || 0;

export async function GET(request: Request) {
  // Order-level detail, so the same bar as viewing orders.
  const auth = await requirePermission("orders.view");
  if (auth instanceof Response) return auth;

  const code = new URL(request.url).searchParams.get("code");
  const supabase = getSupabase();

  let query = supabase
    .from("orders")
    .select("order_number, total, discount, voucher_code, payment_status, created_at, shipping")
    .eq("payment_status", "paid")
    .not("voucher_code", "is", null)
    .order("created_at", { ascending: false });

  // Matched case-insensitively: a voucher typed in lower case at checkout is
  // still the same voucher.
  if (code) query = query.ilike("voucher_code", code);

  const { data, error } = await query.limit(1000);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (data || []) as OrderRow[];

  if (!code) {
    // One entry per code for the list screen.
    const counts: Record<string, { orders: number; discount: number; revenue: number }> = {};
    for (const row of rows) {
      const key = String(row.voucher_code || "").toUpperCase();
      if (!key) continue;
      counts[key] = counts[key] || { orders: 0, discount: 0, revenue: 0 };
      counts[key].orders += 1;
      counts[key].discount += money(row.discount);
      counts[key].revenue += money(row.total);
    }
    return Response.json({ counts });
  }

  return Response.json({
    code,
    orders: rows.map((row) => ({
      order_number: row.order_number,
      customer: row.shipping?.name || "—",
      email: row.shipping?.email || "",
      total: money(row.total),
      discount: money(row.discount),
      created_at: row.created_at,
    })),
    summary: {
      orders: rows.length,
      discount: rows.reduce((sum, row) => sum + money(row.discount), 0),
      revenue: rows.reduce((sum, row) => sum + money(row.total), 0),
    },
  });
}
