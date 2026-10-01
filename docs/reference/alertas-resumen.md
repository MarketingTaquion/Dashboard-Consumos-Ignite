# Alertas del resumen (Google Chat y email)

El resumen se envía los **martes y jueves a las 8:00 hs de Argentina** (ver [variables de entorno](./variables-de-entorno.md#resumen-diario-al-equipo-google-chat-yo-email)). Lo arma [`lib/notifications.ts`](../../lib/notifications.ts) con funciones puras, y lo dispara [`app/api/cron/notify`](../../app/api/cron/notify/route.ts). Todos los umbrales están en `THRESHOLDS`, en un solo lugar.

En Google Chat llega en **3 mensajes** (gasto, evolución de anuncios, calidad de anuncios); si una sección no entra en un mensaje (límite de Chat), se reparte por bloques en más mensajes sin cortar listas. El email lleva lo mismo en un solo cuerpo.

## Gasto contra proyectado

| Alerta | Cuándo avisa | Datos |
|---|---|---|
| **Proyección a fin de mes** | Cada cuenta con presupuesto: gasto del mes ÷ días completos × días del mes. 🔴 si proyecta más del 110 % del presupuesto, 🟠 si menos del 85 %, 🚨 si ya lo superó. Desde que hay 3 días completos de datos. | Gasto (Windsor) y presupuesto (hoja de proyectados) |
| **Presupuesto del mes próximo** | Solo en los últimos 7 días del mes: cuentas con presupuesto este mes que no figuran en la hoja para el mes siguiente. | Hoja de proyectados |
| **Hoja desactualizada en Windsor** | La hoja no se pudo leer, vino vacía, o Windsor no tiene ninguna fila del mes en curso. Indica hacer **Clear Cache** en Windsor. | Hoja de proyectados |

**Días completos:** Windsor sincroniza una vez por día, así que a la mañana el gasto llega hasta ayer. La proyección usa `día del mes − 1` días, no el día de hoy.

## Performance de anuncios

Todo sobre una **ventana de 7 días completos** (del día −7 al día −1) y, para la comparación, los 7 días anteriores (−14 a −8). Solo se miran anuncios con actividad: el resumen no pide la capa de "descubrimiento" de Windsor (la más lenta).

| Alerta | Cuándo avisa | Datos |
|---|---|---|
| **Costo por seguidor** | Ranking de los 3 más baratos y los 3 más caros: gasto ÷ seguidores ganados, con al menos 5 seguidores. | Meta (`instagram_profile_follow` + `actions_like`) y TikTok (`follows`). Google no expone seguidores. |
| **Variación contra la semana anterior** | Por campaña: gasto o impresiones cambian 30 % o más, o el CTR 25 % o más (relativo). Solo campañas con 5.000+ impresiones la semana previa. | Gasto, impresiones y clicks por anuncio |
| **Frecuencia alta en Meta** | Campañas con frecuencia (impresiones ÷ alcance de toda la ventana) de 3 o más y 5.000+ impresiones. **Siempre muestra la frecuencia más alta**, aunque no haya alerta. | Meta: `impressions` y `reach` sin segmentar por día |
| **CTR muy por debajo del de su campaña** | Anuncios con 1.000+ impresiones y CTR menor al 50 % del promedio de su campaña (campañas con 2+ anuncios evaluables). | Impresiones y clicks por anuncio |

## Limitaciones conocidas

- **Frecuencia no verificada contra Meta.** Los datos de campaña de Pulso traen `reach` y `frequency` por día (la frecuencia diaria no pasa de ~1,3 en ninguna campaña, verificado 2026-10-01), así que el resumen pide el alcance de toda la ventana sin el campo `date`. No está confirmado que Windsor lo devuelva deduplicado: si suma los alcances diarios, la frecuencia saldrá cerca de 1,1 y la alerta no saltará (sin falsos positivos). Por eso el mensaje muestra siempre la frecuencia más alta: **comparar con Ads Manager** para confirmarlo.
- **Costo por seguidor mezcla** seguidores de Instagram y likes de página en Meta. El campo de TikTok es "paid follows".
- **Umbrales sin validar con el equipo:** son una propuesta inicial.
- **Sin histórico propio:** la comparación con la semana anterior se arma consultando de nuevo a Windsor, no guardando snapshots (eso queda para Supabase).

## Registro y moderación

Cada envío del cron se guarda (con el texto exacto de los mensajes) y cada alerta detectada queda registrada para consultarla en **Medios → Alertas**. Cómo activarlo: [activar el registro de alertas](../how-to/activar-registro-de-alertas.md).

- **Qué se registra como alerta:** proyección fuera de rango, mes próximo sin cargar, hoja desactualizada, variación semanal, frecuencia alta y CTR bajo el de su campaña. Los rankings de costo por seguidor son informativos y no se registran.
- **Se registran todas las detectadas**, aunque el mensaje solo liste las primeras 6 de cada tipo. Las que quedaron fuera se marcan "No figuró en el mensaje (límite de filas)".
- **Repetición:** cada alerta tiene una huella (por ejemplo, la misma campaña con frecuencia alta). La pantalla muestra cuántas veces apareció ("2.ª vez de 3, desde 1 oct").
- **Moderación:** Pendiente → Revisada o Descartada (con motivo obligatorio), reabrible; el historial guarda quién, cuándo y la nota.
- **API:** `GET /api/alerts` (registro) y `PATCH /api/alerts/<id>` (moderar, cuerpo `{ status, note?, by }`).
