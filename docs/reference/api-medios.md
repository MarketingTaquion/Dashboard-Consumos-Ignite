# APIs de la vista Medios — `/api/campaigns`, `/api/ads`, `/api/platform-comparison`

Las 3 rutas que consumen `MediosView.tsx`, `AnunciosView.tsx` y `ComparacionView.tsx`. Mismo criterio de fallback que [`/api/spend`](./api-spend.md): nunca devuelven error al cliente, siempre 200 con mock si algo falla.

`export const dynamic = "force-dynamic"` en las 3 — nunca se cachean.

## `GET /api/campaigns` — nivel campaña

| Param | Valores | Default |
|---|---|---|
| `platform` | `google \| meta \| tiktok \| linkedin` | `google` |
| `range` | mismos 6 rangos que `/api/spend` (ver [`lib/windsor.ts`](../../lib/windsor.ts)) | `month` |

`CONNECTED_PLATFORMS` en [`app/api/campaigns/route.ts`](../../app/api/campaigns/route.ts) decide cuáles ya tienen fetcher real: hoy **Google Ads, Meta Ads y TikTok Ads** (LinkedIn todavía cae siempre a mock con warning). Cada plataforma conectada tiene su propio archivo en `lib/`:

| Plataforma | Fetcher | Connector Windsor |
|---|---|---|
| Google Ads | [`lib/windsorCampaigns.ts`](../../lib/windsorCampaigns.ts) | `google_ads` |
| Meta Ads | [`lib/windsorMeta.ts`](../../lib/windsorMeta.ts) | `facebook` |
| TikTok Ads | [`lib/windsorTiktok.ts`](../../lib/windsorTiktok.ts) | `tiktok` |

Los 3 comparten el mismo patrón: **Capa 1** (núcleo: spend/conversions/impressions/clicks del rango elegido) + **Capa Descubrimiento** (ventana ampliada, derivada del rango elegido pero nunca más angosta que 12 meses — ver `discoveryWindowFor` en [`lib/windsor.ts`](../../lib/windsor.ts) — solo identificadores, para que una campaña pausada/sin actividad en el rango elegido muestre $0 real en vez de desaparecer — Windsor omite la fila en vez de mandarla en 0). Google Ads además tiene 2 capas más para sus métricas de subasta/calidad (ver el comentario al principio de `windsorCampaigns.ts` — Windsor las agrupa en "reportes" separados, HTTP 400 si se piden todas juntas).

### Trampas de nombres de campo encontradas al verificar contra `windsor.ai/data-field/<connector>/`

- **`facebook` no tiene `campaign_name`** — el nombre de campaña se llama simplemente **`campaign`**. Es el único de los 3 connectors así; copiar `campaign_name` de Google/TikTok sin revisar deja la columna "Campaña" vacía en silencio para Meta.
- **TikTok no expone "% video visto" ni "vistas de 6 segundos"** para campañas de video estándar — esas variantes (`ix_video_views_p100`, etc.) solo existen para anuncios "Instant Experience", un formato distinto. Por eso el catálogo real de columnas de TikTok quedó en Alcance/Frecuencia/Tiempo prom. (`average_video_play`)/Likes, sin esas dos.
- **Los rankings de Meta (`quality_ranking`, `engagement_rate_ranking`, `conversion_rate_ranking`) y el % de video visto (`video_p100_watched_actions_video_view`) son métricas de ANUNCIO**, no de campaña — un mismo `campaign_id` agrupa varios ads, cada uno con su propio ranking. Por eso no están en la tabla de Campañas de Meta ni tampoco en la primera versión de Anuncios de Meta (ver abajo) — quedaron marcadas como posible siguiente iteración, no perdidas.

### `CampaignRow` (tipo completo en [`lib/types.ts`](../../lib/types.ts))

Campos comunes a las 3 plataformas: `accountId/Name`, `campaignId/Name`, `impressions`, `clicks`, `cpm`, `ctr`, `cpl`, `conversions`. Después, campos opcionales según la plataforma — `undefined` si el campo no vino en la respuesta de Windsor (nunca se fabrica un 0 donde no hay dato):

- **Google Ads**: `searchImpressionShare`, `qualityScore`, `searchBudgetLostIS`, `searchRankLostIS`, `searchAbsoluteTopIS`, `searchTopIS`, `optimizationScore`.
- **Meta Ads y TikTok Ads**: `reach`, `frequency`.
- **TikTok Ads** además: `avgVideoPlaySeconds`, `likes`.

## `GET /api/ads` — nivel anuncio

Mismos query params que `/api/campaigns`. `CONNECTED_PLATFORMS` en [`app/api/ads/route.ts`](../../app/api/ads/route.ts): hoy **Google Ads, Meta Ads y TikTok Ads** (LinkedIn cae a mock con warning). Mismo patrón de 2 capas (núcleo + descubrimiento, ventana derivada del período elegido) que a nivel campaña, un archivo por plataforma. Cada layer tiene un timeout explícito de 8s (`LAYER_TIMEOUT_MS`) — verificado en vivo que sin esto una consulta lenta puede colgar la request entera en vez de degradar con un warning.

| Plataforma | Fetcher | Connector Windsor |
|---|---|---|
| Google Ads | [`lib/windsorAds.ts`](../../lib/windsorAds.ts) | `google_ads` |
| Meta Ads | [`lib/windsorAdsMeta.ts`](../../lib/windsorAdsMeta.ts) | `facebook` |
| TikTok Ads | [`lib/windsorAdsTiktok.ts`](../../lib/windsorAdsTiktok.ts) | `tiktok` |

`ad_id`/`ad_name` verificados contra `windsor.ai/data-field/<connector>/` de cada uno antes de escribir los fetchers. Meta repite la misma trampa que a nivel campaña: el nombre de campaña ahí es `campaign`, no `campaign_name` (`windsorAdsMeta.ts` ya lo tiene en cuenta).

Tipo `AdRow` (igual para las 3 plataformas, sin campos exclusivos): `accountId/Name`, `campaignId/Name`, `adId/Name`, `impressions`, `ctr`, `cpl`, `conversions`. Sin cuota de subasta/calidad (Google) ni rankings/% video visto (Meta) — quedaron fuera de esta primera versión de Anuncios a propósito, ver la nota arriba y el comentario al principio de `windsorAdsMeta.ts`.

## `GET /api/platform-comparison` — agregado por plataforma

Solo `range` como param (no hay `platform` — compara las 3 a la vez). **No tiene fetcher propio**: reutiliza `fetchPlatformComparison()` en [`lib/windsor.ts`](../../lib/windsor.ts), que a su vez llama al mismo `discoverPlatformAccounts()` que ya usa `/api/spend` para Finanzas. Por eso sale real para Google + Meta + TikTok desde el día uno, sin fetcher nuevo por plataforma — el gasto/conversiones ya se descubren a nivel cuenta ahí.

`source` es `"windsor"` en cuanto se encontró **al menos una cuenta en alguna plataforma** (`accountCount > 0`) — el gasto/conversiones de cada plataforma se muestran tal cual, $0 incluido, sin caer a mock por plataforma individual (mismo criterio de "cero real, transparente" que el resto del dashboard).

Tipo `PlatformComparisonRow`: `platformKey`, `label`, `spend`, `conversions`, `cpl` (0 si `conversions` es 0).
