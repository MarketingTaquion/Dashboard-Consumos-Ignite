/**
 * Total presupuesto manual para Finanzas — a pedido explícito 2026-09-28: el
 * gerente de Finanzas carga a mano el total presupuestado de TODOS los
 * meses (no es un cálculo derivado de las campañas del período elegido,
 * como el resto del dashboard — un solo número, sin importar qué rango de
 * fecha esté seleccionado). Primera pieza de persistencia propia del
 * proyecto: antes todo salía en vivo de Windsor en cada request, sin
 * guardar nada del lado nuestro (ver docs/explanation/arquitectura-de-datos.md).
 *
 * Se guarda en un Vercel Global Config (el servicio que hasta hace poco se
 * llamaba "Edge Config") — un solo valor, poca escritura, mucha lectura,
 * exactamente el caso de uso para el que está pensado. Verificado contra la
 * documentación real de Vercel antes de escribir esto (mismo criterio que
 * ya aplicamos con Windsor: nunca asumir un nombre de campo/endpoint sin
 * confirmarlo) — hay 2 mecanismos de acceso completamente separados, con 2
 * tipos de token distintos:
 *
 * - **Lectura**: el endpoint dedicado `global-config.vercel.com`, con el
 *   token de solo-lectura que ya viene adentro de la connection string
 *   `GLOBAL_CONFIG` (variable de entorno que Vercel agrega sola al conectar
 *   el Global Config al proyecto desde su dashboard — no hace falta
 *   generarla a mano).
 * - **Escritura**: la Vercel REST API normal (`api.vercel.com`), que
 *   necesita un token de **cuenta** (`VERCEL_API_TOKEN`, generado en
 *   Account Settings → Tokens). El token de solo-lectura del Global Config
 *   NO sirve acá — son 2 tipos de token distintos, no uno con más permisos
 *   que el otro.
 *
 * SOLO SERVER-SIDE.
 */

const GLOBAL_CONFIG_ID = "ecfg_pqcaw83hzbvu06jak3fimanrwafe";
const TEAM_ID = "team_ws015dyYWAQAmofPhn906OmE";
const BUDGET_KEY = "finanzas_total_presupuesto";

/**
 * Arma la URL de lectura de un ítem puntual a partir de la connection
 * string `GLOBAL_CONFIG` (formato `https://global-config.vercel.com/<id>?token=<token>`,
 * ver lib/financeBudget.ts arriba) — le agrega `/item/<key>` sin tocar el
 * token ni el resto de la URL.
 */
function readEndpointFor(key: string): string | null {
  const connectionString = process.env.GLOBAL_CONFIG;
  if (!connectionString) return null;
  try {
    const url = new URL(connectionString);
    const token = url.searchParams.get("token");
    if (!token) return null;
    return `${url.origin}${url.pathname}/item/${encodeURIComponent(key)}?token=${token}`;
  } catch {
    return null;
  }
}

/**
 * `null` = todavía nadie cargó un valor (estado inicial normal, no un
 * error) — nunca se fabrica un $0 donde no hay dato cargado, mismo criterio
 * que el resto del dashboard con el presupuesto de Windsor.
 */
export async function fetchManualBudget(): Promise<{ value: number | null; warning?: string }> {
  const endpoint = readEndpointFor(BUDGET_KEY);
  if (!endpoint) {
    return { value: null, warning: "Total presupuesto manual: falta la variable de entorno GLOBAL_CONFIG en este entorno." };
  }
  try {
    const res = await fetch(endpoint, { cache: "no-store" });
    if (res.status === 404) {
      return { value: null };
    }
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} — ${t.slice(0, 200)}`);
    }
    // La API de Global Config devuelve el valor "pelado" (no envuelto en
    // un objeto) para /item/<key> — ver doc de Vercel.
    const value = await res.json();
    return { value: typeof value === "number" && Number.isFinite(value) ? value : null };
  } catch (err: any) {
    return { value: null, warning: `Total presupuesto manual: no se pudo leer de Vercel Global Config. Detalle: ${err?.message || err}` };
  }
}

async function patchBudgetItem(token: string, operation: "update" | "create", value: number): Promise<Response> {
  return fetch(`https://api.vercel.com/v1/global-config/${GLOBAL_CONFIG_ID}/items?teamId=${TEAM_ID}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ items: [{ operation, key: BUDGET_KEY, value }] }),
    cache: "no-store",
  });
}

/**
 * La documentación de Vercel lista "upsert" como operación válida, pero en la
 * práctica falla al usarla sobre una clave que todavía no existe — y el
 * código de estado varía según la operación (404 "Edge Config Item not
 * found" con "upsert", 400 "Can not update non-existing Edge Config item"
 * con "update"; comportamiento verificado en vivo, no documentado así). Por
 * eso acá se intenta "update" primero y, si el mensaje de error indica que
 * la clave no existe (sin importar el código HTTP exacto), se reintenta con
 * "create" — cubre tanto la primera carga (Finanzas todavía no cargó ningún
 * valor) como ediciones posteriores.
 */
export async function setManualBudget(value: number): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.VERCEL_API_TOKEN;
  if (!token) return { ok: false, error: "Falta la variable de entorno VERCEL_API_TOKEN en este entorno." };
  try {
    let res = await patchBudgetItem(token, "update", value);
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      if (/not.?found|non-?existing?/i.test(t)) {
        res = await patchBudgetItem(token, "create", value);
      } else {
        throw new Error(`HTTP ${res.status} — ${t.slice(0, 200)}`);
      }
    }
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} — ${t.slice(0, 200)}`);
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: `No se pudo guardar en Vercel Global Config. Detalle: ${err?.message || err}` };
  }
}
