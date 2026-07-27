import { cookies } from "next/headers";
import nodemailer from "nodemailer";

/**
 * Admin-only SMTP check. Verifies the connection and credentials, then sends a
 * test message, so mail setup can be confirmed without making a real purchase.
 *
 * Usage: /api/admin/email-test?to=you@example.com
 * Reports the SMTP error verbatim on failure — auth vs host vs TLS problems all
 * look identical from the outside otherwise. Never returns the password.
 */
export async function GET(request: Request) {
  const cookieStore = await cookies();
  if (!cookieStore.get("admin_token")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = parseInt(process.env.SMTP_PORT || "465", 10);

  const missing = [
    !host && "SMTP_HOST",
    !user && "SMTP_USER",
    !pass && "SMTP_PASS",
  ].filter(Boolean);

  if (missing.length) {
    return Response.json({ ok: false, error: `Not configured — missing: ${missing.join(", ")}` }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const to = searchParams.get("to") || user!;

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  try {
    await transport.verify();
  } catch (err) {
    return Response.json({
      ok: false,
      stage: "connect/auth",
      host,
      port,
      secure: port === 465,
      from: process.env.MAIL_FROM || user,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }

  try {
    const from = process.env.MAIL_FROM || user!;
    const info = await transport.sendMail({
      from: `Dr.Smells <${from}>`,
      to,
      subject: "Dr.Smells SMTP test",
      html: `<p>SMTP is working. Order confirmation emails will be sent from this address.</p>`,
    });

    return Response.json({ ok: true, stage: "sent", host, port, from, to, messageId: info.messageId });
  } catch (err) {
    return Response.json({
      ok: false,
      stage: "send",
      host,
      port,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
