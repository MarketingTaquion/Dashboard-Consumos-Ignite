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
 * ⚠️ ESTADO: escrito contra la documentación pública de Windsor.ai
 * (https://windsor.ai/api-documentation/, https://windsor.ai/data-field/all/),
 * sin poder ejecutarlo contra una cuenta real en este entorno (no hay
 * Node/npm disponible acá). Antes de confiar en esto en producción, verificá
 * al menos una vez con la API key real:
 *   - que el connector de Google Ads se llama efectivamente "google_ads" en
 *     la URL (confirmado en la documentación pública al momento de escribir
 *     esto, pero no contra una respuesta real);
 *   - los nombres exactos de los campos de cuenta — acá se asume
 *     "account_id" y "account_name". Si `spendByAccount` queda vacío pese a
 *     tener filas, es la primera sospecha: revisá
 *     https://windsor.ai/data-field/all/ filtrando por Google Ads;
 *   - la forma exacta del JSON de respuesta — se asume `{ data: [...] }`,
 *     con fallback a un array plano si Windsor devuelve eso en cambio.
 * Cualquier error se atrapa y cae a mock — la app nunca se cae por esto,
 * pero "no tira error" no es lo mismo que "los números son correctos".
 *
 * Credenciales / configuración (ver .env.example):
 *   WINDSOR_API_KEY — obligatoria.
 *   WINDSOR_GOOGLE_ADS_ACCOUNT_MAP — opcional pero necesaria en la práctica:
 *   sin ella no hay forma de saber a qué cliente interno corresponde cada
 *   cuenta real de Windsor.ai, y todos los clientes siguen mostrando su
 *   valor mock aunque la API key sea válida (ver el TODO de mapeo
 *   cliente↔cuenta real en docs/explanation/estado-y-limitaciones.md).
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

/**
 * Trae el gasto "mes en curso" de Google Ads vía Windsor.ai para las cuentas
 * mapeadas en WINDSOR_GOOGLE_ADS_ACCOUNT_MAP, y lo mezcla con la config
 * no-Google (mix por plataforma, CPL objetivo, salud técnica) que sigue
 * viviendo en mockData — mismo patrón que fetchGoogleAdsSpend en
 * lib/googleAds.ts. A medida que se conecten Meta Ads y TikTok Ads por esta
 * misma vía (ver orden de prioridad en specs/003-dashboard-consumos.md),
 * esta función debería generalizarse para mezclar varios connectors en vez
 * de asumir siempre "google_ads".
 */
export async function fetchWindsorSpend(
  baseClients: ClientData[],
  connector: string = "google_ads"
): Promise<{ clients: ClientData[]; warnings: string[] }> {
  const warnings: string[] = [];
  const accountMap = parseAccountMap();

  if (Object.keys(accountMap).length === 0) {
    warnings.push(
      "WINDSOR_GOOGLE_ADS_ACCOUNT_MAP no está configurada — no hay mapeo cliente→cuenta, se usó mock para todos los clientes."
    );
    return { clients: baseClients, warnings };
  }

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
  // (mes en curso). Las conversiones hacen falta para calcular el CPL real
  // (spend / conversiones) — no alcanza con el spend solo.
  const spendByAccount = new Map<string, number>();
  const conversionsByAccount = new Map<string, number>();
  for (const row of rows) {
    const acc = String(row.account_id ?? row.account_name ?? "");
    if (!acc) continue;
    spendByAccount.set(acc, (spendByAccount.get(acc) || 0) + Number(row.spend ?? 0));
    conversionsByAccount.set(acc, (conversionsByAccount.get(acc) || 0) + Number(row.conversions ?? 0));
  }

  if (spendByAccount.size === 0 && rows.length > 0) {
    warnings.push(
      `Windsor.ai (${connector}): la respuesta trajo ${rows.length} fila(s) pero ninguna tenía account_id/account_name/spend reconocibles — revisar nombres de campo contra windsor.ai/data-field/all/.`
    );
  }

  // TODO(temporal, quitar una vez validado con una cuenta real): diagnóstico
  // completo de qué se parseó y qué devolvió Windsor, para poder leerlo
  // directo del banner amarillo sin acceso a los logs del servidor.
  warnings.push(
    `[debug] accountMap parseado: ${JSON.stringify(accountMap)} · filas recibidas: ${rows.length} · cuentas encontradas en la respuesta: ${JSON.stringify([...spendByAccount.keys()])} · primera fila cruda: ${rows[0] ? JSON.stringify(rows[0]) : "(sin filas)"}`
  );

  const updated: ClientData[] = baseClients.map((c) => {
    const accountId = accountMap[c.key];
    if (!accountId) return c; // sin mapeo -> se queda con el valor mock para este cliente

    if (!spendByAccount.has(accountId)) {
      warnings.push(
        `Windsor.ai: no se encontró la cuenta "${accountId}" (cliente "${c.name}") en la respuesta — se usó el valor mock para ese cliente.`
      );
      return c;
    }

    // Siempre el valor real, tal cual lo devuelve Windsor.ai — $0 incluido.
    // Nada de mantener el mock "por las dudas" ni avisos por cada cero: un
    // 0 real es un dato válido (ej. campaña pausada), no un error.
    const spend = spendByAccount.get(accountId)!;
    const conversions = conversionsByAccount.get(accountId) || 0;
    const cpl = c.cpl.google;

    return {
      ...c,
      spend8: spend,
      cpl: {
        ...c.cpl,
        google: { ...cpl, target: cpl?.target ?? 0, real: conversions > 0 ? spend / conversions : 0 },
      },
    };
  });

  return { clients: updated, warnings };
}
