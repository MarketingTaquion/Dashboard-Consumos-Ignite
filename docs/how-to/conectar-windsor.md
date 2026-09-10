# Cómo conectar Windsor.ai (Google Ads)

Asume que ya tenés el proyecto corriendo (ver [tutorial de arranque](../tutorials/getting-started.md)) y que **ya conectaste la cuenta de Google Ads dentro de Windsor.ai** (en la UI de Windsor, no acá). Esta guía es sobre el lado del código: qué tocar para que `/api/spend` empiece a leer esos datos en vez de mock.

Esta es la vía **prioritaria** sobre la integración directa a Google Ads API (`lib/googleAds.ts` / [conectar Google Ads API](./conectar-google-ads.md)) — ver [Decisión de arquitectura de datos](../explanation/arquitectura-de-datos.md). Si `WINDSOR_API_KEY` está presente, `/api/spend` ni siquiera llega a mirar las credenciales de Google Ads directo.

## Por qué hace falta más que la API key

`WINDSOR_API_KEY` alcanza para que Windsor.ai te devuelva datos — pero no alcanza para que el dashboard sepa **a qué cliente interno corresponde cada cuenta real**. Los 4 "clientes" del mock (Norte Fintech, Andes Turismo, Terra Realty, MetroVoz) son ficticios; las cuentas reales conectadas en Windsor.ai son cuentas propias de Taquión. Hasta que exista ese mapeo real cliente↔cuenta (ver [estado y limitaciones](../explanation/estado-y-limitaciones.md)), tenés dos opciones:

- Mapear cada cliente ficticio a una cuenta real solo para validar que la integración funciona end-to-end (los números van a mezclar clientes ficticios con gasto real de Taquión — sirve para probar el cableado, no para leer el dashboard como si fuera cierto).
- Esperar a que exista el mapeo real antes de cargar `WINDSOR_GOOGLE_ADS_ACCOUNT_MAP` en producción.

## Pasos

1. Copiá `.env.example` a `.env.local` si todavía no lo hiciste:
   ```bash
   cp .env.example .env.local
   ```
2. Completá `WINDSOR_API_KEY` (Windsor.ai UI → Account → API Key). En producción ya está cargada en Vercel desde `marketing@taquion.com.ar` — para desarrollo local, copiala también a `.env.local`.
3. Completá `WINDSOR_GOOGLE_ADS_ACCOUNT_MAP` con el mapeo `cliente_interno:account_id` (el `account_id` o `account_name` tal como aparece en Windsor.ai — ver [referencia de variables de entorno](../reference/variables-de-entorno.md)).
4. Reiniciá el servidor de desarrollo:
   ```bash
   npm run dev
   ```
5. Si `WINDSOR_API_KEY` está presente, `/api/spend` va a intentar Windsor.ai. Sin `WINDSOR_GOOGLE_ADS_ACCOUNT_MAP`, va a devolver un warning y seguir mostrando mock para todos los clientes — no hay forma de "romper" el dashboard por configuración incompleta.

## Verificar que funcionó

- El banner superior debería cambiar de "Datos de ejemplo" a "Google Ads conectado vía Windsor.ai".
- El pie de página debería decir "Google Ads vía Windsor.ai (en vivo)".
- Si algo falla, vas a ver un banner de advertencia amarillo con el mensaje de error específico (la app cae a mock, no se rompe entera).

**Tanto `spend8` (pacing, chips de arriba) como el CPL de la tabla ("Real") se actualizan siempre que la cuenta aparezca en la respuesta — sin excepción y sin fallback a mock.** El CPL real es `spend / conversiones`; si la cuenta tuvo $0 de gasto o 0 conversiones en el mes (por ejemplo, campañas pausadas), el CPL real se muestra como `0`, tal cual. Es una decisión deliberada: un cliente conectado siempre muestra su dato real, incluido el cero — nunca un valor de ejemplo disfrazado de real. El mock solo aparece para clientes que **no** tienen cuenta mapeada en `WINDSOR_GOOGLE_ADS_ACCOUNT_MAP`.

## Si algo no funciona

Revisá [`lib/windsor.ts`](../../lib/windsor.ts) — el archivo tiene una nota al principio con todo lo que está **asumido pero no verificado contra una respuesta real** (nombre del connector, nombres de campo de cuenta, forma exacta del JSON). Si `spendByAccount` queda vacío pese a que la consulta trae filas, es la primera sospecha: los nombres de campo de Windsor.ai no son los que asume el código. Confirmalos contra [windsor.ai/data-field/all/](https://windsor.ai/data-field/all/) filtrando por Google Ads, o inspeccionando una respuesta real de:

```
https://connectors.windsor.ai/google_ads?api_key=TU_KEY&fields=account_id,account_name,date,spend&date_from=2026-09-01&date_to=2026-09-10
```

## Después de Google Ads: TikTok, Meta, LinkedIn

El orden de prioridad confirmado es Google Ads → Meta → TikTok → YouTube → LinkedIn (ver [specs/003-dashboard-consumos.md](../../../specs/003-dashboard-consumos.md) en `SDD-TAQUION`). `lib/windsor.ts` hoy solo pide el connector `google_ads` — para sumar otra plataforma hay que generalizar `fetchWindsorSpend` para mezclar varios connectors (o llamar al connector `all` filtrando por `source`), y sumar el mapeo cliente↔cuenta correspondiente. Meta Ads además tiene el token muerto en Windsor.ai (necesita re-auth del Business Manager) y YouTube/LinkedIn todavía no entran en el plan Basic (3 fuentes, ya llenas) — ver el detalle en la spec.
