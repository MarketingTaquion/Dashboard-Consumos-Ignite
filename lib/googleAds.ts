import type { ClientData } from "./types";

/**
 * Integración con Google Ads API — SOLO SERVER-SIDE.
 * No importar este archivo desde ningún componente de cliente ("use client"):
 * expondría credenciales en el bundle del navegador.
 *
 * ⚠️ ESTADO: escrito sin poder ejecutar ni probar en este entorno (no hay
 * Node/npm disponible acá). La forma general del paquete `google-ads-api`
 * (GoogleAdsApi -> Customer -> .query(GAQL)) es la documentada por el
 * paquete, pero verificá los nombres exactos de métodos/campos contra la
 * versión que efectivamente se instale (`node_modules/google-ads-api`)
 * antes de confiar en esto para producción. Cualquier error se atrapa y
 * cae a datos mock — la app nunca se cae por esto, pero tampoco asumas que
 * "no tira error" significa "los números son correctos" hasta que lo
 * verifiques con una cuenta real.
 *
 * Credenciales necesarias (ver .env.example) — las 5 tienen que estar
 * presentes o esta función no se llama y se usa mock directamente:
 *   GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET,
 *   GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_CUSTOMER_MAP
 * (GOOGLE_ADS_LOGIN_CUSTOMER_ID es opcional, solo si usás cuenta MCC)
 */

export function hasGoogleAdsCredentials(): boolean {
  return Boolean(
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
      process.env.GOOGLE_ADS_CLIENT_ID &&
      process.env.GOOGLE_ADS_CLIENT_SECRET &&
      process.env.GOOGLE_ADS_REFRESH_TOKEN &&
      process.env.GOOGLE_ADS_CUSTOMER_MAP
  );
}

function parseCustomerMap(): Record<string, string> {
  const raw = process.env.GOOGLE_ADS_CUSTOMER_MAP || "";
  const map: Record<string, string> = {};
  raw.split(",").forEach((pair) => {
    const [key, customerId] = pair.split(":").map((s) => s.trim());
    if (key && customerId) map[key] = customerId;
  });
  return map;
}

/**
 * Trae el gasto "mes en curso" real de Google Ads para las cuentas mapeadas
 * en GOOGLE_ADS_CUSTOMER_MAP, y lo mezcla con la config no-Google (mix por
 * plataforma, CPL objetivo, salud técnica) que todavía vive en mockData —
 * eso es intencional: Google Ads API solo nos da spend/clicks/conversions
 * de la plataforma Google, no el resto del panel. A medida que se conecten
 * Meta Ads y LinkedIn Ads (vía Windsor.ai u otra vía), esta función debería
 * pasar a mezclarse con esas fuentes en vez de con mockData directamente.
 */
export async function fetchGoogleAdsSpend(
  baseClients: ClientData[]
): Promise<{ clients: ClientData[]; warnings: string[] }> {
  const warnings: string[] = [];
  const customerMap = parseCustomerMap();

  // Import dinámico: si el paquete no está instalado todavía (ej. antes del
  // primer `npm install`), esto no rompe el resto de la app.
  let GoogleAdsApi: any;
  try {
    ({ GoogleAdsApi } = await import("google-ads-api"));
  } catch (err) {
    warnings.push("No se pudo cargar el paquete google-ads-api — usando mock para todos los clientes.");
    return { clients: baseClients, warnings };
  }

  const client = new GoogleAdsApi({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  });

  const updated: ClientData[] = await Promise.all(
    baseClients.map(async (c) => {
      const customerId = customerMap[c.key];
      if (!customerId) return c; // sin mapeo -> se queda con el valor mock para este cliente

      try {
        const customer = client.Customer({
          customer_id: customerId,
          refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
          login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || undefined,
        });

        // GAQL: costo acumulado del mes en curso a nivel cuenta.
        // Revisar nombres de campo contra la versión instalada del SDK/API.
        const rows: any[] = await customer.query(`
          SELECT metrics.cost_micros
          FROM customer
          WHERE segments.date DURING THIS_MONTH
        `);

        const totalMicros = rows.reduce(
          (sum, r) => sum + Number(r?.metrics?.cost_micros || 0),
          0
        );
        const spendToDate = totalMicros / 1_000_000; // micros -> unidad de cuenta

        return {
          ...c,
          spend8: spendToDate,
          cpl: {
            ...c.cpl,
            google: c.cpl.google ? { ...c.cpl.google, real: c.cpl.google.real } : c.cpl.google,
          },
        };
      } catch (err: any) {
        warnings.push(
          `Google Ads: falló la consulta para "${c.name}" (customer ${customerId}) — se usó el valor mock. Detalle: ${err?.message || err}`
        );
        return c;
      }
    })
  );

  return { clients: updated, warnings };
}
