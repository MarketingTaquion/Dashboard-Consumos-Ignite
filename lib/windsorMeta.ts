import type { CampaignRow } from "./types";
import { resolveDateRange, discoveryWindowFor, type DateRangeKey } from "./windsor";

/**
 * Datos a nivel CAMPAÑA para Meta Ads (Medios) — mismo patrón que
 * lib/windsorCampaigns.ts (Google Ads). Métricas: comunes (spend,
 * conversiones, impresiones, clicks, CPM, CTR, CPL) + reach/frequency,
 * propias de campañas de alcance/awareness.
 *
 * ⚠️ VERIFICADO 2026-09-18 contra windsor.ai/data-field/facebook/ antes de
 * escribir este archivo: a diferencia de Google Ads y TikTok Ads, el
 * connector "facebook" de Windsor NO tiene un campo `campaign_name` — el
 * nombre de campaña se llama simplemente `campaign` acá. Si se copia el
 * nombre `campaign_name` de los otros dos conectores sin revisar, la
 * columna "Campaña" queda vacía en silencio.
 *
 * quality_ranking / engagement_rate_ranking / conversion_rate_ranking y el
 * % de video visto (video_p100_watched_actions_video_view) también existen
 * y están confirmados, pero quedan afuera de este fetcher a propósito: son
 * métricas de ANUNCIO individual en el modelo de datos de Meta (varios ads
 * conviven bajo un mismo campaign_id, cada uno con su propio ranking) — ver
 * la nota en lib/types.ts. Van a sumarse cuando se construya el nivel
 * Anuncios de Meta.
 *
 * SOLO SERVER-SIDE.
 */

const WINDSOR_BASE_URL = "https://connectors.windsor.ai";
const CONNECTOR = "facebook";

const JOIN_FIELDS = "account_id,account_name,campaign_id,campaign,date";
const DISCOVERY_FIELDS = "account_id,account_name,campaign_id,campaign";
const CORE_FIELDS = `${JOIN_FIELDS},spend,conversions,impressions,clicks,reach,frequency`;

interface Accum {
  accountId: string;
  accountName: string;
  campaignId: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  reach: number;
  frequencySum: number;
  frequencyCount: number;
  hasCore: boolean;
}

function getOrCreate(byCampaign: Map<string, Accum>, row: any): Accum | null {
  const campaignId = String(row.campaign_id ?? "");
  const accountId = String(row.account_id ?? "");
  if (!campaignId || !accountId) return null;
  const key = `${accountId}:${campaignId}`;
  let acc = byCampaign.get(key);
  if (!acc) {
    acc = {
      accountId,
      accountName: String(row.account_name ?? accountId),
      campaignId,
      // "campaign" es el nombre real del campo en el connector "facebook" — ver nota arriba.
      campaignName: String(row.campaign ?? campaignId),
      impressions: 0,
      clicks: 0,
      spend: 0,
      conversions: 0,
      reach: 0,
      frequencySum: 0,
      frequencyCount: 0,
      hasCore: false,
    };
    byCampaign.set(key, acc);
  }
  return acc;
}

async function fetchLayer(fields: string, dateFrom: string, dateTo: string): Promise<any[]> {
  const params = new URLSearchParams({ api_key: process.env.WINDSOR_API_KEY!, fields, date_from: dateFrom, date_to: dateTo });
  const res = await fetch(`${WINDSOR_BASE_URL}/${CONNECTOR}?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} — ${t.slice(0, 300)}`);
  }
  const json = await res.json();
  const rows = Array.isArray(json) ? json : json?.data;
  if (!Array.isArray(rows)) throw new Error("Respuesta inesperada de Windsor.ai (ni array ni { data: [...] })");
  return rows;
}

export async function fetchMetaCampaigns(rangeKey: DateRangeKey = "month"): Promise<{ campaigns: CampaignRow[]; warnings: string[] }> {
  const warnings: string[] = [];
  if (!process.env.WINDSOR_API_KEY) return { campaigns: [], warnings };

  const range = resolveDateRange(rangeKey);
  const byCampaign = new Map<string, Accum>();

  try {
    const rows = await fetchLayer(CORE_FIELDS, range.dateFrom, range.dateTo);
    for (const row of rows) {
      const acc = getOrCreate(byCampaign, row);
      if (!acc) continue;
      acc.hasCore = true;
      acc.impressions += Number(row.impressions ?? 0);
      acc.clicks += Number(row.clicks ?? 0);
      acc.spend += Number(row.spend ?? 0);
      acc.conversions += Number(row.conversions ?? 0);
      acc.reach += Number(row.reach ?? 0);
      if (row.frequency !== undefined && row.frequency !== null && row.frequency !== "") {
        const f = Number(row.frequency);
        if (!Number.isNaN(f)) {
          acc.frequencySum += f;
          acc.frequencyCount += 1;
        }
      }
    }
  } catch (err: any) {
    warnings.push(`Windsor.ai (Meta Ads, campañas): falló la consulta principal. Detalle: ${err?.message || err}`);
    return { campaigns: [], warnings };
  }

  // Descubrimiento — ventana derivada del período elegido (ver
  // discoveryWindowFor en lib/windsor.ts), solo identificadores. Mismo
  // problema ya resuelto en Google Ads: una campaña pausada/sin actividad
  // en el período elegido no vendría en la capa 1, y desaparecería en vez
  // de mostrar $0 real.
  try {
    const discovery = discoveryWindowFor(range);
    const rows = await fetchLayer(DISCOVERY_FIELDS, discovery.dateFrom, discovery.dateTo);
    for (const row of rows) {
      const acc = getOrCreate(byCampaign, row);
      if (acc) acc.hasCore = true;
    }
  } catch (err: any) {
    warnings.push(
      `Windsor.ai (Meta Ads, campañas): no se pudo consultar el histórico ampliado para descubrir campañas sin actividad. Detalle: ${err?.message || err}`
    );
  }

  if (byCampaign.size === 0) {
    warnings.push(`Windsor.ai (Meta Ads, campañas): no se encontró ninguna campaña conectada, ni con actividad ni sin ella, en la ventana de descubrimiento del período elegido.`);
    return { campaigns: [], warnings };
  }

  const campaigns: CampaignRow[] = [...byCampaign.values()]
    .filter((acc) => acc.hasCore)
    .map((acc) => ({
      accountId: acc.accountId,
      accountName: acc.accountName,
      campaignId: acc.campaignId,
      campaignName: acc.campaignName,
      impressions: acc.impressions,
      clicks: acc.clicks,
      cpm: acc.impressions > 0 ? (acc.spend / acc.impressions) * 1000 : 0,
      ctr: acc.impressions > 0 ? (acc.clicks / acc.impressions) * 100 : 0,
      cpl: acc.conversions > 0 ? acc.spend / acc.conversions : 0,
      conversions: acc.conversions,
      reach: acc.reach,
      frequency: acc.frequencyCount > 0 ? acc.frequencySum / acc.frequencyCount : undefined,
    }));

  return { campaigns, warnings };
}
