import type { AdRow } from "./types";
import { resolveDateRange, discoveryWindowFor, type DateRangeKey } from "./windsor";

/**
 * Datos a nivel ANUNCIO (no campaña) para la vista Medios — ver Artifact
 * "Pulso Ignite — Perfil Medios", artboard "Anuncios". Mismo patrón que
 * lib/windsorCampaigns.ts, un nivel más profundo: agrega account/campaign +
 * ad_id/ad_name. Arranca solo con Google Ads.
 *
 * `ad_id`/`ad_name` verificados como campos existentes contra la
 * documentación pública de Windsor (windsor.ai/data-field/google_ads/,
 * 2026-09-17) antes de escribir este archivo — mismo cuidado que ya costó
 * un HTTP 400 a nivel campaña. Sin verificar todavía en una respuesta real
 * si conviven en el mismo reporte que spend/conversions/impressions/clicks
 * (si Windsor devuelve "no report in common", hace falta separarlos en una
 * capa aparte, igual que se hizo con search_budget_lost_impression_share).
 *
 * Sin métricas de cuota de subasta/calidad acá: esas son del reporte de
 * campaña de Google Ads, no existen a nivel anuncio individual.
 *
 * SOLO SERVER-SIDE.
 */

const WINDSOR_BASE_URL = "https://connectors.windsor.ai";
const CONNECTOR = "google_ads";

const JOIN_FIELDS = "account_id,account_name,campaign_id,campaign_name,ad_id,ad_name,date";
const DISCOVERY_FIELDS = "account_id,account_name,campaign_id,campaign_name,ad_id,ad_name";
const CORE_FIELDS = `${JOIN_FIELDS},spend,conversions,impressions,clicks`;

interface Accum {
  accountId: string;
  accountName: string;
  campaignId: string;
  campaignName: string;
  adId: string;
  adName: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  hasCore: boolean;
}

function getOrCreate(byAd: Map<string, Accum>, row: any): Accum | null {
  const accountId = String(row.account_id ?? "");
  const campaignId = String(row.campaign_id ?? "");
  const adId = String(row.ad_id ?? "");
  if (!accountId || !campaignId || !adId) return null;
  const key = `${accountId}:${campaignId}:${adId}`;
  let acc = byAd.get(key);
  if (!acc) {
    acc = {
      accountId,
      accountName: String(row.account_name ?? accountId),
      campaignId,
      campaignName: String(row.campaign_name ?? campaignId),
      adId,
      adName: String(row.ad_name ?? adId),
      impressions: 0,
      clicks: 0,
      spend: 0,
      conversions: 0,
      hasCore: false,
    };
    byAd.set(key, acc);
  }
  return acc;
}

// Timeout explícito — ver la nota en lib/windsorAdsMeta.ts: la misma
// consulta de anuncios de Meta se quedó colgada en vivo. Se aplica el mismo
// resguardo acá por las dudas, sin evidencia de que Google tenga el mismo
// problema (ya viene funcionando bien en vivo).
const LAYER_TIMEOUT_MS = 8000;

async function fetchLayer(fields: string, dateFrom: string, dateTo: string): Promise<any[]> {
  const params = new URLSearchParams({ api_key: process.env.WINDSOR_API_KEY!, fields, date_from: dateFrom, date_to: dateTo });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LAYER_TIMEOUT_MS);
  try {
    const res = await fetch(`${WINDSOR_BASE_URL}/${CONNECTOR}?${params.toString()}`, { cache: "no-store", signal: controller.signal });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} — ${t.slice(0, 300)}`);
    }
    const json = await res.json();
    const rows = Array.isArray(json) ? json : json?.data;
    if (!Array.isArray(rows)) throw new Error("Respuesta inesperada de Windsor.ai (ni array ni { data: [...] })");
    return rows;
  } catch (err: any) {
    if (err?.name === "AbortError") throw new Error(`Timeout de ${LAYER_TIMEOUT_MS / 1000}s consultando Windsor.ai`);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchGoogleAdsAds(rangeKey: DateRangeKey = "month"): Promise<{ ads: AdRow[]; warnings: string[] }> {
  const warnings: string[] = [];
  if (!process.env.WINDSOR_API_KEY) return { ads: [], warnings };

  const range = resolveDateRange(rangeKey);
  const byAd = new Map<string, Accum>();

  // Capa 1 — núcleo. Si esta falla, no hay nada que mostrar: se corta acá.
  try {
    const rows = await fetchLayer(CORE_FIELDS, range.dateFrom, range.dateTo);
    for (const row of rows) {
      const acc = getOrCreate(byAd, row);
      if (!acc) continue;
      acc.hasCore = true;
      acc.impressions += Number(row.impressions ?? 0);
      acc.clicks += Number(row.clicks ?? 0);
      acc.spend += Number(row.spend ?? 0);
      acc.conversions += Number(row.conversions ?? 0);
    }
  } catch (err: any) {
    warnings.push(`Windsor.ai (Google Ads, anuncios): falló la consulta principal. Detalle: ${err?.message || err}`);
    return { ads: [], warnings };
  }

  // Descubrimiento — ventana derivada del período elegido (ver
  // discoveryWindowFor en lib/windsor.ts), solo identificadores. Mismo
  // problema ya resuelto a nivel cuenta y campaña: un anuncio pausado/sin
  // actividad en el período elegido no vendría en la capa 1 (Windsor omite
  // la fila en vez de mandarla en $0), y desaparecería en vez de mostrar $0
  // real.
  try {
    const discovery = discoveryWindowFor(range);
    const rows = await fetchLayer(DISCOVERY_FIELDS, discovery.dateFrom, discovery.dateTo);
    for (const row of rows) {
      const acc = getOrCreate(byAd, row);
      if (acc) acc.hasCore = true;
    }
  } catch (err: any) {
    warnings.push(
      `Windsor.ai (Google Ads, anuncios): no se pudo consultar el histórico ampliado para descubrir anuncios sin actividad. Detalle: ${err?.message || err}`
    );
  }

  if (byAd.size === 0) {
    warnings.push(`Windsor.ai (Google Ads, anuncios): no se encontró ningún anuncio conectado, ni con actividad ni sin ella, en la ventana de descubrimiento del período elegido.`);
    return { ads: [], warnings };
  }

  const ads: AdRow[] = [...byAd.values()]
    .filter((acc) => acc.hasCore)
    .map((acc) => ({
      accountId: acc.accountId,
      accountName: acc.accountName,
      campaignId: acc.campaignId,
      campaignName: acc.campaignName,
      adId: acc.adId,
      adName: acc.adName,
      impressions: acc.impressions,
      ctr: acc.impressions > 0 ? (acc.clicks / acc.impressions) * 100 : 0,
      cpl: acc.conversions > 0 ? acc.spend / acc.conversions : 0,
      conversions: acc.conversions,
    }));

  return { ads, warnings };
}
