import { createClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/admin-auth";
import { auditOne, auditPayments } from "@/lib/payment-audit";

/**
 * Reconciling orders against Atome, Stripe and DOKU.
 *
 * Behind settings.manage rather than orders.view: it reads live payment
 * records and names what each customer paid, which is more than the person who
 * packs the parcels needs.
 *
 * Read-only — see payment-audit.ts for why nothing here fixes what it finds.
 */

// Several hundred provider lookups, five at a time.
export const maxDuration = 300;

const METHODS = ["atome", "stripe", "doku"];

export async function GET(request: Request) {
  const auth = await requirePermission("settings.manage");
  if (auth instanceof Response) return auth;

  const params = new URL(request.url).searchParams;

  // One order, asked about on purpose. The sweep below is the blunt version:
  // it reads hundreds of orders to find the few that disagree, and most of
  // what it turns up is a cart nobody ever paid. Looking up a single order
  // somebody has a reason to doubt — a customer saying they paid, a parcel
  // about to go out — is the use that holds up.
  const one = (params.get("order") || "").trim().toUpperCase();
  if (one) {
    if (!/^[A-Z0-9-]{3,40}$/.test(one)) {
      return Response.json({ error: "That does not look like an order number" }, { status: 400 });
    }
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    try {
      const { rows } = await auditOne(db, one);
      if (!rows.length) return Response.json({ error: `No order ${one} on this website` }, { status: 404 });
      return Response.json({ checked: 1, single: true, problems: rows, summary: null });
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 500 });
    }
  }

  const asked = (params.get("methods") || "atome,stripe")
    .split(",")
    .map((m) => m.trim().toLowerCase())
    .filter((m) => METHODS.includes(m));
  if (!asked.length) {
    return Response.json({ error: `methods must be some of: ${METHODS.join(", ")}` }, { status: 400 });
  }

  // Bounded so a mistyped number cannot ask for a year of lookups.
  const days = Math.min(Math.max(Number(params.get("days")) || 30, 1), 180);
  const limit = Math.min(Math.max(Number(params.get("limit")) || 400, 1), 1000);

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  try {
    const { rows, checked, summary } = await auditPayments(db, { methods: asked, days, limit });

    // Everything that agrees is left out: a list of four hundred fine orders
    // buries the two that are not.
    const problems = rows.filter((r) => r.verdict !== "ok");

    return Response.json({
      checked,
      days,
      methods: asked,
      summary,
      problems,
      atRisk: problems
        .filter((r) => r.verdict === "ghost_paid")
        .reduce((sum, r) => sum + r.website_total, 0),
      uncollected: problems
        .filter((r) => r.verdict === "missed_payment")
        .reduce((sum, r) => sum + r.website_total, 0),
    });
  } catch (err) {
    console.error("[PaymentAudit] Failed:", (err as Error).message);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
