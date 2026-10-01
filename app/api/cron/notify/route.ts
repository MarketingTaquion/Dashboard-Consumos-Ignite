import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { MOCK_CLIENTS } from "@/lib/mockData";
import { fetchWindsorSpend, hasWindsorCredentials, resolveDateRange } from "@/lib/windsor";
import { fetchGoogleAdsAds } from "@/lib/windsorAds";
import { fetchMetaAds } from "@/lib/windsorAdsMeta";
import { fetchTiktokAds } from "@/lib/windsorAdsTiktok";
import { buildDigest, PLATFORM_LABEL, type AdsByPlatform } from "@/lib/notifications";
import { readEmailConfig, sendEmail } from "@/lib/email";
import { readChatConfig, sendChatMessage } from "@/lib/chat";
import type { PlatformKey } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Resumen diario al equipo (gasto vs presupuesto + performance de anuncios).
 * Lo dispara el cron de vercel.json: lunes y viernes a las 8:00 hs de Argentina
 * (11:00 UTC, `0 11 * * 1,5`). Se envía a TODOS los
 * canales que estén configurados:
 *
 * - Google Chat: GOOGLE_CHAT_WEBHOOK_URL (ver lib/chat.ts)
 * - Email (Resend): RESEND_API_KEY + NOTIFY_FROM + NOTIFY_TO (ver lib/email.ts)
 *
 * GET /api/cron/notify            → arma y envía el resumen.
 * GET /api/cron/notify?dryRun=1   → arma el resumen y lo devuelve, sin enviar.
 *
 * Seguridad: el sitio es público, así que esta ruta NO responde sin
 * `Authorization: Bearer <CRON_SECRET>` (Vercel lo agrega solo al invocar el
 * cron cuando la variable CRON_SECRET existe en el proyecto). Si CRON_SECRET
 * no está configurada, la ruta queda cerrada: nunca se abre por omisión.
 */

function isAuthorized(request: Request): boolean | "unconfigured" {
  const secret = process.env.CRON_SECRET;
  if (!secret) return "unconfigured";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const ADS_WINDOW = "7d" as const;
// El resumen solo mira anuncios CON actividad: se omite la capa de descubrimiento
// (>= 12 meses de historia, la consulta más lenta de Meta/TikTok), que en
// la primera prueba en producción venció por timeout de 20 s.
const ADS_OPTS = { skipDiscovery: true };

export async function GET(request: Request) {
  const auth = isAuthorized(request);
  if (auth === "unconfigured") {
    return NextResponse.json({ error: "CRON_SECRET no está configurada en este entorno: la ruta queda cerrada." }, { status: 503 });
  }
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  if (!hasWindsorCredentials()) {
    return NextResponse.json({ error: "Falta WINDSOR_API_KEY: no hay datos reales para resumir." }, { status: 503 });
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";

  // Canales: se validan antes de gastar consultas a Windsor.
  const chat = readChatConfig();
  const email = readEmailConfig();
  if ("invalid" in chat) {
    return NextResponse.json({ error: chat.invalid }, { status: 503 });
  }
  const hasChat = "url" in chat;
  const hasEmail = "config" in email;
  if (!dryRun && !hasChat && !hasEmail) {
    return NextResponse.json(
      { error: "No hay ningún canal de envío configurado. Cargá GOOGLE_CHAT_WEBHOOK_URL (Google Chat) o RESEND_API_KEY + NOTIFY_FROM + NOTIFY_TO (email)." },
      { status: 503 }
    );
  }

  const range = resolveDateRange("month");
  const platforms: PlatformKey[] = ["google", "meta", "tiktok"];
  const [spendRes, ...adsRes] = await Promise.allSettled([
    fetchWindsorSpend(MOCK_CLIENTS, range),
    fetchGoogleAdsAds(ADS_WINDOW, ADS_OPTS),
    fetchMetaAds(ADS_WINDOW, ADS_OPTS),
    fetchTiktokAds(ADS_WINDOW, ADS_OPTS),
  ]);

  const unavailable: string[] = [];
  let clients = null as Awaited<ReturnType<typeof fetchWindsorSpend>>["clients"] | null;
  if (spendRes.status === "fulfilled") clients = spendRes.value.clients;
  else unavailable.push(`Seguimiento del gasto: ${(spendRes.reason as any)?.message || spendRes.reason}`);

  const ads: AdsByPlatform[] = [];
  adsRes.forEach((res, i) => {
    const platform = platforms[i];
    if (res.status === "rejected") {
      unavailable.push(`Anuncios de ${PLATFORM_LABEL[platform]}: ${(res.reason as any)?.message || res.reason}`);
    } else if (res.value.failed) {
      unavailable.push(`Anuncios de ${PLATFORM_LABEL[platform]}: ${res.value.warnings.join(" | ")}`);
    } else {
      ads.push({ platform, ads: res.value.ads });
    }
  });

  // Sin NADA que reportar (Windsor caído del todo): no se manda un resumen
  // vacío que parezca "todo bien"; se responde error para que quede en los logs.
  if (!clients && ads.length === 0) {
    return NextResponse.json({ error: "No se pudo obtener ningún dato de Windsor.ai.", detail: unavailable }, { status: 502 });
  }

  const digest = buildDigest({
    today: range.today,
    daysInPeriod: range.daysInPeriod,
    clients,
    ads,
    adsWindowLabel: "últimos 7 días",
    unavailable,
    dateLabel: new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" }),
  });

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      channels: { googleChat: hasChat, email: hasEmail },
      subject: digest.subject,
      summary: digest.summary,
      unavailable,
      chat: digest.chat,
      text: digest.text,
      html: digest.html,
    });
  }

  // Un canal que falla no impide el otro: se reporta cada resultado, y solo
  // es error (502) si NINGUNO pudo enviar.
  const results: Record<string, { ok: boolean; error?: string }> = {};
  if (hasChat) results.googleChat = await sendChatMessage(chat.url, digest.chat);
  if (hasEmail) results.email = await sendEmail(email.config, { subject: digest.subject, html: digest.html, text: digest.text });

  const sent = Object.values(results).some((r) => r.ok);
  return NextResponse.json({ ok: sent, results, summary: digest.summary, unavailable }, { status: sent ? 200 : 502 });
}
