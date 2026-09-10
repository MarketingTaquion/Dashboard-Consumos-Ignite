import type { ClientData } from "./types";

/**
 * Integración con Windsor.ai — API REST (`connectors.windsor.ai`), la capa de
 * ingesta elegida en la Decisión de arquitectura de datos (ver
 * docs/explanation/arquitectura-de-datos.md). Reemplaza en prioridad a
 * lib/googleAds.ts (integración directa a Google Ads API, que queda como
 * fallback si alguna vez hace falta — ver docs/how-to/conectar-google-ads.md).
 *
 * SOLO SERVER-SIDE. No importar este archivo desde ningún componente
 * "use client": expondría la API key en el bundle del navegador.
 *
 * Verificado contra una cuenta real (2026-09-10): el connector "google_ads",
 * los campos account_id/account_name/spend/conversions y la forma de
 * respuesta `{ data: [...] }` funcionan tal cual estaban asumidos acá.
 *
 * ENFOQUE: no requiere mapear cliente↔cuenta de antemano. Trae **todas**
 * las cuentas de Google Ads que Windsor.ai tenga conectadas y las agrega
 * como filas reales, una por cuenta, usando el nombre real de la cuenta.
 * Los clientes mock (`baseClients`) se mantienen sin tocar — sirven de
 * referencia/demo — y las cuentas reales se agregan a continuación.
 * `WINDSOR_GOOGLE_ADS_ACCOUNT_MAP` queda como mecanismo opcional para el
 * caso contrario: pisar el spend de un cliente mock puntual con una cuenta
 * real específica, cuando exista ese mapeo de negocio (ver
 * docs/explanation/estado-y-limitaciones.md).
 *
 * Credenciales (ver .env.example): WINDSOR_API_KEY — la única obligatoria.
 */

const WINDSOR_BASE_URL = "https://connectors.windsor.ai";

export function hasWindsorCredentials(): boolean {
  return Boolean(process.env.WINDSOR_API_KEY);
}

function parseAccountMap(): Record<string, string> {
  const raw = process.env.WINDSOR_GOOGLE_ADS_ACCOUNT_MAP || "";
  const map: Record<string, string> = {};
  raw.split(",").forEach((pair) => {
    const [key, accountId] = pair.split(":").map((s) => s.trim());
    if (key && accountId) map[key] = accountId;
  });
  return map;
}

function firstDayOfMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface AccountTotals {
  accountId: string;
  accountName: string;
  spend: number;
  conversions: number;
}

/**
 * Trae el gasto "mes en curso" de **todas** las cuentas de Google Ads
 * conectadas en Windsor.ai. Cada cuenta real se agrega como una fila propia
 * (cliente = nombre real de la cuenta, plataforma = 100% Google Ads) —
 * sin necesidad de mapeo previo. Si `WINDSOR_GOOGLE_ADS_ACCOUNT_MAP` tiene
 * una entrada que apunta a esa misma cuenta, en cambio, el spend se aplica
 * al cliente mock correspondiente (pisa su valor) en vez de crear una fila
 * nueva — para el caso puntual en que ya exista ese mapeo de negocio.
 */
export async function fetchWindsorSpend(
  baseClients: ClientData[],
  connector: string = "google_ads"
): Promise<{ clients: ClientData[]; warnings: string[] }> {
  const warnings: string[] = [];
  const accountMap = parseAccountMap(); // opcional — puede quedar vacío

  const now = new Date();
  const params = new URLSearchParams({
    api_key: process.env.WINDSOR_API_KEY!,
    fields: "account_id,account_name,date,spend,conversions",
    date_from: firstDayOfMonth(now),
    date_to: toISODate(now),
  });

  let rows: any[];
  try {
    const res = await fetch(`${WINDSOR_BASE_URL}/${connector}?${params.toString()}`, {
      // Nunca cachear: cada request de /api/spend debe reflejar el gasto actual.
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} — ${text.slice(0, 200)}`);
    }
    const json = await res.json();
    rows = Array.isArray(json) ? json : json?.data;
    if (!Array.isArray(rows)) {
      throw new Error("Respuesta inesperada de Windsor.ai (ni array ni { data: [...] })");
    }
  } catch (err: any) {
    warnings.push(
      `Windsor.ai (${connector}): falló la consulta, se usó mock para todos los clientes. Detalle: ${err?.message || err}`
    );
    return { clients: baseClients, warnings };
  }

  // Suma spend y conversiones por cuenta a lo largo de todo el rango pedido
  // (mes en curso). Las conversiones hacen falta para el CPL real
  // (spend / conversiones) — no alcanza con el spend solo.
  const byAccount = new Map<string, AccountTotals>();
  for (const row of rows) {
    const accountId = String(row.account_id ?? "");
    if (!accountId) continue;
    const accountName = String(row.account_name ?? accountId);
    const prev = byAccount.get(accountId) || { accountId, accountName, spend: 0, conversions: 0 };
    prev.spend += Number(row.spend ?? 0);
    prev.conversions += Number(row.conversions ?? 0);
    byAccount.set(accountId, prev);
  }

  if (byAccount.size === 0 && rows.length > 0) {
    warnings.push(
      `Windsor.ai (${connector}): la respuesta trajo ${rows.length} fila(s) pero ninguna tenía account_id reconocible — revisar nombres de campo contra windsor.ai/data-field/all/.`
    );
  }
  if (byAccount.size === 0 && rows.length === 0) {
    warnings.push(`Windsor.ai (${connector}): no hay cuentas conectadas o el mes en curso no tiene datos todavía.`);
  }

  // account_id -> key de cliente mock, para las cuentas que sí tienen mapeo explícito.
  const accountToMockClient = new Map<string, string>();
  Object.entries(accountMap).forEach(([clientKey, accountId]) => accountToMockClient.set(accountId, clientKey));

  const usedByMock = new Set<string>();
  const updatedMockClients: ClientData[] = baseClients.map((c) => {
    const accountId = accountMap[c.key];
    if (!accountId || !byAccount.has(accountId)) return c;
    usedByMock.add(accountId);

    const totals = byAccount.get(accountId)!;
    const cpl = c.cpl.google;
    return {
      ...c,
      spend8: totals.spend,
      cpl: {
        ...c.cpl,
        google: { ...cpl, target: cpl?.target ?? 0, real: totals.conversions > 0 ? totals.spend / totals.conversions : 0 },
      },
    };
  });

  // Todas las cuentas reales que NO tienen mapeo explícito a un cliente mock
  // se agregan como filas propias — esto es lo que trae "todas las cuentas
  // a las que se tenga acceso" a la tabla, sin curación manual previa.
  const realClients: ClientData[] = [...byAccount.values()]
    .filter((t) => !usedByMock.has(t.accountId))
    .map((t) => ({
      key: `windsor-google-${t.accountId}`,
      name: t.accountName,
      vertical: "Cuenta real (Windsor.ai)",
      budget: 0, // sin media plan cargado todavía — no se inventa un objetivo
      spend8: t.spend,
      mix: { google: 100 },
      cpl: {
        google: { target: 0, real: t.conversions > 0 ? t.spend / t.conversions : 0, label: "CPL" },
      },
      health: [],
    }));

  return { clients: [...updatedMockClients, ...realClients], warnings };
}
