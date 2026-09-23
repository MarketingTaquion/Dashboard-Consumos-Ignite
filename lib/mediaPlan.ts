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
 *   cliente, plataforma, mes, cuenta, campaña, presupuesto_proyectado
 *
 * - cliente: texto libre (hoy no se cruza contra nada, es solo referencia
 *   humana en la hoja — el cruce real con el dashboard es por "cuenta"
 *   (+ "campaña" si está completa).
 * - plataforma: google | meta | tiktok | linkedin.
 * - mes: "2026-09" o "2026-09-01" — se aceptan ambos formatos.
 * - cuenta: el account_id real tal cual aparece en Windsor.ai (el mismo que
 *   ya se usa como key de las filas reales en fetchWindsorSpend).
 * - campaña (con ñ — verificado en vivo 2026-09-23: Windsor SÍ maneja bien
 *   encabezados con tilde en este connector; se había pedido el campo como
 *   "campana" sin tilde por las dudas, y Windsor devolvió HTTP 400
 *   "Unexpected field(s): {'campana'}. Did you mean: campana -> campaña" —
 *   la cautela resultó innecesaria, el nombre real de columna es con
 *   tilde). **Opcional**. Vacía = presupuesto de CUENTA (como antes).
 *   Completa con el nombre exacto de campaña (tal cual aparece en Windsor /
 *   en la tabla de Campañas de Medios, copiado, no retipeado) = presupuesto
 *   específico de esa campaña. Ver fetchMediaPlanBudgetByCampaign y
 *   lib/financeCampaigns.ts. El campo de Windsor se pide como "campaña"
 *   (con tilde); la propiedad interna en `MediaPlanTarget` se sigue
 *   llamando `campana` (sin tilde, por simplicidad de código — nada que ver
 *   con el nombre de columna real de la hoja).
 * - presupuesto_proyectado: número plano, sin "$" ni separador de miles.
 *
 * Si una cuenta tiene al menos una fila con "campaña" cargada, el
 * presupuesto de la CUENTA (fetchMediaPlanBudgetByAccount) pasa a ser la
 * SUMA de sus campañas, no la fila de cuenta (si también existe, se
 * ignora) — ver el comentario en esa función.
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
  campana: string; // "" = presupuesto de cuenta, sin campaña específica
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
    // A diferencia de los demás fetchers de este proyecto (Google/Meta/TikTok
    // Ads), esta consulta no tenía date_from/date_to — verificado en vivo
    // 2026-09-21: sin un rango de fecha, Windsor devuelve 0 filas incluso con
    // la hoja bien conectada y con datos (aunque las filas de la hoja no
    // tengan una noción de fecha propia — Windsor igual filtra por su propio
    // "data_fetched_at"). Se pide un año hacia atrás por las dudas de que el
    // próximo sync no sea inmediato.
    const now = new Date();
    const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const params = new URLSearchParams({
      api_key: process.env.WINDSOR_API_KEY,
      fields: "cliente,plataforma,mes,cuenta,campaña,presupuesto_proyectado",
      date_from: yearAgo.toISOString().slice(0, 10),
      date_to: now.toISOString().slice(0, 10),
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
        // Propiedad JS "campaña" (con tilde) — es el nombre real que Windsor
        // devuelve para este campo, con bracket notation por el carácter
        // no-ASCII (no es válido en dot notation).
        campana: String(r["campaña"] ?? "").trim(),
        presupuesto: Number(r.presupuesto_proyectado ?? 0),
      }))
      .filter((t) => t.cuenta && t.mes);

    // Diagnóstico: la consulta no tiró error, pero no hay ninguna fila
    // utilizable — dos causas bien distintas que sin esto quedan indistinguibles
    // desde afuera (las dos terminan en "$0 / Sin objetivo cargado" en silencio).
    if (targets.length === 0) {
      if (rows.length === 0) {
        return {
          targets: [],
          warning: `Hoja de proyectados (Windsor.ai / Google Sheets): la consulta no devolvió ninguna fila — revisar que el Google Sheet esté conectado como fuente de datos en Windsor.ai (connector "googlesheets").`,
        };
      }
      return {
        targets: [],
        warning: `Hoja de proyectados (Windsor.ai / Google Sheets): se leyeron ${rows.length} fila(s), pero ninguna tenía "cuenta" y "mes" completos — revisar que los encabezados de la hoja sean exactamente cliente/plataforma/mes/cuenta/campaña/presupuesto_proyectado (sin espacios ni mayúsculas distintas).`,
      };
    }

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
 *
 * Si la cuenta tiene al menos una fila de presupuesto POR CAMPAÑA (columna
 * "campana" completa) ese mes, el total de la cuenta es la SUMA de esas
 * campañas — la fila de cuenta (sin "campana"), si también existe para el
 * mismo mes, se ignora a propósito: evita mantener dos números que puedan
 * quedar desincronizados (el total "a mano" vs. la suma real de campañas).
 * Sin ninguna fila por campaña, se usa la fila de cuenta como siempre.
 */
export async function fetchMediaPlanBudgetByAccount(
  now: Date = new Date()
): Promise<{ byAccount: Map<string, number>; warning?: string }> {
  const { targets, warning } = await fetchMediaPlanTargets();
  if (warning) return { byAccount: new Map(), warning };

  const monthKeys = currentMonthKeys(now);
  const relevant = targets.filter((t) => monthKeys.includes(t.mes));

  const byAccount = new Map<string, number>();
  const accountsWithCampaignBudget = new Set<string>();
  relevant.forEach((t) => {
    if (t.campana) {
      byAccount.set(t.cuenta, (byAccount.get(t.cuenta) ?? 0) + t.presupuesto);
      accountsWithCampaignBudget.add(t.cuenta);
    }
  });
  relevant.forEach((t) => {
    if (!t.campana && !accountsWithCampaignBudget.has(t.cuenta)) {
      byAccount.set(t.cuenta, t.presupuesto);
    }
  });

  // Hay filas leídas, pero ninguna es del mes actual — la sospecha más
  // probable es que Google Sheets no se sincroniza en vivo en cada request
  // (como el resto de los connectors de Windsor, en el plan Basic es una
  // vez al día): si se acaba de editar la hoja, puede tardar en reflejarse.
  if (byAccount.size === 0) {
    const mesesEncontrados = [...new Set(targets.map((t) => t.mes))].filter(Boolean);
    return {
      byAccount,
      warning: `Hoja de proyectados: se leyeron ${targets.length} fila(s) de Windsor.ai, pero ninguna es del mes actual (se esperaba "${monthKeys[0]}"). Meses encontrados en la hoja: ${mesesEncontrados.join(", ") || "ninguno"}. Si la hoja se editó recién, puede ser que Windsor todavía no resincronizó.`,
    };
  }

  return { byAccount };
}

/**
 * Arma un mapa "cuenta:campaña" -> presupuesto proyectado, ya filtrado al
 * mes pedido — lo que necesita lib/financeCampaigns.ts para el desglose
 * por campaña de la vista Finanzas. Solo incluye filas con "campana"
 * completa; las de cuenta (sin campaña) las resuelve
 * fetchMediaPlanBudgetByAccount. No tira warning propio si viene vacío —
 * una campaña sin presupuesto cargado es un caso normal y esperado (se
 * muestra en $0 / "Sin objetivo cargado" en la UI, no es un error).
 */
export async function fetchMediaPlanBudgetByCampaign(
  now: Date = new Date()
): Promise<{ byCampaign: Map<string, number>; warning?: string }> {
  const { targets, warning } = await fetchMediaPlanTargets();
  if (warning) return { byCampaign: new Map(), warning };

  const monthKeys = currentMonthKeys(now);
  const byCampaign = new Map<string, number>();
  targets.forEach((t) => {
    if (t.campana && monthKeys.includes(t.mes)) {
      byCampaign.set(`${t.cuenta}:${t.campana}`, t.presupuesto);
    }
  });

  return { byCampaign };
}
