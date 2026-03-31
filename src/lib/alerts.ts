/**
 * alerts.ts
 * Unified alert system — Telegram, with extensible support for WhatsApp/email.
 * Never throws — all alerts are fire-and-forget.
 */

const TELEGRAM_API = "https://api.telegram.org";

async function sendTelegram(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch { /* non-fatal */ }
}

export async function alertPostSuccess(opts: {
  title: string;
  url: string;
  ig: boolean;
  fb: boolean;
  x: boolean;
  category: string;
}): Promise<void> {
  const platforms = [
    opts.ig ? "✅ IG" : "❌ IG",
    opts.fb ? "✅ FB" : "❌ FB",
    opts.x  ? "✅ X"  : "⚪ X",
  ].join(" | ");
  const msg = `🎬 <b>Posted!</b>\n${platforms}\n\n<b>${opts.title}</b>\n<i>${opts.category}</i>\n\n🔗 ${opts.url}`;
  await sendTelegram(msg);
}

export async function alertPostFailure(opts: {
  title: string;
  error: string;
  source?: string;
}): Promise<void> {
  const msg = `🚨 <b>Post Failed</b>\n\n<b>${opts.title}</b>\n${opts.source ? `Source: ${opts.source}\n` : ""}Error: <code>${opts.error}</code>`;
  await sendTelegram(msg);
}

export async function alertTokenExpiry(daysLeft: number, platform: string): Promise<void> {
  const emoji = daysLeft <= 2 ? "🔴" : daysLeft <= 7 ? "🟡" : "🟢";
  const msg = `${emoji} <b>Token Expiry Warning</b>\n\n${platform} token expires in <b>${daysLeft} days</b>.\n\nRenew it now to avoid posting failures.`;
  await sendTelegram(msg);
}

export async function alertRateLimit(platform: string, resumeAt: Date): Promise<void> {
  const msg = `⏸ <b>Rate Limited</b>\n\n${platform} rate limit hit.\nPipeline paused until <b>${resumeAt.toLocaleTimeString("en-KE", { timeZone: "Africa/Nairobi" })} EAT</b>`;
  await sendTelegram(msg);
}

export async function alertPipelineHealth(status: "ok" | "degraded" | "down", details?: string): Promise<void> {
  const emoji = status === "ok" ? "✅" : status === "degraded" ? "⚠️" : "🔴";
  const msg = `${emoji} <b>Pipeline ${status.toUpperCase()}</b>${details ? `\n\n${details}` : ""}`;
  await sendTelegram(msg);
}

export async function alertBreakingNews(title: string, source: string, url: string): Promise<void> {
  const msg = `🔴 <b>BREAKING NEWS DETECTED</b>\n\n<b>${title}</b>\nSource: ${source}\n\n🔗 ${url}\n\n<i>Auto-posting now...</i>`;
  await sendTelegram(msg);
}
