# Cómo conectar Windsor.ai (Google Ads)

Asume que ya tenés el proyecto corriendo (ver [tutorial de arranque](../tutorials/getting-started.md)) y que **ya conectaste la cuenta de Google Ads dentro de Windsor.ai** (en la UI de Windsor, no acá). Esta guía es sobre el lado del código: qué tocar para que `/api/spend` empiece a leer esos datos en vez de mock.

Esta es la vía **prioritaria** sobre la integración directa a Google Ads API (`lib/googleAds.ts` / [conectar Google Ads API](./conectar-google-ads.md)) — ver [Decisión de arquitectura de datos](../explanation/arquitectura-de-datos.md). Si `WINDSOR_API_KEY` está presente, `/api/spend` ni siquiera llega a mirar las credenciales de Google Ads directo.

## No hace falta mapear nada de antemano

Con solo `WINDSOR_API_KEY`, `/api/spend` trae **todas** las cuentas de Google Ads que Windsor.ai tenga conectadas y las muestra como filas propias — nombre real, gasto real, $0 incluido si corresponde. `lib/windsor.ts` las descubre en 3 capas, cada una cubre lo que la anterior no puede ver:

1. **Mes en curso** — spend y conversiones reales.
2. **Últimos 12 meses** — encuentra cuentas con actividad vieja pero nada este mes (Windsor no manda una fila con spend $0, directamente omite la cuenta si no tuvo ningún evento en el rango pedido).
3. **Endpoint de cuentas conectadas** de Windsor.ai — encuentra cuentas que nunca tuvieron ni un solo evento (ej. sin campañas creadas todavía).

Las capas 2 y 3 solo aportan el nombre de la cuenta; si no tuvo actividad este mes, el gasto queda en $0. **En cuanto hay al menos una cuenta real, los 4 clientes mock (Norte Fintech, Andes Turismo, Terra Realty, MetroVoz) desaparecen de la vista** — dejan de aportar una vez que hay datos reales. Si Windsor no tiene ninguna cuenta conectada (o falla la consulta), se sigue mostrando el mock completo, para que la tabla nunca quede vacía.

## Presupuesto proyectado (media plan) — hoja de Google Sheets

Las cuentas reales aparecen con `$0` de objetivo y "Sin objetivo cargado" hasta que exista un presupuesto proyectado para cruzar. Eso sale de una **"Hoja maestra de proyectados"** en Google Sheets, conectada a Windsor.ai como una fuente más (connector `googlesheets`, no una herramienta nueva) — ver [`lib/mediaPlan.ts`](../../lib/mediaPlan.ts).

**Columnas que tiene que tener la hoja**, en la primera fila (Windsor las toma tal cual están escritas, sin normalizar):

| Columna | Formato | Ejemplo |
|---|---|---|
| `cliente` | texto libre — hoy es solo referencia humana en la hoja, no se cruza con nada | `norte` |
| `plataforma` | `google`, `meta`, `tiktok` o `linkedin` | `google` |
| `mes` | `2026-09` o `2026-09-01` (los 2 formatos sirven) | `2026-09` |
| `cuenta` | el `account_id` real tal cual aparece en Windsor.ai — es lo que cruza esta fila con la cuenta real del dashboard | `6551720043` |
| `presupuesto_proyectado` | número plano, sin `$` ni separador de miles | `1200000` |

Para conectarla: en Windsor.ai → **Add data** → **Google Sheets** → compartir la hoja como *Viewer* con el service account que te muestra la pantalla → pegar el link de la hoja → **Add Account**. No hace falta ninguna variable de entorno nueva — usa la misma `WINDSOR_API_KEY`.

Sin ninguna fila para una cuenta en el mes en curso, esa cuenta se queda en `$0` / "Sin objetivo cargado" — igual que antes, nunca se inventa un número.

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

**El dato real es siempre el que devuelve Windsor.ai, $0 incluido — sin excepción y sin fallback a mock ni avisos por cada cero.** La columna "Real" muestra dos cosas distintas según el tipo de fila, y ambas son intencionales:

- **Cuenta real nueva (sin mapeo, la mayoría):** muestra el **gasto total** de la cuenta — coincide directo con el "Costo" que ves en Google Ads. La columna "Plataforma" lo aclara con `(Gasto)` al lado.
- **Cliente mock con cuenta mapeada vía `WINDSOR_GOOGLE_ADS_ACCOUNT_MAP`:** muestra el **CPL** (`spend / conversiones`) — porque ese cliente ya tiene un objetivo de CPL cargado (del media plan mock) contra el cual comparar.

No las confundas: $457.653 de gasto total y $5.637 de costo por conversión pueden ser, los dos, el número "correcto" de la misma cuenta — depende de qué pregunta estás haciendo.

## Si algo no funciona

Las 3 capas de descubrimiento (mes en curso, 12 meses, endpoint de cuentas conectadas) ya están verificadas contra la cuenta real de Taquión (2026-09-10) — ver la nota al principio de [`lib/windsor.ts`](../../lib/windsor.ts). Si de todas formas una cuenta no aparece, revisá el banner de warning: cada una de las 3 capas avisa explícitamente si falla, en vez de fallar en silencio. Para inspeccionar una respuesta real a mano:

```
https://connectors.windsor.ai/google_ads?api_key=TU_KEY&fields=account_id,account_name,date,spend&date_from=2026-09-01&date_to=2026-09-10
https://onboard.windsor.ai/api/common/ds-accounts?datasource=google_ads&api_key=TU_KEY
```

## Estado por plataforma

El orden de prioridad confirmado es Google Ads → Meta → TikTok → YouTube → LinkedIn (ver [specs/003-dashboard-consumos.md](../../../specs/003-dashboard-consumos.md) en `SDD-TAQUION`). `lib/windsor.ts` ya trae las 3 primeras — cada una es una entrada en `PLATFORM_SOURCES` (`platformKey`, `connector` de Windsor, `label`, su env var de mapeo opcional). Para sumar una plataforma nueva: agregar su entrada ahí (confirmando primero el nombre del connector contra la documentación pública de Windsor, no asumirlo) y, si hace falta, su `WINDSOR_<PLATAFORMA>_ACCOUNT_MAP` en `.env.example`.

YouTube y LinkedIn todavía no entran en el plan Basic de Windsor (3 fuentes, ya llenas con Google Ads + Meta Ads + TikTok Ads) — necesitan un upgrade de plan antes de poder conectarse. Ver el detalle de plan y prioridades en la spec.
