import type { CampaignRow } from "./types";
import { resolveDateRange, type DateRangeKey } from "./windsor";

/**
 * Datos a nivel CAMPAÑA (no cuenta) para la vista Medios — ver Artifact
 * "Pulso Ignite — Perfil Medios". Arranca solo con Google Ads: es la
 * plataforma con más métricas propias ya verificadas (ver
 * SDD-TAQUION/specs/003-dashboard-consumos.md, catálogo de métricas de
 * Medios) y la primera en conectarse a Windsor.ai. Meta Ads y TikTok Ads se
 * suman después, con el mismo patrón — ver el módulo por plataforma que
 * se agregue al lado de este.
 *
 * Campos de Google Ads pedidos a Windsor — confirmados contra la
 * documentación pública (no contra una respuesta real todavía):
 *   account_id, account_name, campaign_id, campaign_name, date, spend,
 *   conversions, impressions, clicks, search_impression_share,
 *   quality_score, search_budget_lost_impression_share,
 *   search_rank_lost_impression_share, search_absolute_top_impression_share,
 *   search_top_impression_share, optimization_score
 * No se piden todavía content_impression_share (% impresión de display) ni
 * un campo de tasa de conversión nativo — quedaron marcados como "muy
 * probable, sin confirmar" en el catálogo; conversion_rate se calcula acá
 * mismo (conversions / clicks) en vez de pedirlo, para no depender de un
 * nombre de campo sin verificar.
 *
 * Los campos de % / score (impression share, quality score, optimization
 * score) vienen día por día — se promedian sin ponderar por spend, una
 * simplificación deliberada hasta confirmar si Windsor ofrece una forma de
 * pedirlos ya agregados al período.
 *
 * SOLO SERVER-SIDE.
 */

const WINDSOR_BASE_URL = "https://connectors.windsor.ai";
const CONNECTOR = "google_ads";

const FIELDS = [
  "account_id",
  "account_name",
  "campaign_id",
  "campaign_name",
  "date",
  "spend",
  "conversions",
  "impressions",
  "clicks",
  "search_impression_share",
  "quality_score",
  "search_budget_lost_impression_share",
  "search_rank_lost_impression_share",
  "search_absolute_top_impression_share",
  "search_top_impression_share",
  "optimization_score",
].join(",");

interface Accum {
  accountId: string;
  accountName: string;
  campaignId: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  // Para promediar los campos de % / score: suma + cuántas filas tenían el campo.
  sums: Record<string, number>;
  counts: Record<string, number>;
}

const AVG_FIELDS = [
  "search_impression_share",
  "quality_score",
  "search_budget_lost_impression_share",
  "search_rank_lost_impression_share",
  "search_absolute_top_impression_share",
  "search_top_impression_share",
  "optimization_score",
] as const;

export async function fetchGoogleAdsCampaigns(
  rangeKey: DateRangeKey = "month"
): Promise<{ campaigns: CampaignRow[]; warnings: string[] }> {
  const warnings: string[] = [];
  if (!process.env.WINDSOR_API_KEY) return { campaigns: [], warnings };

  const range = resolveDateRange(rangeKey);
  let rows: any[];
  try {
    const params = new URLSearchParams({
      api_key: process.env.WINDSOR_API_KEY,
      fields: FIELDS,
      date_from: range.dateFrom,
      date_to: range.dateTo,
    });
    const res = await fetch(`${WINDSOR_BASE_URL}/${CONNECTOR}?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} — ${t.slice(0, 200)}`);
    }
    const json = await res.json();
    rows = Array.isArray(json) ? json : json?.data;
    if (!Array.isArray(rows)) throw new Error("Respuesta inesperada de Windsor.ai (ni array ni { data: [...] })");
  } catch (err: any) {
    warnings.push(`Windsor.ai (Google Ads, campañas): falló la consulta. Detalle: ${err?.message || err}`);
    return { campaigns: [], warnings };
  }

  const byCampaign = new Map<string, Accum>();
  for (const row of rows) {
    const campaignId = String(row.campaign_id ?? "");
    const accountId = String(row.account_id ?? "");
    if (!campaignId || !accountId) continue;

    const key = `${accountId}:${campaignId}`;
    const acc =
      byCampaign.get(key) ||
      ({
        accountId,
        accountName: String(row.account_name ?? accountId),
        campaignId,
        campaignName: String(row.campaign_name ?? campaignId),
        impressions: 0,
        clicks: 0,
        spend: 0,
        conversions: 0,
        sums: {},
        counts: {},
      } as Accum);

    acc.impressions += Number(row.impressions ?? 0);
    acc.clicks += Number(row.clicks ?? 0);
    acc.spend += Number(row.spend ?? 0);
    acc.conversions += Number(row.conversions ?? 0);

    for (const f of AVG_FIELDS) {
      const v = row[f];
      if (v === undefined || v === null || v === "") continue;
      const n = Number(v);
      if (Number.isNaN(n)) continue;
      acc.sums[f] = (acc.sums[f] ?? 0) + n;
      acc.counts[f] = (acc.counts[f] ?? 0) + 1;
    }

    byCampaign.set(key, acc);
  }

  if (byCampaign.size === 0 && rows.length > 0) {
    warnings.push(
      `Windsor.ai (Google Ads, campañas): la respuesta trajo ${rows.length} fila(s) pero ninguna tenía campaign_id/account_id reconocibles.`
    );
  }

  // Un mismo campo (ej. search_budget_lost_impression_share) que vino vacío
  // en TODAS las filas de TODAS las campañas es la señal de que el nombre
  // de campo no es el que Windsor usa para esta cuenta — vale la pena
  // avisarlo una sola vez en vez de que quede en silencio.
  AVG_FIELDS.forEach((f) => {
    const cameForAny = [...byCampaign.values()].some((acc) => (acc.counts[f] ?? 0) > 0);
    if (!cameForAny && byCampaign.size > 0) {
      warnings.push(
        `Windsor.ai (Google Ads, campañas): el campo "${f}" no vino en ninguna fila — puede que el nombre de campo no sea ese para esta cuenta (verificar contra windsor.ai/data-field/google_ads/).`
      );
    }
  });

  const campaigns: CampaignRow[] = [...byCampaign.values()].map((acc) => {
    const avg = (f: string) => (acc.counts[f] ? acc.sums[f] / acc.counts[f] : undefined);
    return {
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
      searchImpressionShare: avg("search_impression_share"),
      qualityScore: avg("quality_score"),
      searchBudgetLostIS: avg("search_budget_lost_impression_share"),
      searchRankLostIS: avg("search_rank_lost_impression_share"),
      searchAbsoluteTopIS: avg("search_absolute_top_impression_share"),
      searchTopIS: avg("search_top_impression_share"),
      optimizationScore: avg("optimization_score"),
    };
  });

  return { campaigns, warnings };
}
