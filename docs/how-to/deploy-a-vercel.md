# Cómo deployar a Vercel

El proyecto ya está conectado a Vercel vía GitHub (`MarketingTaquion/Dashboard-Consumos-Ignite` → proyecto `dashboard-consumos-ignite`, team `marketing-2902`) — **cada push a `main` deploya solo a producción**. Esta guía cubre tanto ese flujo normal como un deploy manual desde cero.

## Flujo normal (ya configurado)

```bash
git add -A
git commit -m "tu mensaje"
git push origin main
```

Eso es todo. Vercel detecta el push vía la GitHub App instalada, builda y deploya a producción automáticamente. Podés seguir el build en `https://vercel.com/ignite-8431/dashboard-consumos-ignite`.

**Antes de pushear**, corré localmente para no subir algo roto:
```bash
npm run build
```

## Verificar que el deploy terminó bien

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://dashboard-consumos-ignite.vercel.app/
curl -s https://dashboard-consumos-ignite.vercel.app/api/spend | head -c 200
```

Un `200` y una respuesta JSON con `"source"` confirman que quedó arriba.

## Cargar variables de entorno en Vercel

Las variables de `.env.local` (ver [referencia de variables de entorno](../reference/variables-de-entorno.md)) **no se suben solas** — hay que cargarlas a mano una vez:

1. `vercel.com/ignite-8431/dashboard-consumos-ignite/settings/environment-variables`
2. "Add Environment Variable" → tipo **Secret** (no "Config") para cualquier credencial/API key.
3. Marcá los 3 entornos (Production, Preview, Development) salvo que tengas una razón para no hacerlo.
4. Guardar dispara un aviso de "Redeploy needed" — no hace falta apretarlo ahí mismo si vas a pushear código de todos modos (el próximo push ya la toma).

`WINDSOR_API_KEY` ya está cargada así, en los 3 entornos.

## Deploy manual desde cero (si el proyecto no estuviera conectado)

1. `npm i -g vercel` y `vercel login` (requiere que vos completes el login interactivo).
2. Desde la raíz del proyecto: `vercel` (primera vez, configura el proyecto) o `vercel --prod` (deploy directo a producción).
3. Alternativa sin CLI: en vercel.com → "Add New Project" → importar el repo de GitHub → deploy. Esto configura el mismo flujo automático por push que ya tenemos.

## Solución de problemas (Troubleshooting)

- **El build falla en Vercel pero funciona local:** revisá que `npm run build` (no solo `npm run dev`) pase local — el modo dev tolera algunos errores de tipos que el build de producción no.
- **La app funciona pero muestra datos de ejemplo:** las variables de entorno de esa integración no están cargadas en Vercel, o están incompletas — ver [Conectar Google Ads](./conectar-google-ads.md).
