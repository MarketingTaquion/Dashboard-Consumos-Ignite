import type { AdRow, ClientData, PlatformKey } from "./types";

/**
 * Resumen diario por email para el equipo: seguimiento del gasto contra
 * presupuesto + performance de anuncios. Este archivo SOLO arma el contenido
 * (funciones puras, sin red) — el envío está en lib/email.ts y el disparo en
 * app/api/cron/notify/route.ts.
 *
 * Los umbrales de THRESHOLDS son una propuesta inicial (nadie del equipo
 * definió todavía cuáles son los correctos): se ajustan acá, en un solo lugar.
 *
 * SOLO SERVER-SIDE.
 */

export const THRESHOLDS = {
  /** Ritmo = % ejecutado / % del período transcurrido. Arriba de esto: va a gastar de más. */
  overPaceRatio: 1.15,
  /** Debajo de esto: va a quedar presupuesto sin ejecutar. */
  underPaceRatio: 0.7,
  /** Antes de este día del período el ritmo es ruido (poco gasto acumulado) y no se alerta. */
  minDayForPace: 5,
  /** Un anuncio con al menos estas impresiones y 0 clicks en la ventana se marca. */
  adMinImpressionsNoClicks: 1000,
  /** Cuántos anuncios mostrar en cada lista. */
  listSize: 10,
  topFollowersSize: 5,
} as const;

export const PLATFORM_LABEL: Record<PlatformKey, string> = {
  google: "Google Ads",
  meta: "Meta Ads",
  tiktok: "TikTok Ads",
  linkedin: "LinkedIn Ads",
};

export type PacingStatus = "exceeded" | "over" | "under" | "ok" | "early";

export interface PacingRow {
  name: string;
  platforms: string;
  budget: number;
  spend: number;
  pctExecuted: number; // 0-100+
  pctElapsed: number; // 0-100
  ratio: number; // pctExecuted / pctElapsed
  status: PacingStatus;
}

export interface AdsByPlatform {
  platform: PlatformKey;
  ads: AdRow[];
}

export interface DigestInput {
  today: number;
  daysInPeriod: number;
  /** null = no se pudo obtener el gasto (sección no disponible). */
  clients: ClientData[] | null;
  /** Una entrada por plataforma que se pudo consultar. */
  ads: AdsByPlatform[];
  adsWindowLabel: string;
  /** Secciones que no se pudieron armar, con motivo — se muestran en el mail, no se ocultan. */
  unavailable: string[];
  dateLabel: string;
}

export interface Digest {
  subject: string;
  html: string;
  text: string;
  /** Mismo contenido para un Espacio de Google Chat (formato de texto de Chat: *negrita*, `monoespaciado`, viñetas). */
  chat: string;
  summary: { pacingAlerts: number; noClicksAds: number; accountsTracked: number; accountsWithoutBudget: number };
}

export function pacingRows(clients: ClientData[], today: number, daysInPeriod: number): { rows: PacingRow[]; withoutBudget: number } {
  const pctElapsed = daysInPeriod > 0 ? (today / daysInPeriod) * 100 : 0;
  const rows: PacingRow[] = [];
  let withoutBudget = 0;
  for (const c of clients) {
    if (!(c.budget > 0)) {
      withoutBudget++;
      continue;
    }
    const pctExecuted = (c.spend8 / c.budget) * 100;
    const ratio = pctElapsed > 0 ? pctExecuted / pctElapsed : 0;
    let status: PacingStatus;
    if (pctExecuted >= 100) status = "exceeded";
    else if (today < THRESHOLDS.minDayForPace) status = "early";
    else if (ratio > THRESHOLDS.overPaceRatio) status = "over";
    else if (ratio < THRESHOLDS.underPaceRatio) status = "under";
    else status = "ok";
    rows.push({
      name: c.name,
      platforms: Object.keys(c.mix)
        .map((k) => PLATFORM_LABEL[k as PlatformKey] ?? k)
        .join(" + "),
      budget: c.budget,
      spend: c.spend8,
      pctExecuted,
      pctElapsed,
      ratio,
      status,
    });
  }
  // Primero lo que requiere atención.
  const order: Record<PacingStatus, number> = { exceeded: 0, over: 1, under: 2, early: 3, ok: 4 };
  rows.sort((a, b) => order[a.status] - order[b.status] || b.ratio - a.ratio);
  return { rows, withoutBudget };
}

export interface FlaggedAd {
  platform: PlatformKey;
  ad: AdRow;
}

export function adAlerts(groups: AdsByPlatform[]): { noClicks: FlaggedAd[]; topFollowers: FlaggedAd[] } {
  const all: FlaggedAd[] = groups.flatMap((g) => g.ads.map((ad) => ({ platform: g.platform, ad })));
  const noClicks = all
    .filter(({ ad }) => ad.impressions >= THRESHOLDS.adMinImpressionsNoClicks && ad.clicks === 0)
    .sort((a, b) => b.ad.spend - a.ad.spend);
  const topFollowers = all
    .filter(({ ad }) => (ad.followers ?? 0) > 0)
    .sort((a, b) => (b.ad.followers ?? 0) - (a.ad.followers ?? 0));
  return { noClicks, topFollowers };
}

// ---------------------------------------------------------------- formato

const moneyFmt = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const intFmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const money = (n: number) => moneyFmt.format(n);
const int = (n: number) => intFmt.format(n);
const pct = (n: number) => `${n.toFixed(0)}%`;

/** Los nombres de cuentas/anuncios vienen de plataformas externas: se escapan antes de ir al HTML. */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const STATUS_LABEL: Record<PacingStatus, string> = {
  exceeded: "Presupuesto superado",
  over: "Ritmo alto",
  under: "Ritmo bajo",
  ok: "En ritmo",
  early: "Inicio de período",
};
const STATUS_COLOR: Record<PacingStatus, string> = {
  exceeded: "#b42318",
  over: "#b54708",
  under: "#b54708",
  ok: "#067647",
  early: "#475467",
};

const TH = 'style="text-align:left;padding:6px 8px;border-bottom:1px solid #d0d5dd;font-size:12px;color:#475467"';
const TD = 'style="padding:6px 8px;border-bottom:1px solid #eaecf0;font-size:13px"';
const TDR = 'style="padding:6px 8px;border-bottom:1px solid #eaecf0;font-size:13px;text-align:right"';

export function buildDigest(input: DigestInput): Digest {
  const { today, daysInPeriod, clients, ads, adsWindowLabel, unavailable, dateLabel } = input;

  const pacing = clients ? pacingRows(clients, today, daysInPeriod) : null;
  const alerts = ads.length ? adAlerts(ads) : null;

  const pacingAttention = pacing ? pacing.rows.filter((r) => r.status === "exceeded" || r.status === "over" || r.status === "under") : [];
  const noClicksShown = alerts ? alerts.noClicks.slice(0, THRESHOLDS.listSize) : [];

  const subject =
    pacingAttention.length + (alerts?.noClicks.length ?? 0) > 0
      ? `Pulso Ignite — ${pacingAttention.length} cuenta(s) y ${alerts?.noClicks.length ?? 0} anuncio(s) para revisar (${dateLabel})`
      : `Pulso Ignite — resumen de gasto y performance (${dateLabel})`;

  // ---------------- HTML
  const h: string[] = [];
  h.push(`<div style="font-family:Arial,Helvetica,sans-serif;color:#101828;max-width:760px">`);
  h.push(`<h2 style="margin:0 0 4px">Pulso Ignite — resumen</h2>`);
  h.push(`<p style="margin:0 0 16px;color:#475467;font-size:13px">${esc(dateLabel)} · día ${today} de ${daysInPeriod} del mes</p>`);

  if (unavailable.length) {
    h.push(`<div style="background:#fffaeb;border:1px solid #fedf89;padding:10px 12px;border-radius:6px;margin-bottom:16px;font-size:13px">`);
    h.push(`<strong>Hay datos que no se pudieron obtener:</strong><ul style="margin:6px 0 0 18px;padding:0">${unavailable.map((u) => `<li>${esc(u)}</li>`).join("")}</ul></div>`);
  }

  h.push(`<h3 style="margin:16px 0 6px">Seguimiento del gasto (mes en curso)</h3>`);
  if (!pacing) {
    h.push(`<p style="font-size:13px">Sección no disponible en este envío.</p>`);
  } else if (pacing.rows.length === 0) {
    h.push(`<p style="font-size:13px">Ninguna cuenta tiene presupuesto cargado en la hoja de proyectados, no se puede medir el avance.</p>`);
  } else {
    h.push(`<table style="border-collapse:collapse;width:100%"><tr><th ${TH}>Cuenta</th><th ${TH}>Plataforma</th><th ${TH}>Presupuesto</th><th ${TH}>Ejecutado</th><th ${TH}>% ejec.</th><th ${TH}>% del mes</th><th ${TH}>Estado</th></tr>`);
    for (const r of pacing.rows) {
      h.push(
        `<tr><td ${TD}>${esc(r.name)}</td><td ${TD}>${esc(r.platforms)}</td><td ${TDR}>${money(r.budget)}</td><td ${TDR}>${money(r.spend)}</td><td ${TDR}>${pct(r.pctExecuted)}</td><td ${TDR}>${pct(r.pctElapsed)}</td><td ${TD}><strong style="color:${STATUS_COLOR[r.status]}">${STATUS_LABEL[r.status]}</strong></td></tr>`
      );
    }
    h.push(`</table>`);
    if (pacing.withoutBudget > 0) {
      h.push(`<p style="font-size:12px;color:#475467">${pacing.withoutBudget} cuenta(s) sin presupuesto cargado no se incluyen.</p>`);
    }
    h.push(
      `<p style="font-size:12px;color:#475467">Ritmo = % ejecutado ÷ % del mes transcurrido. Alto: más de ${Math.round(THRESHOLDS.overPaceRatio * 100)}%. Bajo: menos de ${Math.round(THRESHOLDS.underPaceRatio * 100)}% (se evalúa desde el día ${THRESHOLDS.minDayForPace}).</p>`
    );
  }

  h.push(`<h3 style="margin:20px 0 6px">Performance de anuncios (${esc(adsWindowLabel)})</h3>`);
  if (!alerts) {
    h.push(`<p style="font-size:13px">Sección no disponible en este envío.</p>`);
  } else {
    h.push(`<p style="margin:8px 0 4px;font-size:13px"><strong>Con impresiones y sin clicks</strong> (≥ ${int(THRESHOLDS.adMinImpressionsNoClicks)} impresiones): ${alerts.noClicks.length}</p>`);
    if (noClicksShown.length) {
      h.push(`<table style="border-collapse:collapse;width:100%"><tr><th ${TH}>Anuncio</th><th ${TH}>Campaña</th><th ${TH}>Plataforma</th><th ${TH}>Impresiones</th><th ${TH}>Gasto</th></tr>`);
      for (const { platform, ad } of noClicksShown) {
        h.push(`<tr><td ${TD}>${esc(ad.adName)}</td><td ${TD}>${esc(ad.campaignName)}</td><td ${TD}>${PLATFORM_LABEL[platform]}</td><td ${TDR}>${int(ad.impressions)}</td><td ${TDR}>${money(ad.spend)}</td></tr>`);
      }
      h.push(`</table>`);
      if (alerts.noClicks.length > noClicksShown.length) {
        h.push(`<p style="font-size:12px;color:#475467">…y ${alerts.noClicks.length - noClicksShown.length} más. Ver Pulso → Medios → Anuncios.</p>`);
      }
    }
    h.push(`<p style="margin:14px 0 4px;font-size:13px"><strong>Anuncios que más seguidores ganaron</strong></p>`);
    const top = alerts.topFollowers.slice(0, THRESHOLDS.topFollowersSize);
    if (top.length === 0) {
      h.push(`<p style="font-size:13px">Ningún anuncio registró seguidores ganados en la ventana (o la métrica no está disponible).</p>`);
    } else {
      h.push(`<table style="border-collapse:collapse;width:100%"><tr><th ${TH}>Anuncio</th><th ${TH}>Campaña</th><th ${TH}>Plataforma</th><th ${TH}>Seguidores</th><th ${TH}>Gasto</th></tr>`);
      for (const { platform, ad } of top) {
        h.push(`<tr><td ${TD}>${esc(ad.adName)}</td><td ${TD}>${esc(ad.campaignName)}</td><td ${TD}>${PLATFORM_LABEL[platform]}</td><td ${TDR}>${int(ad.followers ?? 0)}</td><td ${TDR}>${money(ad.spend)}</td></tr>`);
      }
      h.push(`</table>`);
    }
  }
  h.push(`<p style="margin-top:20px;font-size:11px;color:#98a2b3">Enviado automáticamente por Pulso Ignite. Datos de Windsor.ai al momento del envío.</p></div>`);

  // ---------------- texto plano
  const t: string[] = [];
  t.push(`Pulso Ignite — resumen (${dateLabel}, día ${today} de ${daysInPeriod})`, "");
  if (unavailable.length) t.push("DATOS NO DISPONIBLES:", ...unavailable.map((u) => `- ${u}`), "");
  t.push("SEGUIMIENTO DEL GASTO (mes en curso)");
  if (!pacing) t.push("Sección no disponible en este envío.");
  else if (pacing.rows.length === 0) t.push("Ninguna cuenta tiene presupuesto cargado.");
  else {
    for (const r of pacing.rows) t.push(`- ${r.name} (${r.platforms}): ${money(r.spend)} de ${money(r.budget)} (${pct(r.pctExecuted)}; mes al ${pct(r.pctElapsed)}) — ${STATUS_LABEL[r.status]}`);
    if (pacing.withoutBudget > 0) t.push(`(${pacing.withoutBudget} cuenta(s) sin presupuesto cargado no se incluyen)`);
  }
  t.push("", `PERFORMANCE DE ANUNCIOS (${adsWindowLabel})`);
  if (!alerts) t.push("Sección no disponible en este envío.");
  else {
    t.push(`Con impresiones y sin clicks: ${alerts.noClicks.length}`);
    for (const { platform, ad } of noClicksShown) t.push(`- ${ad.adName} [${ad.campaignName}] ${PLATFORM_LABEL[platform]}: ${int(ad.impressions)} imp., ${money(ad.spend)}`);
    t.push("Más seguidores ganados:");
    const top = alerts.topFollowers.slice(0, THRESHOLDS.topFollowersSize);
    if (top.length === 0) t.push("- ninguno en la ventana (o métrica no disponible)");
    for (const { platform, ad } of top) t.push(`- ${ad.adName} [${ad.campaignName}] ${PLATFORM_LABEL[platform]}: ${int(ad.followers ?? 0)} seguidores, ${money(ad.spend)}`);
  }

  // ---------------- Google Chat
  // Nombres de cuentas/campañas/anuncios van en monoespaciado: llevan "_" y
  // "*" que Chat interpretaría como cursiva/negrita.
  const code = (v: string) => "`" + v.replace(/`/g, "'") + "`";
  const ICON: Record<PacingStatus, string> = { exceeded: "🔴", over: "🟠", under: "🟠", ok: "🟢", early: "⚪" };
  const c: string[] = [];
  c.push("*Pulso Ignite — resumen*", `${dateLabel} · día ${today} de ${daysInPeriod} del mes`, "");
  if (unavailable.length) c.push("⚠️ *Datos que no se pudieron obtener:*", ...unavailable.map((u) => `• ${u}`), "");
  c.push("*Seguimiento del gasto (mes en curso)*");
  if (!pacing) c.push("Sección no disponible en este envío.");
  else if (pacing.rows.length === 0) c.push("Ninguna cuenta tiene presupuesto cargado en la hoja de proyectados.");
  else {
    for (const r of pacing.rows) {
      c.push(`${ICON[r.status]} ${code(r.name)} (${r.platforms}) — ${money(r.spend)} de ${money(r.budget)} · ${pct(r.pctExecuted)} ejecutado, mes al ${pct(r.pctElapsed)} · *${STATUS_LABEL[r.status]}*`);
    }
    if (pacing.withoutBudget > 0) c.push(`_${pacing.withoutBudget} cuenta(s) sin presupuesto cargado no se incluyen._`);
  }
  c.push("", `*Performance de anuncios (${adsWindowLabel})*`);
  if (!alerts) c.push("Sección no disponible en este envío.");
  else {
    c.push(`Con impresiones y sin clicks (≥ ${int(THRESHOLDS.adMinImpressionsNoClicks)} imp.): *${alerts.noClicks.length}*`);
    for (const { platform, ad } of noClicksShown) {
      c.push(`• ${code(ad.adName)} · ${code(ad.campaignName)} · ${PLATFORM_LABEL[platform]} — ${int(ad.impressions)} imp. · ${money(ad.spend)}`);
    }
    if (alerts.noClicks.length > noClicksShown.length) c.push(`…y ${alerts.noClicks.length - noClicksShown.length} más (ver Pulso → Medios → Anuncios).`);
    c.push("", "*Anuncios que más seguidores ganaron*");
    const topC = alerts.topFollowers.slice(0, THRESHOLDS.topFollowersSize);
    if (topC.length === 0) c.push("Ninguno registró seguidores ganados en la ventana (o la métrica no está disponible).");
    for (const { platform, ad } of topC) {
      c.push(`• ${code(ad.adName)} · ${code(ad.campaignName)} · ${PLATFORM_LABEL[platform]} — ${int(ad.followers ?? 0)} seguidores · ${money(ad.spend)}`);
    }
  }

  return {
    subject,
    html: h.join(""),
    text: t.join("\n"),
    chat: c.join("\n"),
    summary: {
      pacingAlerts: pacingAttention.length,
      noClicksAds: alerts?.noClicks.length ?? 0,
      accountsTracked: pacing?.rows.length ?? 0,
      accountsWithoutBudget: pacing?.withoutBudget ?? 0,
    },
  };
}
