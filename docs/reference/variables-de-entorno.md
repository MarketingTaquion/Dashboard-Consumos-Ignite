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

## Windsor.ai

| Variable | Estado |
|---|---|
| `WINDSOR_API_KEY` | Ya cargada en Vercel (Production/Preview/Development) desde la cuenta `marketing@taquion.com.ar`. **No consumida por código todavía** — `lib/googleAds.ts` sigue siendo la integración activa. Ver [Decisión de arquitectura de datos](../explanation/arquitectura-de-datos.md). |

<!-- TODO(humano): WINDSOR_API_KEY no está listada en .env.example todavía — agregarla ahí (con su comentario explicativo) cuando se empiece a escribir lib/windsor.ts, para que quien clone el repo sepa que existe sin tener que leer esta página. -->

## Supabase (planeado, no implementado)

Todavía no existen estas variables — se van a necesitar cuando se cree el proyecto Supabase (ver [Decisión de arquitectura de datos](../explanation/arquitectura-de-datos.md)):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side únicamente, nunca con prefijo `NEXT_PUBLIC_`)

<!-- TODO(humano): confirmar los nombres exactos de variable una vez creado el proyecto Supabase — estos son los nombres convencionales del SDK de Supabase, no verificados contra un proyecto real todavía. -->
