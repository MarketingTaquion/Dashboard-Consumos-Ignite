# Variables de entorno

Plantilla completa en [`.env.example`](../../.env.example). Copiala a `.env.local` para desarrollo local; en producción se cargan en Vercel (Project Settings → Environment Variables — ver [cómo deployar](../how-to/deploy-a-vercel.md)).

**Ninguna de estas variables es obligatoria para correr el proyecto** — si faltan, `/api/spend` usa el dataset de ejemplo automáticamente (ver [comportamiento de fallback](./api-spend.md#comportamiento-de-fallback)).

## Google Ads API

Las 5 variables siguientes tienen que estar **todas** presentes para que `hasGoogleAdsCredentials()` devuelva `true` — ver [cómo conectar Google Ads](../how-to/conectar-google-ads.md) para el detalle de dónde conseguir cada una.

| Variable | Obligatoria si usás Google Ads real | Descripción |
|---|---|---|
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Sí | Token de Google Ads UI → Centro de API. Verificar nivel de acceso (Test vs. Basic/Standard). |
| `GOOGLE_ADS_CLIENT_ID` | Sí | Cliente OAuth2, de Google Cloud Console |
| `GOOGLE_ADS_CLIENT_SECRET` | Sí | Idem |
| `GOOGLE_ADS_REFRESH_TOKEN` | Sí | Obtenido una vez vía consentimiento OAuth2 — no confundir con el access token temporal del API Explorer |
| `GOOGLE_ADS_CUSTOMER_MAP` | Sí | Mapeo `cliente_interno:customer_id`, separado por comas. Ejemplo: `norte:1234567890,andes:2345678901` |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | No | Solo si operás con una cuenta MCC/administradora |

## Windsor.ai (prioridad sobre Google Ads directo)

Ver [cómo conectar Windsor.ai](../how-to/conectar-windsor.md) para el paso a paso.

| Variable | Obligatoria si usás Windsor.ai | Descripción |
|---|---|---|
| `WINDSOR_API_KEY` | Sí | API key simple (no OAuth) — Windsor.ai UI → Account → API Key. Ya cargada en Vercel (Production/Preview/Development) desde `marketing@taquion.com.ar`; para desarrollo local copiala también a `.env.local`. Si está presente, tiene prioridad sobre las variables de Google Ads directo. Con solo esta variable, ya se traen **todas** las cuentas de Google Ads, Meta Ads y TikTok Ads conectadas en Windsor.ai como filas propias. |
| `WINDSOR_GOOGLE_ADS_ACCOUNT_MAP` | No — opcional | Solo para pisar el spend de un cliente mock puntual con una cuenta real específica de Google Ads (`cliente_interno:account_id`, separado por comas). Sin esto, cada cuenta real igual aparece en la tabla, como fila nueva con su nombre real. Ejemplo: `norte:1234567890`. |
| `WINDSOR_META_ACCOUNT_MAP` | No — opcional | Igual que la anterior, para cuentas de Meta Ads. |
| `WINDSOR_TIKTOK_ACCOUNT_MAP` | No — opcional | Igual que la anterior, para cuentas de TikTok Ads. |

Implementado en [`lib/windsor.ts`](../../lib/windsor.ts) — ver la nota al principio del archivo sobre qué está verificado contra la documentación pública de Windsor.ai y qué está asumido sin probar contra una cuenta real.

## Vercel Global Config — "Total presupuesto" manual (Finanzas)

Primera pieza de persistencia propia del proyecto (ver [`lib/financeBudget.ts`](../../lib/financeBudget.ts) y [estado y limitaciones](../explanation/estado-y-limitaciones.md)) — un solo valor, cargado a mano por el gerente de Finanzas, guardado en un Vercel Global Config (antes llamado "Edge Config"). 2 variables, con 2 orígenes y 2 tipos de token completamente distintos:

| Variable | Obligatoria | Descripción |
|---|---|---|
| `GLOBAL_CONFIG` | Sí, para leer | Connection string de **lectura** (`https://global-config.vercel.com/<id>?token=...`). Se agrega sola a Vercel al conectar el Global Config al proyecto desde su dashboard — no se genera a mano ni se copia de ningún otro lado. |
| `VERCEL_API_TOKEN` | Sí, para escribir (guardar un valor nuevo) | Token de **cuenta** de Vercel (Account Settings → Tokens), usado contra la Vercel REST API normal (`api.vercel.com`) para el `PATCH` que actualiza el ítem. **No es el mismo token que `GLOBAL_CONFIG`** — el de `GLOBAL_CONFIG` es de solo lectura, no sirve para escribir aunque tenga forma parecida. |

Sin `GLOBAL_CONFIG`, el chip muestra "Cargar" (nunca se fabrica un número). Sin `VERCEL_API_TOKEN`, se puede ver el valor pero no guardar uno nuevo — el botón de guardar muestra el error correspondiente en vez de fallar en silencio.

El ID del Global Config (`ecfg_...`) y el del team de Vercel (`team_...`) están hardcodeados en `lib/financeBudget.ts` — no son secretos (identificadores, no credenciales), mismo criterio que `WINDSOR_BASE_URL` en `lib/windsor.ts`.

## Supabase (planeado, no implementado)

Todavía no existen estas variables — se van a necesitar cuando se cree el proyecto Supabase (ver [Decisión de arquitectura de datos](../explanation/arquitectura-de-datos.md)):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side únicamente, nunca con prefijo `NEXT_PUBLIC_`)

<!-- TODO(humano): confirmar los nombres exactos de variable una vez creado el proyecto Supabase — estos son los nombres convencionales del SDK de Supabase, no verificados contra un proyecto real todavía. -->
