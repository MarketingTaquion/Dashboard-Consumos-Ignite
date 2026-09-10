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
| `WINDSOR_API_KEY` | Sí | API key simple (no OAuth) — Windsor.ai UI → Account → API Key. Ya cargada en Vercel (Production/Preview/Development) desde `marketing@taquion.com.ar`; para desarrollo local copiala también a `.env.local`. Si está presente, tiene prioridad sobre las variables de Google Ads directo. |
| `WINDSOR_GOOGLE_ADS_ACCOUNT_MAP` | En la práctica sí | Mapeo `cliente_interno:account_id`, separado por comas, con el `account_id`/`account_name` tal como aparece en Windsor.ai. Sin esto, `/api/spend` usa Windsor.ai pero no sabe a qué cliente asignarle cada cuenta — todos siguen mostrando mock. Ejemplo: `norte:1234567890,andes:2345678901`. |

Implementado en [`lib/windsor.ts`](../../lib/windsor.ts) — ver la nota al principio del archivo sobre qué está verificado contra la documentación pública de Windsor.ai y qué está asumido sin probar contra una cuenta real.

## Supabase (planeado, no implementado)

Todavía no existen estas variables — se van a necesitar cuando se cree el proyecto Supabase (ver [Decisión de arquitectura de datos](../explanation/arquitectura-de-datos.md)):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side únicamente, nunca con prefijo `NEXT_PUBLIC_`)

<!-- TODO(humano): confirmar los nombres exactos de variable una vez creado el proyecto Supabase — estos son los nombres convencionales del SDK de Supabase, no verificados contra un proyecto real todavía. -->
