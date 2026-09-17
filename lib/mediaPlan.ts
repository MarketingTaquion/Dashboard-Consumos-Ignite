import type { PlatformKey } from "./types";

/**
 * Lee los objetivos de inversión (media plan) desde la "Hoja maestra de
 * proyectados - IGNITE" del equipo, vía el conector de Google Sheets de
 * Windsor.ai — mismo mecanismo que el resto de lib/windsor.ts, otra fuente
 * más dentro de Windsor (no una herramienta nueva).
 *
 * ⚠️ ESTADO: el connector "googlesheets" y el hecho de que la primera fila
 * de la hoja se vuelve la lista de campos consultables están confirmados
 * contra la documentación pública de Windsor
 * (windsor.ai/data-field/googlesheets/) — pero no contra una respuesta real
 * de ESTA hoja en particular todavía. Si `targets` viene vacío pese a que la
 * hoja tiene filas, revisar primero que las columnas se llamen EXACTAMENTE
 * como se espera acá (ver abajo) — Windsor usa el nombre de columna tal cual
 * está escrito en la hoja, sin normalizar mayúsculas/acentos.
 *
 * Columnas esperadas en la hoja ("Hoja maestra de proyectados - IGNITE -
 * Consumos en plataformas", ver docs/how-to/conectar-windsor.md):
 *   cliente, plataforma, mes, cuenta, presupuesto_proyectado
 *
 * - cliente: texto libre (hoy no se cruza contra nada, es solo referencia
 *   humana en la hoja — el cruce real con el dashboard es por "cuenta").
 * - plataforma: google | meta | tiktok | linkedin.
 * - mes: "2026-09" o "2026-09-01" — se aceptan ambos formatos.
 * - cuenta: el account_id real tal cual aparece en Windsor.ai (el mismo que
 *   ya se usa como key de las filas reales en fetchWindsorSpend).
 * - presupuesto_proyectado: número plano, sin "$" ni separador de miles.
 *
 * SOLO SERVER-SIDE. No importar desde ningún componente "use client".
 */

const WINDSOR_BASE_URL = "https://connectors.windsor.ai";
const SHEETS_CONNECTOR = "googlesheets";

export interface MediaPlanTarget {
  cliente: string;
  plataforma: PlatformKey;
  mes: string;
  cuenta: string;
  presupuesto: number;
}

/** "2026-09" y "2026-09-01" — los 2 formatos de mes que aceptamos en la hoja. */
function currentMonthKeys(now: Date): string[] {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return [`${y}-${m}`, `${y}-${m}-01`];
}

/**
 * Trae todas las filas de la hoja maestra de proyectados, sin filtrar por
 * mes (el llamador decide qué mes le interesa). Nunca tira: cualquier error
 * se atrapa y devuelve una lista vacía + un warning — /api/spend sigue
 * funcionando con "$0 / Sin objetivo cargado" aunque la hoja falle.
 */
export async function fetchMediaPlanTargets(): Promise<{ targets: MediaPlanTarget[]; warning?: string }> {
  if (!process.env.WINDSOR_API_KEY) return { targets: [] };

  try {
    const params = new URLSearchParams({
      api_key: process.env.WINDSOR_API_KEY,
      fields: "cliente,plataforma,mes,cuenta,presupuesto_proyectado",
    });
    const res = await fetch(`${WINDSOR_BASE_URL}/${SHEETS_CONNECTOR}?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} — ${t.slice(0, 200)}`);
    }
    const json = await res.json();
    const rows = Array.isArray(json) ? json : json?.data;
    if (!Array.isArray(rows)) {
      throw new Error("Respuesta inesperada de Windsor.ai (hoja de proyectados) — ni array ni { data: [...] }");
    }

    const targets: MediaPlanTarget[] = rows
      .map((r: any) => ({
        cliente: String(r.cliente ?? "").trim(),
        plataforma: String(r.plataforma ?? "").trim() as PlatformKey,
        mes: String(r.mes ?? "").trim(),
        cuenta: String(r.cuenta ?? "").trim(),
        presupuesto: Number(r.presupuesto_proyectado ?? 0),
      }))
      .filter((t) => t.cuenta && t.mes);

    return { targets };
  } catch (err: any) {
    return {
      targets: [],
      warning: `Hoja de proyectados (Windsor.ai / Google Sheets): falló la consulta, se sigue sin objetivo cargado. Detalle: ${err?.message || err}`,
    };
  }
}

/**
 * Arma un mapa account_id -> presupuesto proyectado, ya filtrado al mes
 * pedido (por defecto, el mes en curso) — lo que necesita
 * fetchWindsorSpend para pisar el budget de una cuenta real.
 */
export async function fetchMediaPlanBudgetByAccount(
  now: Date = new Date()
): Promise<{ byAccount: Map<string, number>; warning?: string }> {
  const { targets, warning } = await fetchMediaPlanTargets();
  const monthKeys = currentMonthKeys(now);
  const byAccount = new Map<string, number>();
  targets.forEach((t) => {
    if (monthKeys.includes(t.mes)) byAccount.set(t.cuenta, t.presupuesto);
  });
  return { byAccount, warning };
}
