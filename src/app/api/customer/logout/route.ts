import { cookies } from "next/headers";
import { CUSTOMER_COOKIE, PASSWORD_HINT_COOKIE, cookieOptions } from "@/lib/customer-auth";

export async function POST() {
  const store = await cookies();
  store.set(CUSTOMER_COOKIE, "", cookieOptions(0));
  store.set(PASSWORD_HINT_COOKIE, "", { ...cookieOptions(0), httpOnly: false });
  return Response.json({ ok: true });
}
