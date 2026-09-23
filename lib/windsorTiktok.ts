import type { CampaignRow } from "./types";
import { resolveDateRange, discoveryWindowFor, type DateRangeKey } from "./windsor";

/**
 * Datos a nivel CAMPAÑA para TikTok Ads (Medios) — mismo patrón que
 * lib/windsorCampaigns.ts (Google Ads). Métricas: comunes + reach/frequency
 * (como Meta) + tiempo promedio de reproducción y likes, propias del
 * formato nativo de video de la plataforma.
 *
 * ⚠️ VERIFICADO 2026-09-18 contra windsor.ai/data-field/tiktok/ antes de
 * escribir este archivo. A diferencia de Meta Ads, acá `campaign_name` sí
 * existe con ese nombre exacto (no hace falta el field alternativo que usa
 * Meta). `average_video_play` (tiempo promedio de reproducción, en
 * segundos) y `likes` están confirmados. Windsor NO expone un campo nativo
 * de "% de video visto al 100%" ni "vistas de 6 segundos" para campañas de
 * video estándar (solo existen variantes "ix_video_views_*" para Instant
 * Experience, un formato de anuncio distinto) — por eso esas dos métricas
 * del wireframe original no están en esta tabla; se documenta acá para no
 * repetir la búsqueda si se reconsidera más adelante.
 *
 * SOLO SERVER-SIDE.
 */

const WINDSOR_BASE_URL = "https://connectors.windsor.ai";
const CONNECTOR = "tiktok";

const JOIN_FIELDS = "account_id,account_name,campaign_id,campaign_name,date";
const DISCOVERY_FIELDS = "account_id,account_name,campaign_id,campaign_name";
const CORE_FIELDS = `${JOIN_FIELDS},spend,conversions,impressions,clicks,reach,frequency,average_video_play,likes`;

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
  avgVideoPlaySum: number;
  avgVideoPlayCount: number;
  likes: number;
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
      campaignName: String(row.campaign_name ?? campaignId),
      impressions: 0,
      clicks: 0,
      spend: 0,
      conversions: 0,
      reach: 0,
      frequencySum: 0,
      frequencyCount: 0,
      avgVideoPlaySum: 0,
      avgVideoPlayCount: 0,
      likes: 0,
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

export async function fetchTiktokCampaigns(rangeKey: DateRangeKey = "month"): Promise<{ campaigns: CampaignRow[]; warnings: string[] }> {
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
      acc.likes += Number(row.likes ?? 0);
      if (row.frequency !== undefined && row.frequency !== null && row.frequency !== "") {
        const f = Number(row.frequency);
        if (!Number.isNaN(f)) {
          acc.frequencySum += f;
          acc.frequencyCount += 1;
        }
      }
      if (row.average_video_play !== undefined && row.average_video_play !== null && row.average_video_play !== "") {
        const v = Number(row.average_video_play);
        if (!Number.isNaN(v)) {
          acc.avgVideoPlaySum += v;
          acc.avgVideoPlayCount += 1;
        }
      }
    }
  } catch (err: any) {
    warnings.push(`Windsor.ai (TikTok Ads, campañas): falló la consulta principal. Detalle: ${err?.message || err}`);
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
      `Windsor.ai (TikTok Ads, campañas): no se pudo consultar el histórico ampliado para descubrir campañas sin actividad. Detalle: ${err?.message || err}`
    );
  }

  if (byCampaign.size === 0) {
    warnings.push(`Windsor.ai (TikTok Ads, campañas): no se encontró ninguna campaña conectada, ni con actividad ni sin ella, en la ventana de descubrimiento del período elegido.`);
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
      spend: acc.spend,
      cpm: acc.impressions > 0 ? (acc.spend / acc.impressions) * 1000 : 0,
      ctr: acc.impressions > 0 ? (acc.clicks / acc.impressions) * 100 : 0,
      cpl: acc.conversions > 0 ? acc.spend / acc.conversions : 0,
      conversions: acc.conversions,
      reach: acc.reach,
      frequency: acc.frequencyCount > 0 ? acc.frequencySum / acc.frequencyCount : undefined,
      avgVideoPlaySeconds: acc.avgVideoPlayCount > 0 ? acc.avgVideoPlaySum / acc.avgVideoPlayCount : undefined,
      likes: acc.likes,
    }));

  return { campaigns, warnings };
}
