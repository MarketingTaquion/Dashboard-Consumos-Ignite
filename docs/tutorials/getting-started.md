# Levantar Pulso Ignite por primera vez

Este tutorial te lleva de un repo recién clonado a ver el dashboard funcionando en tu navegador, con datos de ejemplo. No hace falta ninguna credencial para completarlo.

## Requisitos

- Node.js 18.18 o superior (recomendado 20+)
- npm

Verificalo con:

```bash
node -v
npm -v
```

## Paso 1 — Instalar dependencias

Desde la raíz del proyecto:

```bash
npm install
```

Esto instala Next.js, React y `google-ads-api` (usado más adelante — ver [Conectar Google Ads](../how-to/conectar-google-ads.md)).

## Paso 2 — Levantar el servidor de desarrollo

```bash
npm run dev
```

## Paso 3 — Abrir el dashboard

Abrí [`http://localhost:3000`](http://localhost:3000) en tu navegador.

Deberías ver:
- Un banner arriba de todo indicando que estás viendo **datos de ejemplo**.
- El título "Pulso Ignite" y 4 clientes ficticios en la barra lateral: Norte Fintech, Andes Turismo, Terra Realty, MetroVoz.
- Una tabla con filas por cliente × plataforma (Meta Ads, Google Ads, LinkedIn Ads, TikTok Ads), con columnas de Ritmo de consumo, Presupuesto proyectado, Real, Remanente y Estado — y, si la cuenta tiene campañas cargadas, su desglose siempre visible al lado.

Si ves esto, el proyecto está corriendo correctamente. Sin ninguna variable de entorno configurada, **toda la información que ves es de ejemplo** — ver [`lib/mockData.ts`](../../lib/mockData.ts) para el dataset completo.

Esta es la vista **Finanzas**, en `/`. El proyecto tiene una segunda vista, **Medios/Ignite** (`/medios`, `/medios/anuncios`, `/medios/comparacion`), pensada para el equipo de medios en vez del de finanzas — ver el siguiente paso.

## Paso 4 — Probar la interactividad

Sin tocar ningún archivo, probá en Finanzas (`/`):
- Hacer click en un cliente de la barra lateral para filtrar la tabla.
- Apagar/prender una plataforma con los chips de arriba a la derecha.
- Prender/apagar el toggle "Solo con actividad" en la barra lateral.
- Abrir el dropdown de fecha y tildar "Comparar con el período anterior" — aparece una columna nueva en la tabla.
- Click en un header de columna ordenable (Ritmo de consumo, Presupuesto proyectado, Real, Remanente) para cambiar el orden.

## Paso 5 — Conocer la vista Medios/Ignite

Andá a [`http://localhost:3000/medios`](http://localhost:3000/medios) — misma fuente de datos de ejemplo, pero pensada para el equipo de medios en vez del de finanzas:

- **Campañas** (`/medios`): una fila por campaña, con métricas propias de cada plataforma (cuota de subasta/calidad en Google, alcance/frecuencia en Meta y TikTok). El selector de plataformas acá es **multi-selección** — probá prender más de una a la vez y ver cómo la tabla las combina en una sola vista.
- **Anuncios** (`/medios/anuncios`): un nivel más de detalle, agrupado por campaña — para comparar de un vistazo las variantes creativas de un mismo test (ej. una pieza estática vs. un video del mismo set). Se puede ordenar dentro de cada grupo por Mejor CPL, Mejor CTR o Más impresiones.
- **Comparación de plataformas** (`/medios/comparacion`): agregado simple, gasto/conversiones/CPL por plataforma.

Las 3 comparten el mismo selector de cuentas en la barra lateral y el filtro "Solo con actividad" (activado por defecto).

## Qué sigue

- Para conectar datos reales de Google Ads en vez del mock: [Conectar Google Ads API](../how-to/conectar-google-ads.md), o directamente [Conectar Windsor.ai](../how-to/conectar-windsor.md) (vía prioritaria, trae las 3 plataformas conectadas de una).
- Para entender por qué el dashboard se ve como una tabla operativa densa y no como un resumen ejecutivo: [Por qué la UI es una tabla operativa densa](../explanation/diseno-ui-vista-operativa.md).
- Para deployar lo que estás viendo localmente a producción: [Deployar a Vercel](../how-to/deploy-a-vercel.md).
