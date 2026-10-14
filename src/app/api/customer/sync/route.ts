import { getCustomerSession, supabaseAdmin } from "@/lib/customer-auth";
import { awardForOtherChannels, getBalance } from "@/lib/points";

/**
 * Points for what this customer bought on the shop's other channels.
 *
 * An order taken over chat is the same person buying, and lands in the CRM
 * rather than here — so collecting it means waiting on a second system across
 * the network. That used to happen while the account page was loading, which
 * is why a balance we already held took three to five seconds to appear.
 *
 * So it has its own address, called once the page is on screen. Awarding is
 * keyed on the order number and cannot pay twice, so running it on every visit
 * is safe; the page only has to ask for the balance again when the answer says
 * something was actually added.
 */
export async function POST() {
  const session = await getCustomerSession();
  if (!session) return Response.json({ awarded: 0 }, { status: 401 });

  const db = supabaseAdmin();

  // Only from the day the account was opened: a number nobody has proved they
  // own must not arrive carrying a balance.
  const { data: profile } = await db
    .from("customers")
    .select("created_at")
    .eq("id", session.id)
    .maybeSingle();
  if (!profile?.created_at) return Response.json({ awarded: 0, orders: 0 });

  const result = await awardForOtherChannels(db, {
    customerId: session.id,
    phone: session.phone,
    since: profile.created_at,
  });

  return Response.json({
    awarded: result.awarded,
    orders: result.orders,
    balance: await getBalance(db, session.id),
  });
}
