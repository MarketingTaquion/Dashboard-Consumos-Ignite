# Cómo conectar Windsor.ai (Google Ads)

Asume que ya tenés el proyecto corriendo (ver [tutorial de arranque](../tutorials/getting-started.md)) y que **ya conectaste la cuenta de Google Ads dentro de Windsor.ai** (en la UI de Windsor, no acá). Esta guía es sobre el lado del código: qué tocar para que `/api/spend` empiece a leer esos datos en vez de mock.

Esta es la vía **prioritaria** sobre la integración directa a Google Ads API (`lib/googleAds.ts` / [conectar Google Ads API](./conectar-google-ads.md)) — ver [Decisión de arquitectura de datos](../explanation/arquitectura-de-datos.md). Si `WINDSOR_API_KEY` está presente, `/api/spend` ni siquiera llega a mirar las credenciales de Google Ads directo.

## No hace falta mapear nada de antemano

Con solo `WINDSOR_API_KEY`, `/api/spend` trae **todas** las cuentas de Google Ads que Windsor.ai tenga conectadas y las agrega a la tabla como filas propias — nombre real de la cuenta, gasto real, $0 incluido si corresponde. Los 4 clientes mock (Norte Fintech, Andes Turismo, Terra Realty, MetroVoz) se mantienen sin tocar, como referencia/demo; las cuentas reales aparecen a continuación, identificadas por su nombre real (no por un cliente ficticio).

Esas cuentas reales todavía no tienen presupuesto/objetivo cargado (no hay media plan asociado) — el "Objetivo" sale en `$0` y el estado en "Sin objetivo cargado" hasta que exista ese dato (ver [estado y limitaciones](../explanation/estado-y-limitaciones.md)).

`WINDSOR_GOOGLE_ADS_ACCOUNT_MAP` queda como mecanismo **opcional** para el caso contrario: si ya sabés que una cuenta real corresponde a uno de los clientes mock, podés pisar el spend de ese cliente puntual en vez de que aparezca como fila nueva (`cliente_interno:account_id`, ver [referencia de variables de entorno](../reference/variables-de-entorno.md)).

## Pasos

1. Copiá `.env.example` a `.env.local` si todavía no lo hiciste:
   ```bash
   cp .env.example .env.local
   ```
2. Completá `WINDSOR_API_KEY` (Windsor.ai UI → Account → API Key). En producción ya está cargada en Vercel desde `marketing@taquion.com.ar` — para desarrollo local, copiala también a `.env.local`.
3. Reiniciá el servidor de desarrollo:
   ```bash
   npm run dev
   ```
4. Listo — no hace falta ningún otro paso. `WINDSOR_GOOGLE_ADS_ACCOUNT_MAP` es opcional (ver arriba).

## Verificar que funcionó

- El banner superior debería cambiar de "Datos de ejemplo" a "Google Ads conectado vía Windsor.ai".
- El pie de página debería decir "Google Ads vía Windsor.ai (en vivo)".
- Deberías ver una fila nueva por cada cuenta real conectada en Windsor.ai, con su nombre real.
- Si algo falla, vas a ver un banner de advertencia amarillo con el mensaje de error específico (la app cae a mock, no se rompe entera).

**El CPL real es siempre el que devuelve Windsor.ai, $0 incluido — sin excepción y sin fallback a mock ni avisos por cada cero.** Es `spend / conversiones`; si la cuenta tuvo $0 de gasto o 0 conversiones en el mes (por ejemplo, campañas pausadas), se muestra `0`, tal cual. Un dato real en cero es un dato real, no un error.

## Si algo no funciona

Revisá [`lib/windsor.ts`](../../lib/windsor.ts) — el archivo tiene una nota al principio con todo lo que está **asumido pero no verificado contra una respuesta real** (nombre del connector, nombres de campo de cuenta, forma exacta del JSON). Si `spendByAccount` queda vacío pese a que la consulta trae filas, es la primera sospecha: los nombres de campo de Windsor.ai no son los que asume el código. Confirmalos contra [windsor.ai/data-field/all/](https://windsor.ai/data-field/all/) filtrando por Google Ads, o inspeccionando una respuesta real de:

```
https://connectors.windsor.ai/google_ads?api_key=TU_KEY&fields=account_id,account_name,date,spend&date_from=2026-09-01&date_to=2026-09-10
```

## Después de Google Ads: TikTok, Meta, LinkedIn

El orden de prioridad confirmado es Google Ads → Meta → TikTok → YouTube → LinkedIn (ver [specs/003-dashboard-consumos.md](../../../specs/003-dashboard-consumos.md) en `SDD-TAQUION`). `lib/windsor.ts` hoy solo pide el connector `google_ads` — para sumar otra plataforma hay que generalizar `fetchWindsorSpend` para mezclar varios connectors (o llamar al connector `all` filtrando por `source`), y sumar el mapeo cliente↔cuenta correspondiente. Meta Ads además tiene el token muerto en Windsor.ai (necesita re-auth del Business Manager) y YouTube/LinkedIn todavía no entran en el plan Basic (3 fuentes, ya llenas) — ver el detalle en la spec.
