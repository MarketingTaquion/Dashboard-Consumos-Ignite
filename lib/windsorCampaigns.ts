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
 * ⚠️ VERIFICADO 2026-09-17 contra una cuenta real: Windsor/Google Ads NO
 * deja pedir todos los campos en una sola consulta — HTTP 400
 * "Google Ads cannot return these fields in one request:
 * search_budget_lost_impression_share has no report in common with the
 * others". Google Ads organiza sus métricas en "reportes" (recursos de su
 * propia API: campaign, campaign con vista de subasta, etc.) y Windsor
 * respeta esa separación. Por eso acá se pide en CAPAS separadas — cada una
 * es su propio request, con su propio try/catch — en vez de una sola
 * consulta con todos los campos. Si una capa falla, se avisa y se sigue sin
 * esos campos particulares; el resto de la fila no se pierde.
 *
 * Capas actuales (agrupadas por lo que reveló el error de arriba — no hay
 * garantía de que el resto de los campos de la capa 2 sean 100%
 * compatibles entre sí; si aparece un nuevo error de "no report in common",
 * es la próxima capa a separar):
 *   1. Núcleo — account/campaign + spend/conversions/impressions/clicks.
 *   2. Cuota de subasta y calidad — search_impression_share, quality_score,
 *      search_rank_lost_impression_share, search_absolute_top_impression_share,
 *      search_top_impression_share, optimization_score.
 *   3. search_budget_lost_impression_share, sola (la que Windsor marcó como
 *      incompatible con el resto).
 *
 * No se piden todavía content_impression_share (% impresión de display) ni
 * un campo de tasa de conversión nativo — quedaron marcados como "muy
 * probable, sin confirmar" en el catálogo; conversion_rate se calcula acá
 * mismo (conversions / clicks) en vez de pedirlo, para no depender de un
 * nombre de campo sin verificar.
 *
 * Los campos de % / score vienen día por día — se promedian sin ponderar
 * por spend, una simplificación deliberada hasta confirmar si Windsor
 * ofrece una forma de pedirlos ya agregados al período.
 *
 * SOLO SERVER-SIDE.
 */

const WINDSOR_BASE_URL = "https://connectors.windsor.ai";
const CONNECTOR = "google_ads";

const JOIN_FIELDS = "account_id,account_name,campaign_id,campaign_name,date";
const CORE_FIELDS = `${JOIN_FIELDS},spend,conversions,impressions,clicks`;
const AUCTION_FIELDS = `${JOIN_FIELDS},search_impression_share,quality_score,search_rank_lost_impression_share,search_absolute_top_impression_share,search_top_impression_share,optimization_score`;
const BUDGET_LOST_FIELDS = `${JOIN_FIELDS},search_budget_lost_impression_share`;

const AVG_FIELDS = [
  "search_impression_share",
  "quality_score",
  "search_budget_lost_impression_share",
  "search_rank_lost_impression_share",
  "search_absolute_top_impression_share",
  "search_top_impression_share",
  "optimization_score",
] as const;

interface Accum {
  accountId: string;
  accountName: string;
  campaignId: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  hasCore: boolean;
  // Para promediar los campos de % / score: suma + cuántas filas tenían el campo.
  sums: Record<string, number>;
  counts: Record<string, number>;
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
      hasCore: false,
      sums: {},
      counts: {},
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

export async function fetchGoogleAdsCampaigns(
  rangeKey: DateRangeKey = "month"
): Promise<{ campaigns: CampaignRow[]; warnings: string[] }> {
  const warnings: string[] = [];
  if (!process.env.WINDSOR_API_KEY) return { campaigns: [], warnings };

  const range = resolveDateRange(rangeKey);
  const byCampaign = new Map<string, Accum>();

  // Capa 1 — núcleo. Si esta falla, no hay nada que mostrar: se corta acá.
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
    }
  } catch (err: any) {
    warnings.push(`Windsor.ai (Google Ads, campañas): falló la consulta principal. Detalle: ${err?.message || err}`);
    return { campaigns: [], warnings };
  }

  if (byCampaign.size === 0) {
    warnings.push(`Windsor.ai (Google Ads, campañas): no se encontró ninguna campaña con datos en el período elegido.`);
    return { campaigns: [], warnings };
  }

  // Capa 2 — cuota de subasta y calidad. Si falla, se sigue sin estas
  // columnas (quedan en "—" en la tabla) en vez de perder toda la fila.
  try {
    const rows = await fetchLayer(AUCTION_FIELDS, range.dateFrom, range.dateTo);
    for (const row of rows) {
      const acc = getOrCreate(byCampaign, row);
      if (!acc) continue;
      for (const f of ["search_impression_share", "quality_score", "search_rank_lost_impression_share", "search_absolute_top_impression_share", "search_top_impression_share", "optimization_score"] as const) {
        const v = row[f];
        if (v === undefined || v === null || v === "") continue;
        const n = Number(v);
        if (Number.isNaN(n)) continue;
        acc.sums[f] = (acc.sums[f] ?? 0) + n;
        acc.counts[f] = (acc.counts[f] ?? 0) + 1;
      }
    }
  } catch (err: any) {
    warnings.push(
      `Windsor.ai (Google Ads, campañas): falló la consulta de cuota de subasta/calidad, esas columnas quedan sin datos. Detalle: ${err?.message || err}`
    );
  }

  // Capa 3 — la que Windsor marcó como incompatible con el resto.
  try {
    const rows = await fetchLayer(BUDGET_LOST_FIELDS, range.dateFrom, range.dateTo);
    for (const row of rows) {
      const acc = getOrCreate(byCampaign, row);
      if (!acc) continue;
      const v = row.search_budget_lost_impression_share;
      if (v === undefined || v === null || v === "") continue;
      const n = Number(v);
      if (Number.isNaN(n)) continue;
      acc.sums.search_budget_lost_impression_share = (acc.sums.search_budget_lost_impression_share ?? 0) + n;
      acc.counts.search_budget_lost_impression_share = (acc.counts.search_budget_lost_impression_share ?? 0) + 1;
    }
  } catch (err: any) {
    warnings.push(
      `Windsor.ai (Google Ads, campañas): falló la consulta de pérdida por presupuesto, esa columna queda sin datos. Detalle: ${err?.message || err}`
    );
  }

  // Un campo que no vino en NINGUNA campaña (más allá de por qué) es una
  // señal a mirar — se avisa una sola vez, no por fila.
  AVG_FIELDS.forEach((f) => {
    const cameForAny = [...byCampaign.values()].some((acc) => (acc.counts[f] ?? 0) > 0);
    if (!cameForAny) {
      warnings.push(
        `Windsor.ai (Google Ads, campañas): el campo "${f}" no vino en ninguna fila — esa columna va a quedar en "—" (verificar nombre contra windsor.ai/data-field/google_ads/).`
      );
    }
  });

  const campaigns: CampaignRow[] = [...byCampaign.values()]
    .filter((acc) => acc.hasCore) // descarta filas que solo aparecieron en capas 2/3 (no deberían existir, pero por las dudas)
    .map((acc) => {
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
