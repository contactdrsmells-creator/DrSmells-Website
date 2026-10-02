import { cookies } from "next/headers";
import { CUSTOMER_COOKIE, cookieOptions } from "@/lib/customer-auth";

export async function POST() {
  const store = await cookies();
  store.set(CUSTOMER_COOKIE, "", cookieOptions(0));
  return Response.json({ ok: true });
}
