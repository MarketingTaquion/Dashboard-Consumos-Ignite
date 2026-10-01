import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { MOCK_CLIENTS } from "@/lib/mockData";
import { fetchWindsorSpend, hasWindsorCredentials, resolveDateRange } from "@/lib/windsor";
import { fetchGoogleAdsAds } from "@/lib/windsorAds";
import { fetchMetaAds } from "@/lib/windsorAdsMeta";
import { fetchTiktokAds } from "@/lib/windsorAdsTiktok";
import { buildDigest, PLATFORM_LABEL, type AdsByPlatform } from "@/lib/notifications";
import { readEmailConfig, sendEmail } from "@/lib/email";
import type { PlatformKey } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Resumen diario por email al equipo (gasto vs presupuesto + performance de
 * anuncios). Lo dispara el cron de vercel.json, una vez por día.
 *
 * GET /api/cron/notify            → arma y envía el mail.
 * GET /api/cron/notify?dryRun=1   → arma el mail y lo devuelve, sin enviarlo.
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

  // Config de email: se valida antes de gastar consultas a Windsor.
  const email = readEmailConfig();
  if (!dryRun && "missing" in email) {
    return NextResponse.json({ error: `Falta configurar el envío de email: ${email.missing.join(", ")}.` }, { status: 503 });
  }

  const range = resolveDateRange("month");
  const platforms: PlatformKey[] = ["google", "meta", "tiktok"];
  const [spendRes, ...adsRes] = await Promise.allSettled([
    fetchWindsorSpend(MOCK_CLIENTS, range),
    fetchGoogleAdsAds(ADS_WINDOW),
    fetchMetaAds(ADS_WINDOW),
    fetchTiktokAds(ADS_WINDOW),
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

  // Sin NADA que reportar (Windsor caído del todo): no se manda un mail vacío
  // que parezca "todo bien"; se responde error para que quede en los logs.
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
    dateLabel: new Date().toLocaleDateString("es-AR", { day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" }),
  });

  if (dryRun) {
    return NextResponse.json({ dryRun: true, subject: digest.subject, summary: digest.summary, unavailable, text: digest.text, html: digest.html });
  }

  if ("missing" in email) return NextResponse.json({ error: "Config de email incompleta." }, { status: 503 });
  const sent = await sendEmail(email.config, { subject: digest.subject, html: digest.html, text: digest.text });
  if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: 502 });
  return NextResponse.json({ ok: true, to: email.config.to.length, subject: digest.subject, summary: digest.summary, unavailable });
}
