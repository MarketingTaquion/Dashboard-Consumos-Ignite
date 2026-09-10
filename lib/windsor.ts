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
 * las cuentas de Google Ads que Windsor.ai tenga conectadas y las devuelve
 * como filas reales, una por cuenta, usando el nombre real de la cuenta.
 * Si hay al menos una cuenta real, los clientes mock (`baseClients`) se
 * descartan de la vista — ya no aportan una vez que hay datos reales — salvo
 * los que tengan una cuenta real pisándolos explícitamente vía
 * `WINDSOR_GOOGLE_ADS_ACCOUNT_MAP` (mecanismo opcional para cuando ya existe
 * ese mapeo de negocio; ver docs/explanation/estado-y-limitaciones.md). Sin
 * ninguna cuenta real conectada, se sigue mostrando el mock completo — la
 * tabla nunca queda vacía.
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

  async function fetchRows(dateFrom: string, dateTo: string, fields: string): Promise<any[]> {
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

  const now = new Date();
  const monthStart = firstDayOfMonth(now);
  const today = toISODate(now);
  const yearAgo = toISODate(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()));

  let monthRows: any[];
  try {
    monthRows = await fetchRows(monthStart, today, "account_id,account_name,date,spend,conversions");
  } catch (err: any) {
    warnings.push(
      `Windsor.ai (${connector}): falló la consulta, se usó mock para todos los clientes. Detalle: ${err?.message || err}`
    );
    return { clients: baseClients, warnings };
  }

  // Cuentas con actividad en el mes en curso: Windsor no manda fila para una
  // cuenta sin ningún evento en el rango pedido (no manda spend "0", omite
  // la cuenta directamente) — por eso hace falta una segunda consulta más
  // amplia para descubrir cuentas conectadas que este mes están en $0.
  const byAccount = new Map<string, AccountTotals>();
  for (const row of monthRows) {
    const accountId = String(row.account_id ?? "");
    if (!accountId) continue;
    const accountName = String(row.account_name ?? accountId);
    const prev = byAccount.get(accountId) || { accountId, accountName, spend: 0, conversions: 0 };
    prev.spend += Number(row.spend ?? 0);
    prev.conversions += Number(row.conversions ?? 0);
    byAccount.set(accountId, prev);
  }

  // Descubrir cuentas conectadas sin actividad este mes: último año, sin
  // pedir spend/conversions (más liviano) — solo para saber que existen.
  // Si esto falla, no es fatal: seguimos solo con lo que trajo el mes.
  try {
    const historyRows = await fetchRows(yearAgo, today, "account_id,account_name");
    for (const row of historyRows) {
      const accountId = String(row.account_id ?? "");
      if (!accountId || byAccount.has(accountId)) continue;
      byAccount.set(accountId, {
        accountId,
        accountName: String(row.account_name ?? accountId),
        spend: 0,
        conversions: 0,
      });
    }
  } catch (err: any) {
    warnings.push(
      `Windsor.ai (${connector}): no se pudo consultar el histórico para descubrir cuentas sin actividad este mes (se muestran solo las que sí tuvieron datos). Detalle: ${err?.message || err}`
    );
  }

  // Cuentas que NUNCA tuvieron ni un solo evento (ej. sin campañas creadas
  // todavía): ni el mes en curso ni el último año de datos las va a
  // encontrar, porque no hay ninguna fila de performance que las mencione.
  // Para esas hace falta el endpoint de CUENTAS CONECTADAS de Windsor.ai
  // (metadata, no datos de campaña) — no confirmado contra una respuesta
  // real todavía, así que se intenta como mejor esfuerzo: si falla o
  // devuelve algo con forma inesperada, no rompe nada, solo no suma cuentas
  // nuevas acá (quedan las que ya se encontraron por datos).
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
          byAccount.set(accountId, {
            accountId,
            accountName: String(acc.account_name ?? acc.name ?? accountId),
            spend: 0,
            conversions: 0,
          });
        }
      } else {
        warnings.push(
          `Windsor.ai: el endpoint de cuentas conectadas respondió con una forma inesperada — no se pudieron sumar cuentas sin ningún dato histórico (ej. sin campañas creadas). El resto de las cuentas con datos sigue funcionando normal.`
        );
      }
    } else {
      warnings.push(
        `Windsor.ai: el endpoint de cuentas conectadas devolvió HTTP ${res.status} — no se pudieron sumar cuentas sin ningún dato histórico. El resto de las cuentas con datos sigue funcionando normal.`
      );
    }
  } catch (err: any) {
    warnings.push(
      `Windsor.ai: no se pudo consultar el endpoint de cuentas conectadas (cuentas sin ningún dato histórico, como una sin campañas creadas, no van a aparecer). Detalle: ${err?.message || err}`
    );
  }

  if (byAccount.size === 0 && monthRows.length > 0) {
    warnings.push(
      `Windsor.ai (${connector}): la respuesta trajo ${monthRows.length} fila(s) pero ninguna tenía account_id reconocible — revisar nombres de campo contra windsor.ai/data-field/all/.`
    );
  }
  if (byAccount.size === 0 && monthRows.length === 0) {
    warnings.push(`Windsor.ai (${connector}): no hay cuentas conectadas, o ninguna tuvo actividad en el último año.`);
  }

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
      // Sin media plan todavía no hay CPL objetivo que comparar — se
      // muestra el gasto total de la cuenta, que es lo que coincide
      // directo con lo que se ve en Google Ads (a diferencia del costo
      // por conversión, que es otra métrica).
      cpl: {
        google: { target: 0, real: t.spend, label: "Gasto" },
      },
      health: [],
    }));

  // Con cuentas reales conectadas, los clientes ficticios de referencia ya
  // no aportan nada — a pedido del usuario, se sacan de la vista. Solo se
  // conservan los mock clients que tienen una cuenta real pisándolos
  // explícitamente (accountMap): esos ya no son "ficticios" en la práctica.
  // Si no hay ninguna cuenta real (Windsor sin cuentas, o error ya cubierto
  // arriba), se siguen mostrando los 4 mock completos — nunca una tabla vacía.
  if (realClients.length === 0 && usedByMock.size === 0) {
    return { clients: baseClients, warnings };
  }
  const overriddenMockClients = updatedMockClients.filter((c) => usedByMock.has(accountMap[c.key]));
  return { clients: [...overriddenMockClients, ...realClients], warnings };
}
