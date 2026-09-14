# Por qué la UI es una tabla operativa densa

## El punto de partida: 4 direcciones exploradas

Antes de escribir código de UI definitivo, se armaron 4 wireframes de baja fidelidad explorando estructuras genuinamente distintas para el mismo dashboard (no 4 variaciones cosméticas de lo mismo):

1. **Resumen Ejecutivo** — KPIs grandes + un solo gráfico protagonista a todo el ancho.
2. **Vista Operativa / Tabla Densa** — una tabla tipo planilla (cliente × plataforma) como objeto principal, gráfico colapsado.
3. **Portafolio de Clientes** — cada cliente como card autocontenida.
4. **Timeline de Ritmo** — el gráfico de ritmo como hero absoluto, con una franja horizontal tipo "carrera".

## Por qué se eligió la Opción 2 (tabla operativa densa)

La audiencia confirmada del dashboard es el equipo **Ignite** (growth/performance) para **monitoreo diario** — no dirección ni cliente final. Para ese uso, ver muchos números por pantalla de una sola vez (sin tener que hacer click para expandir cada cliente) es más valioso que un resumen visual de alto nivel. La Opción 2 es la que mejor sirve a "necesito escanear rápido cuáles cuentas necesitan atención hoy", que es el trabajo real que este dashboard reemplaza.

El trade-off aceptado: se pierde el "de un vistazo" ejecutivo que tenía la Opción 1 — hay que leer números, no solo mirar formas. Para esta audiencia, ese trade-off es correcto.

## Qué se sacó de la V1 al migrar a esta estructura, y por qué

La versión anterior (V1, ver [relación con la V1](./relacion-con-v1-y-spec.md)) tenía 4 stat-tiles agregados (Invertido MTD, Ritmo agregado, Clientes en riesgo, Alertas técnicas), un panel de Google Analytics, y una vista de "Pacing por cliente" separada de la tabla de eficiencia. Ninguno de los 3 sobrevivió al rediseño:

- Los **stat-tiles agregados** fueron parcialmente recuperados más adelante como chips de "Total Presupuesto" / "Total Gastado" (ver [tokens de diseño](../reference/design-tokens.md#componentes-reutilizables-clases-no-tokens)), a pedido explícito, tras un wireframe a mano que los pedía de vuelta.
- El **panel de GA** y la **vista de pacing por cliente separada** no se recuperaron — quedan reemplazados por los dots de estado en la barra lateral de clientes y no están en el backlog activo. Si hace falta esa información de nuevo, es una decisión de producto pendiente, no un olvido técnico.

## El patrón del control de fecha (Google Ads / Meta como referencia)

El dropdown de rango de fechas se rediseñó deliberadamente para calcar el patrón de Google Ads y Meta Ads Manager: lista de presets a la izquierda, opción "Personalizado" con selector de fechas, y el checkbox de "Comparar con el período anterior" **integrado en el mismo dropdown** (no como un control separado) — así es como ambas plataformas de referencia lo resuelven, y unificarlo evita que el usuario tenga que coordinar dos controles distintos para una sola decisión ("¿qué período estoy mirando, y contra qué lo comparo?").

**Actualizado 2026-09-14:** los 6 presets que estaban deshabilitados con la etiqueta "pronto" (Hoy, Ayer, Últimos 7/14/28 días, Mes anterior) ya están conectados de verdad — cada uno le pide a Windsor.ai el rango de fecha real correspondiente (`GET /api/spend?range=...`, ver [referencia de la API](../reference/api-spend.md) y `resolveDateRange` en [`lib/windsor.ts`](../../lib/windsor.ts)). Se verificó contra la cuenta real de Windsor que no hay ningún límite de plan que lo bloquee (el "30 días de historial" que aparece en reseñas es del plan **Free**, no del Basic que usamos). Queda un solo aviso real: el plan Basic sincroniza una vez al día, así que "Hoy" y "Ayer" pueden no reflejar la sincronización más reciente — está explicado en una nota dentro del propio dropdown. "Personalizado" es el único que sigue sin conectar.
