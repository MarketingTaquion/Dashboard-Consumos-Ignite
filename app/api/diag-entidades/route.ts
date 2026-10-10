import { NextResponse } from "next/server";
import { fetchWindsorRows } from "@/lib/windsorFetch";
import { resolveDateRange } from "@/lib/windsor";

// TEMPORAL: diagnóstico de qué devuelve Windsor para anuncios sin entrega. Solo vive en el preview
// de esta rama y se elimina antes del merge.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CANDIDATES: Record<string, string> = {
  q1_con_estado: "account_id,account_name,campaign_id,campaign,ad_id,ad_name,adset_id,adset_name,status,effective_status,adset_effective_status,ad_created_time",
  q2_solo_tabla_ad: "account_id,ad_id,ad_name,adset_id,adset_name,status,ad_created_time",
  q3_con_objetivo_y_pixel: "account_id,campaign_id,campaign,ad_id,ad_name,adset_id,effective_status,adset_promoted_object,campaign_objective,adset_daily_budget",
};

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ error: "solo preview" }, { status: 404 });
  const url = new URL(request.url);
  const only = url.searchParams.get("q");
  const range = resolveDateRange("month");
  const out: Record<string, any> = { range };
  for (const [name, fields] of Object.entries(CANDIDATES)) {
    if (only && only !== name) continue;
    const t0 = Date.now();
    try {
      const rows = await fetchWindsorRows("facebook", fields, range.dateFrom, range.dateTo, 100000);
      const comunidad = rows.filter((r) => /LA_COMUNIDAD/i.test(`${r.ad_name} ${r.campaign}`));
      const ids = new Set(rows.map((r) => r.ad_id));
      out[name] = {
        ms: Date.now() - t0,
        filas: rows.length,
        anunciosUnicos: ids.size,
        camposPrimeraFila: Object.keys(rows[0] ?? {}),
        muestra: rows.slice(0, 3),
        laComunidad: comunidad.slice(0, 12),
        estados: rows.reduce((m: Record<string, number>, r) => {
          const k = String(r.effective_status ?? r.status ?? "?");
          m[k] = (m[k] ?? 0) + 1;
          return m;
        }, {}),
      };
    } catch (err: any) {
      out[name] = { ms: Date.now() - t0, error: String(err?.message || err) };
    }
  }
  return NextResponse.json(out);
}
