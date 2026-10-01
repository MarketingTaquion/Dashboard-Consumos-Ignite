import { fetchWindsorRows } from "./windsorFetch";
import type { ResolvedDateRange } from "./windsor";

/**
 * Frecuencia de Meta por campaña, de TODA la ventana pedida (no promedio de
 * frecuencias diarias).
 *
 * Por qué una consulta aparte: los datos de campaña de Pulso
 * (lib/windsorMeta.ts) piden `date`, así que `reach` y `frequency` llegan por
 * día. La frecuencia diaria de una campaña casi nunca pasa de ~1,3 (verificado
 * en producción 2026-10-01: todas las campañas entre 1,01 y 1,25) aunque la
 * misma persona vea el anuncio varios días — por eso un umbral de "3 o más"
 * nunca saltaría. Acá se pide SIN `date`, para que el alcance (personas
 * únicas) sea el de la ventana completa, y la frecuencia se calcula como
 * impresiones ÷ alcance.
 *
 * ⚠️ NO verificado todavía contra una respuesta real si Windsor devuelve el
 * alcance deduplicado de la ventana al omitir `date`. Si en cambio suma los
 * alcances diarios, los valores seguirán cerca de 1,1 y la alerta no saltará
 * (no hay un falso positivo posible). Por eso el resumen siempre muestra la
 * frecuencia más alta que encontró: comparándola con Ads Manager se confirma.
 *
 * SOLO SERVER-SIDE.
 */

export interface FrequencyRow {
  accountId: string;
  accountName: string;
  campaignId: string;
  campaignName: string;
  impressions: number;
  reach: number;
  /** impresiones ÷ alcance; 0 si no hay alcance. */
  frequency: number;
}

const FIELDS = "account_id,account_name,campaign_id,campaign,impressions,reach";

export async function fetchMetaFrequency(range: ResolvedDateRange): Promise<FrequencyRow[]> {
  if (!process.env.WINDSOR_API_KEY) return [];
  const rows = await fetchWindsorRows("facebook", FIELDS, range.dateFrom, range.dateTo);
  const byCampaign = new Map<string, FrequencyRow>();
  for (const r of rows) {
    const accountId = String(r.account_id ?? "");
    const campaignId = String(r.campaign_id ?? "");
    if (!accountId || !campaignId) continue;
    const key = `${accountId}:${campaignId}`;
    const acc =
      byCampaign.get(key) ??
      ({
        accountId,
        accountName: String(r.account_name ?? accountId),
        campaignId,
        // "campaign" es el nombre real del campo en el connector "facebook" (ver lib/windsorMeta.ts).
        campaignName: String(r.campaign ?? campaignId).trim(),
        impressions: 0,
        reach: 0,
        frequency: 0,
      } as FrequencyRow);
    acc.impressions += Number(r.impressions ?? 0);
    acc.reach += Number(r.reach ?? 0);
    byCampaign.set(key, acc);
  }
  const out = [...byCampaign.values()];
  for (const c of out) c.frequency = c.reach > 0 ? c.impressions / c.reach : 0;
  return out;
}
