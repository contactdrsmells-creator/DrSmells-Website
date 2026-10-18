import { createHash, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { reconcile, type Finding } from "@/lib/reconcile";
import { notifyBoss } from "@/lib/notify-boss";

/**
 * The morning check that the shop's two databases still agree.
 *
 * Built in place of scheduling the payment check, which in two days of running
 * raised a hundred and six alarms and not one of them real — every gateway it
 * asked was telling the truth. This asks no gateway at all. It compares what
 * the shop already knows against what the CRM already knows, which is where
 * every genuine problem of that week actually turned up: a package re-pointed
 * from one to another, Singapore addresses labelled Malaysia, orders filed
 * under a gateway that never took the money.
 *
 * Silent when they agree. A check that reports "all fine" every morning
 * teaches its reader to skip it, and then the one that matters is skipped too.
 */

export const maxDuration = 120;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  // Vercel Cron signs with "Authorization: Bearer <CRON_SECRET>" and nothing
  // else; the other two are for an external caller and for a run by hand.
  const url = new URL(request.url);
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const provided = bearer || request.headers.get("x-cron-secret") || url.searchParams.get("secret") || "";

  const a = createHash("sha256").update(secret).digest();
  const b = createHash("sha256").update(provided).digest();
  return timingSafeEqual(a, b);
}

/** Grouped by kind, because five of one thing is one problem, not five. */
function compose(findings: Finding[], checked: number, days: number): string {
  const byKind = new Map<string, Finding[]>();
  for (const f of findings) byKind.set(f.kind, [...(byKind.get(f.kind) || []), f]);

  const lines: string[] = [
    `${findings.length} thing${findings.length === 1 ? "" : "s"} to look at, from ${checked} orders in the last ${days} days.`,
    "",
  ];

  for (const [kind, group] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
    const money = group.reduce((sum, f) => sum + (f.amount || 0), 0);
    lines.push(`${kind} — ${group.length}${money > 0.011 ? `, RM${money.toFixed(2)}` : ""}`);
    // Enough to act on without becoming a wall of text.
    for (const f of group.slice(0, 8)) lines.push(`  ${f.order}: ${f.detail}`);
    if (group.length > 8) lines.push(`  …and ${group.length - 8} more`);
    lines.push("");
  }

  lines.push("Nothing has been changed. Admin → Payment Check can confirm a single order.");
  return lines.join("\n");
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = Math.min(Math.max(Number(new URL(request.url).searchParams.get("days")) || 7, 1), 90);

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  try {
    const { findings, checked, crmReachable } = await reconcile(db, days);

    // A CRM that could not be reached is worth saying once, because half the
    // checks were skipped and a quiet morning would otherwise look like a
    // clean one.
    if (!crmReachable) {
      await notifyBoss(
        "Dr.Smells — could not check the CRM",
        "This morning's check could not reach the CRM, so the comparison between the two systems was skipped. " +
          "The website's own checks ran and found " +
          (findings.length ? `${findings.length} thing(s) to look at.` : "nothing wrong."),
      );
      return Response.json({ checked, crmReachable, findings: findings.length, notified: true });
    }

    if (!findings.length) {
      return Response.json({ checked, findings: 0, notified: false, note: "silent — nothing to report" });
    }

    const delivered = await notifyBoss(
      `Dr.Smells — ${findings.length} order${findings.length === 1 ? "" : "s"} need a look`,
      compose(findings, checked, days),
    );

    return Response.json({ checked, findings: findings.length, notified: delivered !== null, via: delivered });
  } catch (err) {
    console.error("[Reconcile] Failed:", (err as Error).message);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
