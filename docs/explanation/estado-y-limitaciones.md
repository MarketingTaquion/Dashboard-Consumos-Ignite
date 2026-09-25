# Estado actual y limitaciones conocidas

Este documento explica **por qué** el proyecto está donde está — para la lista accionable de tareas pendientes en formato checklist, ver la sección "Qué falta" en el [README](../../README.md). Acá se documenta el razonamiento y el contexto detrás de cada limitación, no solo el hecho de que existe.

## Las cuentas reales de Windsor.ai aparecen sin objetivo/presupuesto

`lib/windsor.ts` trae todas las cuentas conectadas en Windsor.ai (Google Ads, Meta Ads, TikTok Ads) y las agrega a la tabla con su nombre y gasto reales — pero sin un media plan cargado, no hay `budget`/`target` que asignarles. Esas filas muestran `$0` de objetivo y el estado "Sin objetivo cargado" (ver `statusFor` en `Dashboard.tsx`) en vez de un pacing fabricado. Cuando exista una fuente estructurada de targets por cuenta (pregunta abierta en `specs/003-dashboard-consumos.md`), esto se reemplaza por el objetivo real.

## Todos los clientes del dashboard son ficticios

Norte Fintech, Andes Turismo, Terra Realty y MetroVoz (ver [`lib/mockData.ts`](../../lib/mockData.ts)) **no son clientes reales de Taquión** — se inventaron para tener un dataset representativo mientras se definía el diseño del producto. En cuanto hay al menos una cuenta real conectada en Windsor.ai (Google Ads, Meta Ads o TikTok Ads), estos 4 desaparecen de la vista y se muestran las cuentas reales en su lugar — pero identificadas por su **nombre real de cuenta** (ej. "Rosbaco & Partners"), no por un cliente de Taquión. Todavía no existe un mapeo entre "cliente interno de Taquión" y "cuenta real en una plataforma publicitaria" — ese mapeo es un prerrequisito antes de que el dashboard muestre datos organizados por cliente de verdad, en vez de por cuenta publicitaria suelta.

## Por qué LinkedIn Ads sigue siendo mock

Ni siquiera está conectado en Windsor.ai. El plan de Windsor.ai (Basic) limita a 3 fuentes de datos simultáneas — con Google Ads, Meta Ads y TikTok Ads ya ocupando las 3, no queda ningún lugar libre. Sumar LinkedIn requiere upgradear el plan de Windsor.ai (decisión de costo, no técnica) — ver el detalle de plan y prioridades en `specs/003-dashboard-consumos.md` (`SDD-TAQUION`).

El MVP real hoy es **Google Ads + Meta Ads + TikTok Ads vía Windsor.ai** — LinkedIn Ads sigue mostrando datos de ejemplo hasta que se resuelva el upgrade de plan.

## `lib/windsor.ts` reemplazó en prioridad a `lib/googleAds.ts`

Se había implementado primero una integración directa a Google Ads API (OAuth2 + Developer Token, `lib/googleAds.ts`) antes de decidir la arquitectura de datos completa. Una vez que Google Ads se conectó en Windsor.ai (2026-09-09), se escribió `lib/windsor.ts` contra la API REST de Windsor.ai — mucho más simple (una sola API key, sin flujo OAuth2 propio) — y `app/api/spend/route.ts` la prioriza: si `WINDSOR_API_KEY` está presente, ni siquiera mira las credenciales de Google Ads directo. Ver [Decisión de arquitectura de datos](./arquitectura-de-datos.md) y [cómo conectar Windsor.ai](../how-to/conectar-windsor.md).

`lib/googleAds.ts` queda en el repo como fallback (por si algún día hace falta consultar Google Ads sin pasar por Windsor.ai), pero no es la vía activa. Sigue teniendo la misma limitación de origen: se escribió sin poder ejecutarlo contra una cuenta real (sin Node.js disponible en ese entorno) — verificar contra la versión instalada del paquete `google-ads-api` antes de confiar en él.

`lib/windsor.ts` tenía la misma limitación por una razón distinta al escribirse: se armó contra la documentación **pública** de Windsor.ai, sin una API key real para probar contra una respuesta real en el momento de escribirlo. **Esto ya no es así** — Google Ads, Meta Ads y TikTok Ads (a nivel cuenta, campaña y anuncio) se verificaron en vivo contra la cuenta real de Taquión en varias rondas, y esa verificación encontró y corrigió más de un nombre de campo mal asumido (ver la tabla de "trampas de nombres de campo" en [referencia de las APIs de Medios](../reference/api-medios.md)) — el ejemplo más repetido es la columna `campaña`/`campana` de la hoja de proyectados, que cambió de grafía dos veces en vivo sin que nadie tocara la hoja (ver [cómo conectar Windsor.ai](../how-to/conectar-windsor.md)). La lección que queda de esto: un nombre de campo de Windsor nunca se da por sentado solo por estar en la documentación pública — se verifica contra una respuesta real antes de confiar en él, porque el connector puede exponerlo distinto de lo documentado o cambiarlo sin aviso.

## Por qué el "acumulado por día" del gráfico no es un histórico real

El gráfico de "Ritmo de consumo" muestra una curva de gasto acumulado día a día dentro del mes. Esa curva se **estima** a partir de un patrón semanal genérico (`WEEK_PATTERN` en `Dashboard.tsx`) aplicado sobre el único dato real que existe (`spend8`, el acumulado a la fecha de corte) — no son datos diarios reales de ninguna plataforma. Esto es una simplificación deliberada mientras no hay una capa de almacenamiento con histórico real (ver [Decisión de arquitectura de datos](./arquitectura-de-datos.md)): sin Supabase guardando un snapshot diario, no hay de dónde sacar el dato real día por día.

## Por qué no hay autenticación todavía

El dashboard no tiene login — cualquiera con la URL de producción puede verlo. Esto es aceptable mientras el uso sea interno del equipo de Ignite (ver [prioridad confirmada](./arquitectura-de-datos.md#prioridad-confirmada)), pero deja de serlo en cuanto haya datos reales de clientes reales visibles ahí. La autenticación (Supabase Auth) está deliberadamente pospuesta a la fase de multiusuario, no olvidada.
