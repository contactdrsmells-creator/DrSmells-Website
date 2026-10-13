import { timingSafeEqual } from "crypto";
import { normalisePhone, supabaseAdmin } from "@/lib/customer-auth";
import { getBalance } from "@/lib/points";

/**
 * Which of these numbers hold a shop account, and what each has collected.
 *
 * The CRM lists the people who buy; the points live here. Whoever is answering
 * a customer in the CRM should be able to see that they are a member and what
 * they are sitting on, without being asked to look it up in a second place.
 *
 * Behind the same shared secret the two systems already use between them.
 * Given a list of numbers it answers about those; asked for all, it lists
 * every account, which is what lets the CRM show a member who has signed up
 * and not yet bought anything — someone its own list, built from orders,
 * cannot know exists.
 */

function secretMatches(provided: string | null, expected: string): boolean {
  const a = Buffer.from(String(provided || ""));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const expected = process.env.CRM_WEBHOOK_SECRET;
  if (!expected) {
    return Response.json({ error: "Server configuration error" }, { status: 500 });
  }
  if (!secretMatches(request.headers.get("x-webhook-secret"), expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  // Every account, for a caller building a list rather than annotating one.
  if (body?.all === true) {
    const db = supabaseAdmin();
    const { data: everyone } = await db
      .from("customers")
      .select("id, phone, name, created_at")
      .order("created_at", { ascending: false })
      .range(0, 999);

    const all = [];
    for (const customer of everyone || []) {
      all.push({
        phone: customer.phone,
        asked_as: customer.phone,
        name: customer.name,
        joined: customer.created_at,
        points: await getBalance(db, customer.id),
      });
    }
    return Response.json({ results: all });
  }

  const asked: string[] = Array.isArray(body?.phones) ? body.phones.slice(0, 500) : [];
  if (!asked.length) return Response.json({ results: [] });

  // Normalised on both sides, since the CRM holds whatever each channel wrote
  // and only a common spelling recognises the same person.
  const wanted = new Map<string, string>();
  for (const raw of asked) {
    const phone = normalisePhone(String(raw || ""));
    if (phone) wanted.set(phone, String(raw));
  }
  if (!wanted.size) return Response.json({ results: [] });

  const db = supabaseAdmin();
  const { data: customers } = await db
    .from("customers")
    .select("id, phone, name, created_at")
    .in("phone", [...wanted.keys()]);

  const results = [];
  for (const customer of customers || []) {
    results.push({
      phone: customer.phone,
      asked_as: wanted.get(customer.phone) ?? customer.phone,
      name: customer.name,
      joined: customer.created_at,
      points: await getBalance(db, customer.id),
    });
  }

  return Response.json({ results });
}
