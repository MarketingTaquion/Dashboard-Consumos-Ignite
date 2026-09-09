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
- Una tabla con filas por cliente × plataforma (Meta Ads, Google Ads, LinkedIn Ads, TikTok Ads), con columnas de pacing, objetivo, real y estado.

Si ves esto, el proyecto está corriendo correctamente. Sin ninguna variable de entorno configurada, **toda la información que ves es de ejemplo** — ver [`lib/mockData.ts`](../../lib/mockData.ts) para el dataset completo.

## Paso 4 — Probar la interactividad

Sin tocar ningún archivo, probá:
- Hacer click en un cliente de la barra lateral para filtrar la tabla.
- Apagar/prender una plataforma con los chips de arriba a la derecha.
- Abrir el dropdown de fecha (📅) y tildar "Comparar con el período anterior" — aparece una columna nueva en la tabla.
- Click en un header de columna ordenable (Pacing, Objetivo, Real, Δ) para cambiar el orden.

## Qué sigue

- Para conectar datos reales de Google Ads en vez del mock: [Conectar Google Ads API](../how-to/conectar-google-ads.md).
- Para entender por qué el dashboard se ve como una tabla operativa densa y no como un resumen ejecutivo: [Por qué la UI es una tabla operativa densa](../explanation/diseno-ui-vista-operativa.md).
- Para deployar lo que estás viendo localmente a producción: [Deployar a Vercel](../how-to/deploy-a-vercel.md).
