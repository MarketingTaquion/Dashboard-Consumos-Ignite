import type { AdRow } from "./types";
import { resolveDateRange, discoveryWindowFor, type DateRangeKey } from "./windsor";

/**
 * Datos a nivel ANUNCIO para Meta Ads (Medios) — mismo patrón que
 * lib/windsorAds.ts (Google Ads): capa núcleo + descubrimiento (ventana
 * derivada del período elegido, ver discoveryWindowFor en lib/windsor.ts),
 * agrupado por account/campaign/ad.
 *
 * Timeout explícito de LAYER_TIMEOUT_MS por layer — verificado en vivo
 * 2026-09-21: esta consulta se quedó colgada indefinidamente en el preview
 * (probable causa: a nivel anuncio hay muchas más filas por cuenta que a
 * nivel campaña, una por creatividad).
 *
 * `ad_id`/`ad_name` verificados contra windsor.ai/data-field/facebook/
 * (2026-09-17) antes de escribir este archivo. Mismo cuidado que ya costó
 * un bug real a nivel campaña (lib/windsorMeta.ts): acá también el nombre
 * de CAMPAÑA es el campo `campaign`, no `campaign_name` — confirmado en esa
 * misma pasada. `ad_name` sí se llama así (no hay variante rara para ads).
 *
 * Sin cuota de subasta/calidad ni rankings acá tampoco — esas métricas
 * (quality_ranking, engagement_rate_ranking, conversion_rate_ranking, %
 * video visto) SÍ son de nivel anuncio en el modelo de Meta (a diferencia de
 * Google), así que en teoría podrían sumarse acá en una futura iteración —
 * quedan afuera de esta primera versión para no repetir el mismo patrón de
 * "campo nuevo, otra capa, otro riesgo de incompatibilidad" sin haber
 * verificado antes que el núcleo (spend/impresiones/clicks por anuncio)
 * funciona solo.
 *
 * SOLO SERVER-SIDE.
 */

const WINDSOR_BASE_URL = "https://connectors.windsor.ai";
const CONNECTOR = "facebook";

const JOIN_FIELDS = "account_id,account_name,campaign_id,campaign,ad_id,ad_name,date";
const DISCOVERY_FIELDS = "account_id,account_name,campaign_id,campaign,ad_id,ad_name";
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
      // "campaign" es el nombre real del campo en el connector "facebook" — ver nota arriba.
      campaignName: String(row.campaign ?? campaignId),
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

// Timeout explícito — verificado en vivo 2026-09-21: la consulta de
// anuncios de Meta se quedó colgada indefinidamente en el preview (nunca
// resolvió ni tiró error). Sin logs de runtime disponibles para confirmar
// la causa exacta, pero la sospecha más fuerte es la capa de descubrimiento
// (a nivel anuncio hay órdenes de magnitud más filas por cuenta que a nivel
// campaña, que sí viene funcionando bien — una por creatividad). 8s deja
// margen de sobra dentro del límite de duración de una función de Vercel y
// evita que un layer lento cuelgue toda la request en vez de avisar y
// seguir con lo que haya.
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

export async function fetchMetaAds(rangeKey: DateRangeKey = "month"): Promise<{ ads: AdRow[]; warnings: string[] }> {
  const warnings: string[] = [];
  if (!process.env.WINDSOR_API_KEY) return { ads: [], warnings };

  const range = resolveDateRange(rangeKey);
  const byAd = new Map<string, Accum>();

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
    warnings.push(`Windsor.ai (Meta Ads, anuncios): falló la consulta principal. Detalle: ${err?.message || err}`);
    return { ads: [], warnings };
  }

  // Descubrimiento — ventana derivada del período elegido (ver
  // discoveryWindowFor en lib/windsor.ts). Corrección 2026-09-22: esto
  // reemplaza una ventana fija de 90 días que había quedado acá como
  // mitigación de un cuelgue en vivo — el período elegido es el que debe
  // delimitar toda ventana temporal, no una constante aparte; el timeout
  // explícito de LAYER_TIMEOUT_MS ya cubre el caso de una consulta lenta.
  try {
    const discovery = discoveryWindowFor(range);
    const rows = await fetchLayer(DISCOVERY_FIELDS, discovery.dateFrom, discovery.dateTo);
    for (const row of rows) {
      const acc = getOrCreate(byAd, row);
      if (acc) acc.hasCore = true;
    }
  } catch (err: any) {
    warnings.push(
      `Windsor.ai (Meta Ads, anuncios): no se pudo consultar el histórico ampliado para descubrir anuncios sin actividad. Detalle: ${err?.message || err}`
    );
  }

  if (byAd.size === 0) {
    warnings.push(`Windsor.ai (Meta Ads, anuncios): no se encontró ningún anuncio conectado, ni con actividad ni sin ella, en la ventana de descubrimiento del período elegido.`);
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
      clicks: acc.clicks,
      cpm: acc.impressions > 0 ? (acc.spend / acc.impressions) * 1000 : 0,
      ctr: acc.impressions > 0 ? (acc.clicks / acc.impressions) * 100 : 0,
      cpl: acc.conversions > 0 ? acc.spend / acc.conversions : 0,
      conversions: acc.conversions,
    }));

  return { ads, warnings };
}
