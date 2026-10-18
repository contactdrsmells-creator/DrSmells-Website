import nodemailer from "nodemailer";

/**
 * Getting one short message to whoever runs the shop.
 *
 * Telegram first, because that is where the daily report already goes and
 * therefore where it will actually be read; email second, because SMTP is
 * already configured and works today without anyone adding anything.
 *
 * Sent only when there is something to say. A check that reports "all fine"
 * every morning teaches its reader to skip it, and then the one that matters
 * is skipped too.
 */

async function viaTelegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error("[Notify] Telegram refused:", res.status, (await res.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Notify] Telegram unreachable:", (err as Error).message);
    return false;
  }
}

async function viaEmail(subject: string, text: string): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = process.env.ALERT_EMAIL || process.env.MAIL_BCC || user;
  if (!host || !user || !pass || !to) return false;

  try {
    const transport = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT || "465", 10),
      secure: parseInt(process.env.SMTP_PORT || "465", 10) === 465,
      auth: { user, pass },
    });
    await transport.sendMail({
      from: process.env.MAIL_FROM || user,
      to,
      subject,
      text,
    });
    return true;
  } catch (err) {
    console.error("[Notify] Email failed:", (err as Error).message);
    return false;
  }
}

/** Returns how it was delivered, or null when nowhere could be reached. */
export async function notifyBoss(subject: string, text: string): Promise<string | null> {
  if (await viaTelegram(`${subject}\n\n${text}`)) return "telegram";
  if (await viaEmail(subject, text)) return "email";
  console.error("[Notify] No channel configured — nothing was sent");
  return null;
}
