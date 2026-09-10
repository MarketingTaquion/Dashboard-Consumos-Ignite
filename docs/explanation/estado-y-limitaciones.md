# Estado actual y limitaciones conocidas

Este documento explica **por qué** el proyecto está donde está — para la lista accionable de tareas pendientes en formato checklist, ver la sección "Qué falta" en el [README](../../README.md). Acá se documenta el razonamiento y el contexto detrás de cada limitación, no solo el hecho de que existe.

## Las cuentas reales de Windsor.ai aparecen sin objetivo/presupuesto

`lib/windsor.ts` trae todas las cuentas de Google Ads conectadas en Windsor.ai y las agrega a la tabla con su nombre y gasto reales — pero sin un media plan cargado, no hay `budget`/`target` que asignarles. Esas filas muestran `$0` de objetivo y el estado "Sin objetivo cargado" (ver `statusFor` en `Dashboard.tsx`) en vez de un pacing fabricado. Cuando exista una fuente estructurada de targets por cuenta (pregunta abierta en `specs/003-dashboard-consumos.md`), esto se reemplaza por el objetivo real.

## Todos los clientes del dashboard son ficticios

Norte Fintech, Andes Turismo, Terra Realty y MetroVoz (ver [`lib/mockData.ts`](../../lib/mockData.ts)) **no son clientes reales de Taquión** — se inventaron para tener un dataset representativo mientras se definía el diseño del producto. Esto importa porque las cuentas reales conectadas en Windsor.ai hoy (`Taquion`, `Taquion-AdAccountTTK`, `Taquion0126` en TikTok Ads) son **cuentas propias de Taquión**, no de sus clientes. Todavía no existe un mapeo entre "cliente interno de este dashboard" y "cuenta real en una plataforma publicitaria" — ese mapeo es un prerrequisito antes de que cualquier integración real (Google Ads, Windsor.ai) muestre datos que reflejen clientes de verdad.

## Por qué Meta Ads y LinkedIn Ads siguen siendo mock

- **Meta Ads:** el token de acceso en Windsor.ai está roto (`Credentials 'Jazleidy Lesmes Oñate' is deactivated`) — necesita que alguien con acceso al Business Manager de Facebook lo vuelva a autenticar. No es una limitación de este proyecto, es un problema de la cuenta de Windsor.ai que hay que resolver del lado de la organización.
- **LinkedIn Ads:** ni siquiera está conectado en Windsor.ai. El plan de Windsor.ai (Basic) limita a 3 fuentes de datos simultáneas — con Facebook y TikTok ya ocupando 2, solo queda 1 lugar libre, que se está usando para Google Ads. Sumar LinkedIn requiere upgradear el plan de Windsor.ai (decisión de costo, no técnica).

Por esto el MVP real definido es **Google Ads + TikTok Ads** — las otras 2 plataformas del dashboard (Meta, LinkedIn) muestran datos de ejemplo hasta que se resuelvan esos 2 bloqueos externos.

## `lib/windsor.ts` reemplazó en prioridad a `lib/googleAds.ts`

Se había implementado primero una integración directa a Google Ads API (OAuth2 + Developer Token, `lib/googleAds.ts`) antes de decidir la arquitectura de datos completa. Una vez que Google Ads se conectó en Windsor.ai (2026-09-09), se escribió `lib/windsor.ts` contra la API REST de Windsor.ai — mucho más simple (una sola API key, sin flujo OAuth2 propio) — y `app/api/spend/route.ts` la prioriza: si `WINDSOR_API_KEY` está presente, ni siquiera mira las credenciales de Google Ads directo. Ver [Decisión de arquitectura de datos](./arquitectura-de-datos.md) y [cómo conectar Windsor.ai](../how-to/conectar-windsor.md).

`lib/googleAds.ts` queda en el repo como fallback (por si algún día hace falta consultar Google Ads sin pasar por Windsor.ai), pero no es la vía activa. Sigue teniendo la misma limitación de origen: se escribió sin poder ejecutarlo contra una cuenta real (sin Node.js disponible en ese entorno) — verificar contra la versión instalada del paquete `google-ads-api` antes de confiar en él.

`lib/windsor.ts` tiene la misma limitación por una razón distinta: se escribió contra la documentación **pública** de Windsor.ai, sin una API key real para probar contra una respuesta real en el momento de escribirlo. Los nombres de campo de cuenta (`account_id`/`account_name`) y la forma exacta del JSON de respuesta están documentados como *asumidos, no verificados* en la cabecera del archivo — primera sospecha si el mapeo cliente↔cuenta no encuentra nada pese a que la consulta trae filas.

## Por qué el "acumulado por día" del gráfico no es un histórico real

El gráfico de "Ritmo de consumo" muestra una curva de gasto acumulado día a día dentro del mes. Esa curva se **estima** a partir de un patrón semanal genérico (`WEEK_PATTERN` en `Dashboard.tsx`) aplicado sobre el único dato real que existe (`spend8`, el acumulado a la fecha de corte) — no son datos diarios reales de ninguna plataforma. Esto es una simplificación deliberada mientras no hay una capa de almacenamiento con histórico real (ver [Decisión de arquitectura de datos](./arquitectura-de-datos.md)): sin Supabase guardando un snapshot diario, no hay de dónde sacar el dato real día por día.

## Por qué no hay autenticación todavía

El dashboard no tiene login — cualquiera con la URL de producción puede verlo. Esto es aceptable mientras el uso sea interno del equipo de Ignite (ver [prioridad confirmada](./arquitectura-de-datos.md#prioridad-confirmada)), pero deja de serlo en cuanto haya datos reales de clientes reales visibles ahí. La autenticación (Supabase Auth) está deliberadamente pospuesta a la fase de multiusuario, no olvidada.
