# Cómo conectar Google Ads API

Asume que ya tenés el proyecto corriendo (ver [tutorial de arranque](../tutorials/getting-started.md)) y que necesitás reemplazar los datos de ejemplo por datos reales de Google Ads.

## Antes de empezar: Google Ads API no es una sola API key

A diferencia de otras APIs de Google, necesitás **las 5 variables siguientes**, no una sola key:

1. **Developer Token** — Google Ads UI → Herramientas y configuración → Centro de API.
2. **Client ID + Client Secret** (OAuth2) — Google Cloud Console → APIs & Services → Credentials.
3. **Refresh Token** — se obtiene una única vez completando el consentimiento OAuth2 con un usuario que tenga acceso a las cuentas de Google Ads a integrar.
4. **Customer IDs** de cada cuenta de cliente a mapear.

> ⚠️ **Un error común:** el token de acceso que te da el "API Explorer" de Google al tocar "Execute" **no es el Refresh Token** — expira en minutos y no sirve acá. Necesitás completar el flujo OAuth2 real.

> ⚠️ **Nivel de acceso del Developer Token:** revisá si dice "Test account only" o "Basic/Standard". Con "Test account only" **solo vas a poder consultar cuentas de prueba**, no las cuentas reales de tus clientes — hay que pedirle a Google acceso Basic o Standard (revisión manual, puede tardar días).

## Pasos

1. Copiá `.env.example` a `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Completá las 5 variables (ver [referencia de variables de entorno](../reference/variables-de-entorno.md) para el detalle de cada una, incluido el formato de `GOOGLE_ADS_CUSTOMER_MAP`).
3. Reiniciá el servidor de desarrollo:
   ```bash
   npm run dev
   ```
4. Si las 5 variables están completas, `/api/spend` va a intentar traer datos reales. Si falta alguna, la app sigue usando el mock automáticamente — no hay forma de "romper" el dashboard por credenciales incompletas.

## Verificar que funcionó

- El banner superior debería cambiar de "Datos de ejemplo" a "Google Ads conectado".
- Si algo falla en la consulta real, vas a ver un banner de advertencia amarillo con el mensaje de error específico (la app cae a mock para ese cliente, no se rompe entera).

## Si algo no funciona

Revisá [`lib/googleAds.ts`](../../lib/googleAds.ts) — esa integración se escribió sin poder probarla contra una cuenta real (ver nota al principio del archivo). Si la consulta GAQL falla, comparalo contra la documentación actual del paquete `google-ads-api` instalado en `node_modules/google-ads-api`.

## Plan real: esto va a ser reemplazado por Windsor.ai

Este integración directa a Google Ads API es un paso intermedio. El plan confirmado es migrar a **Windsor.ai** como capa de ingesta unificada (Google Ads + TikTok Ads como MVP) — ver [Decisión de arquitectura de datos](../explanation/arquitectura-de-datos.md). Si estás por invertir tiempo en depurar `lib/googleAds.ts` a fondo, confirmá primero si esa migración ya está en curso.
