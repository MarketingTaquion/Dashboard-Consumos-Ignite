import type { ClientData, PlatformKey } from "./types";

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
 * Verificado contra cuentas reales:
 * - **Google Ads** (2026-09-10): connector "google_ads", campos
 *   account_id/account_name/spend/conversions, forma `{ data: [...] }`.
 * - **Meta Ads** (2026-09-10): connector "facebook" (así lo nombra Windsor,
 *   no "meta_ads" ni "facebook_ads") — mismos campos y forma de respuesta.
 * - El endpoint de cuentas conectadas (onboard.windsor.ai/api/common/ds-accounts)
 *   también quedó verificado con Google Ads: encontró cuentas sin ningún dato
 *   de performance (FRONERI, sin campañas creadas) que los otros dos intentos
 *   no podían ver. Se usa igual para Meta, sin verificar todavía contra una
 *   cuenta de Meta sin actividad — si falla para ese connector puntual, cae
 *   al mismo mejor-esfuerzo silencioso que ya tiene cada capa.
 *
 * Descubrimiento de cuentas en 3 capas, por cada plataforma conectada, cada
 * una cubre lo que la anterior no puede: (1) mes en curso, con
 * spend/conversiones reales; (2) últimos 12 meses, solo para encontrar
 * cuentas con actividad vieja pero nada este mes; (3) endpoint de cuentas
 * conectadas, para las que nunca tuvieron ni un evento. Las capas 2 y 3 solo
 * aportan el nombre — spend/conversiones quedan en 0 si no aparecieron en la
 * capa 1.
 *
 * ENFOQUE: no requiere mapear cliente↔cuenta de antemano. Trae **todas** las
 * cuentas de cada plataforma conectada en Windsor.ai (hoy: Google Ads, Meta
 * Ads) y las devuelve como filas reales, una por cuenta, usando el nombre
 * real de la cuenta. Si hay al menos una cuenta real, los clientes mock
 * (`baseClients`) se descartan de la vista — ya no aportan una vez que hay
 * datos reales — salvo los que tengan una cuenta real pisándolos
 * explícitamente vía `WINDSOR_GOOGLE_ADS_ACCOUNT_MAP` /
 * `WINDSOR_META_ACCOUNT_MAP` (mecanismo opcional para cuando ya existe ese
 * mapeo de negocio; ver docs/explanation/estado-y-limitaciones.md). Sin
 * ninguna cuenta real conectada, se sigue mostrando el mock completo — la
 * tabla nunca queda vacía.
 *
 * Próximas plataformas del orden de prioridad (ver specs/003-dashboard-consumos.md
 * en SDD-TAQUION): TikTok Ads, YouTube, LinkedIn Ads — agregar una entrada
 * más a PLATFORM_SOURCES y (si hace falta mapeo) su propia env var
 * WINDSOR_<PLATAFORMA>_ACCOUNT_MAP.
 *
 * Credenciales (ver .env.example): WINDSOR_API_KEY — la única obligatoria.
 */

const WINDSOR_BASE_URL = "https://connectors.windsor.ai";

export function hasWindsorCredentials(): boolean {
  return Boolean(process.env.WINDSOR_API_KEY);
}

interface PlatformSource {
  platformKey: PlatformKey;
  connector: string;
  label: string;
  accountMapEnvVar: string;
}

const PLATFORM_SOURCES: PlatformSource[] = [
  { platformKey: "google", connector: "google_ads", label: "Google Ads", accountMapEnvVar: "WINDSOR_GOOGLE_ADS_ACCOUNT_MAP" },
  { platformKey: "meta", connector: "facebook", label: "Meta Ads", accountMapEnvVar: "WINDSOR_META_ACCOUNT_MAP" },
];

function parseAccountMap(envVar: string): Record<string, string> {
  const raw = process.env[envVar] || "";
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

async function fetchRows(connector: string, dateFrom: string, dateTo: string, fields: string): Promise<any[]> {
  const params = new URLSearchParams({ api_key: process.env.WINDSOR_API_KEY!, fields, date_from: dateFrom, date_to: dateTo });
  const res = await fetch(`${WINDSOR_BASE_URL}/${connector}?${params.toString()}`, {
    // Nunca cachear: cada request de /api/spend debe reflejar el gasto actual.
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} — ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  const rows = Array.isArray(json) ? json : json?.data;
  if (!Array.isArray(rows)) {
    throw new Error("Respuesta inesperada de Windsor.ai (ni array ni { data: [...] })");
  }
  return rows;
}

/**
 * Descubre las cuentas conectadas de UNA plataforma (un connector de
 * Windsor.ai) en 3 capas — ver la nota del archivo. Nunca tira: cualquier
 * falla en cualquier capa se empuja a `warnings` y sigue con lo que ya tenga.
 */
async function discoverPlatformAccounts(source: PlatformSource, warnings: string[]): Promise<Map<string, AccountTotals>> {
  const { connector, label } = source;
  const now = new Date();
  const monthStart = firstDayOfMonth(now);
  const today = toISODate(now);
  const yearAgo = toISODate(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()));

  const byAccount = new Map<string, AccountTotals>();

  // Capa 1: mes en curso, spend y conversiones reales.
  let monthRows: any[] = [];
  try {
    monthRows = await fetchRows(connector, monthStart, today, "account_id,account_name,date,spend,conversions");
    for (const row of monthRows) {
      const accountId = String(row.account_id ?? "");
      if (!accountId) continue;
      const accountName = String(row.account_name ?? accountId);
      const prev = byAccount.get(accountId) || { accountId, accountName, spend: 0, conversions: 0 };
      prev.spend += Number(row.spend ?? 0);
      prev.conversions += Number(row.conversions ?? 0);
      byAccount.set(accountId, prev);
    }
  } catch (err: any) {
    warnings.push(`Windsor.ai (${label}): falló la consulta del mes en curso. Detalle: ${err?.message || err}`);
  }

  // Capa 2: últimos 12 meses, solo para descubrir cuentas sin actividad este
  // mes (Windsor no manda una fila con spend "0", omite la cuenta directamente).
  try {
    const historyRows = await fetchRows(connector, yearAgo, today, "account_id,account_name");
    for (const row of historyRows) {
      const accountId = String(row.account_id ?? "");
      if (!accountId || byAccount.has(accountId)) continue;
      byAccount.set(accountId, { accountId, accountName: String(row.account_name ?? accountId), spend: 0, conversions: 0 });
    }
  } catch (err: any) {
    warnings.push(`Windsor.ai (${label}): no se pudo consultar el histórico de 12 meses. Detalle: ${err?.message || err}`);
  }

  // Capa 3: endpoint de cuentas conectadas (metadata, no datos de campaña) —
  // para cuentas que nunca tuvieron ni un solo evento.
  try {
    const url = `https://onboard.windsor.ai/api/common/ds-accounts?datasource=${connector}&api_key=${process.env.WINDSOR_API_KEY}`;
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      const list = Array.isArray(json) ? json : json?.data ?? json?.accounts;
      if (Array.isArray(list)) {
        for (const acc of list) {
          const accountId = String(acc.account_id ?? acc.id ?? "");
          if (!accountId || byAccount.has(accountId)) continue;
          byAccount.set(accountId, { accountId, accountName: String(acc.account_name ?? acc.name ?? accountId), spend: 0, conversions: 0 });
        }
      } else {
        warnings.push(`Windsor.ai (${label}): el endpoint de cuentas conectadas respondió con una forma inesperada.`);
      }
    } else {
      warnings.push(`Windsor.ai (${label}): el endpoint de cuentas conectadas devolvió HTTP ${res.status}.`);
    }
  } catch (err: any) {
    warnings.push(`Windsor.ai (${label}): no se pudo consultar el endpoint de cuentas conectadas. Detalle: ${err?.message || err}`);
  }

  if (byAccount.size === 0) {
    warnings.push(`Windsor.ai (${label}): no se encontró ninguna cuenta conectada con datos en el último año.`);
  }

  return byAccount;
}

/**
 * Trae el gasto real de **todas** las cuentas conectadas en Windsor.ai, para
 * cada plataforma en `PLATFORM_SOURCES` (hoy: Google Ads, Meta Ads). Cada
 * cuenta real se agrega como una fila propia — sin necesidad de mapeo
 * previo. Si el mapeo opcional por plataforma (`WINDSOR_<PLATAFORMA>_ACCOUNT_MAP`)
 * tiene una entrada que apunta a esa cuenta, en cambio, el spend se aplica al
 * cliente mock correspondiente (pisa su valor) en vez de crear una fila nueva.
 */
export async function fetchWindsorSpend(baseClients: ClientData[]): Promise<{ clients: ClientData[]; warnings: string[] }> {
  const warnings: string[] = [];

  const usedByMock = new Set<string>(); // "platformKey:accountId" ya aplicado a un mock client
  let updatedMockClients: ClientData[] = baseClients;
  const allRealClients: ClientData[] = [];

  for (const source of PLATFORM_SOURCES) {
    const byAccount = await discoverPlatformAccounts(source, warnings);
    const accountMap = parseAccountMap(source.accountMapEnvVar);

    updatedMockClients = updatedMockClients.map((c) => {
      const accountId = accountMap[c.key];
      if (!accountId || !byAccount.has(accountId)) return c;
      usedByMock.add(`${source.platformKey}:${accountId}`);

      const totals = byAccount.get(accountId)!;
      const prevCpl = c.cpl[source.platformKey];
      return {
        ...c,
        spend8: c.spend8 + totals.spend, // se acumula: un mock client puede tener overrides de varias plataformas
        cpl: {
          ...c.cpl,
          [source.platformKey]: {
            ...prevCpl,
            target: prevCpl?.target ?? 0,
            real: totals.conversions > 0 ? totals.spend / totals.conversions : 0,
          },
        },
      };
    });

    // Todas las cuentas reales que NO tienen mapeo explícito a un cliente
    // mock se agregan como filas propias.
    [...byAccount.values()]
      .filter((t) => !usedByMock.has(`${source.platformKey}:${t.accountId}`))
      .forEach((t) =>
        allRealClients.push({
          key: `windsor-${source.platformKey}-${t.accountId}`,
          name: t.accountName,
          vertical: `Cuenta real (Windsor.ai — ${source.label})`,
          budget: 0, // sin media plan cargado todavía — no se inventa un objetivo
          spend8: t.spend,
          mix: { [source.platformKey]: 100 } as Partial<Record<PlatformKey, number>>,
          // Sin media plan todavía no hay CPL objetivo que comparar — se
          // muestra el gasto total de la cuenta, que es lo que coincide
          // directo con lo que se ve en la plataforma (a diferencia del
          // costo por conversión, que es otra métrica).
          cpl: { [source.platformKey]: { target: 0, real: t.spend, label: "Gasto" } } as ClientData["cpl"],
          health: [],
        })
      );
  }

  // Con cuentas reales conectadas, los clientes ficticios de referencia ya
  // no aportan nada — a pedido del usuario, se sacan de la vista. Solo se
  // conservan los mock clients que tienen alguna cuenta real pisándolos
  // explícitamente. Sin ninguna cuenta real (Windsor sin cuentas conectadas
  // en ninguna plataforma, o todas las consultas fallaron), se sigue
  // mostrando el mock completo — nunca una tabla vacía.
  if (allRealClients.length === 0 && usedByMock.size === 0) {
    return { clients: baseClients, warnings };
  }
  const overriddenMockClients = updatedMockClients.filter((c) =>
    PLATFORM_SOURCES.some((s) => usedByMock.has(`${s.platformKey}:${parseAccountMap(s.accountMapEnvVar)[c.key]}`))
  );
  return { clients: [...overriddenMockClients, ...allRealClients], warnings };
}
