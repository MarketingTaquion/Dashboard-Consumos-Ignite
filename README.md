# Pulso Ignite (V2)

Dashboard interno de Taquión para monitorear consumo de pauta publicitaria multi-cliente
(Meta Ads, Google Ads, LinkedIn Ads). Sucesor versionado y deployable del mock inicial
publicado como Artifact.

- **V1 (mock estático, sin backend):** [`SDD-TAQUION/mockups/dashboard-consumos.html`](../SDD-TAQUION/mockups/dashboard-consumos.html)
- **Spec de producto:** [`SDD-TAQUION/specs/003-dashboard-consumos.md`](../SDD-TAQUION/specs/003-dashboard-consumos.md)
- **Este proyecto (V2):** Next.js + TypeScript, pensado para deploy en Vercel, con integración real de Google Ads API (server-side) y fallback automático a datos de ejemplo.

## ⚠️ Estado real al momento de crear este proyecto (2026-09-09)

- **No se pudo instalar ni compilar acá.** Este entorno no tiene Node.js/npm disponibles — todo el código se escribió a mano. **Vos tenés que correr `npm install` en tu máquina** antes de asumir que compila.
- **Google Ads:** todavía no hay credenciales completas. Lo que se mencionó como "token explorador" probablemente **no alcanza** — ver la sección de abajo antes de cargar nada en `.env.local`.
- **Meta Ads / LinkedIn Ads:** siguen siendo mock. La vía planeada es Windsor.ai (ver conversación previa), pendiente de conectar.
- **GitHub:** el repo general de Taquión existe pero el acceso llega mañana. Este proyecto está en un `git` local, listo para conectarse a un remoto en cuanto haya acceso — ver "Conectar a GitHub" más abajo.

## Requisitos

- Node.js 18.18+ (recomendado 20+)
- npm

## Setup local

```bash
npm install
npm run dev
```

Abrí `http://localhost:3000`. Sin ninguna variable de entorno configurada, el dashboard funciona igual con datos de ejemplo (mismos 4 clientes que la V1: Norte Fintech, Andes Turismo, Terra Realty, MetroVoz).

## Conectar Google Ads API (cuando tengas las credenciales completas)

Google Ads API **no funciona con una sola API key** como otras APIs de Google. Necesita las 4-5 cosas de `.env.example`:

1. **Developer Token** — de Google Ads UI → Herramientas y configuración → Centro de API. Tiene un **nivel de acceso** (Test / Basic / Standard). Si dice "Test account only", solo vas a poder consultar cuentas de prueba, no las cuentas reales de los clientes — hay que pedir acceso Basic/Standard a Google (revisión manual, puede tardar días).
2. **Cliente OAuth2** (Client ID + Secret) — Google Cloud Console → APIs & Services → Credentials.
3. **Refresh Token** — se obtiene una sola vez completando el flujo de consentimiento OAuth2 con un usuario que tenga acceso a las cuentas de Google Ads a integrar (no es lo mismo que el token de acceso temporal que da el "API Explorer" de Google al tocar "Execute" — ese expira en minutos y no sirve acá).
4. **Customer IDs** de cada cuenta de cliente a mapear (`GOOGLE_ADS_CUSTOMER_MAP` en `.env.example`).

Copiá `.env.example` a `.env.local`, completá lo que tengas, y `npm run dev` de nuevo. Si falta cualquiera de las 5 variables, la app usa mock automáticamente — nunca se rompe por credenciales incompletas.

**Importante:** revisá `lib/googleAds.ts` antes de confiar en él para producción — está escrito según la forma documentada del paquete `google-ads-api`, pero no se pudo ejecutar ni probar en este entorno (sin Node disponible). Probalo contra una cuenta real (o una Test Manager Account) antes de asumir que los números que devuelve son correctos.

## Deploy a Vercel

1. `npm i -g vercel` (si no lo tenés) y `vercel login`.
2. Desde esta carpeta: `vercel` (primera vez) o `vercel --prod` (producción). Vercel detecta Next.js automáticamente, no hace falta config extra.
3. Cargá las variables de `.env.example` en **Project Settings → Environment Variables** en el dashboard de Vercel (no subas `.env.local` al repo — ya está en `.gitignore`).
4. Alternativa sin CLI: importar el repo de GitHub directamente desde vercel.com → "Add New Project" → seleccionar el repo → deploy. Esto además configura deploys automáticos por rama/PR (útil para el esquema de versiones que pediste).

## Conectar a GitHub (repo de Taquión)

Todavía no se hizo ningún push — no hay remoto configurado y el acceso al repo llega mañana. Cuando lo tengas:

```bash
git remote add origin <URL-del-repo-de-Taquion>
git push -u origin main
```

Si el repo de Taquión es un **monorepo** ("con todos sus desarrollos dentro"), probablemente este proyecto tenga que vivir como una subcarpeta de ese repo en vez de ser push directo a la raíz — confirmá la convención (¿carpeta por proyecto? ¿repo separado por producto?) antes de pushear, para no romper la estructura que ya tienen. Si es así, lo más simple es copiar esta carpeta dentro del monorepo clonado y commitear ahí, en vez de pushear este git local tal cual.

## Estructura

```
app/
  layout.tsx          # shell + fuente/estilos globales
  page.tsx            # entry point, renderiza <Dashboard />
  globals.css         # design tokens (mismo sistema que la V1) + estilos
  components/
    Dashboard.tsx      # toda la lógica de UI: filtros, KPIs, gráfico, tablas
  api/spend/route.ts   # API route: devuelve mock o Google Ads real según credenciales
lib/
  types.ts             # tipos compartidos
  mockData.ts          # dataset de ejemplo (idéntico a la V1)
  googleAds.ts         # integración server-side con Google Ads API
```

## Decisión de arquitectura de datos (2026-09-09)

Se evaluó y **descartó** usar Segment/BigQuery para esto (son herramientas para otros problemas — ver detalle en `SDD-TAQUION/specs/003-dashboard-consumos.md`). El plan confirmado:

1. **Ingesta:** Windsor.ai (API REST, no MCP) — MVP con **Google Ads + TikTok Ads** (Meta Ads tiene el token roto, LinkedIn/GA pendientes de upgrade de plan — ver spec 003).
2. **Almacenamiento:** Supabase (Postgres), plan Free — todavía no creado.
3. **Multiusuario:** Supabase Auth + Row Level Security, cuando llegue la fase de usuarios cliente — **no es la prioridad actual**, el panel interno de Ignite va primero.

`WINDSOR_API_KEY` ya está cargada en las env vars de Vercel. `lib/googleAds.ts` va a reemplazarse por una integración a Windsor.ai una vez que Google Ads quede conectado ahí.

## Qué falta (backlog conocido, no implementado todavía)

- Terminar de conectar Google Ads en Windsor.ai (login de Google pendiente del lado del usuario) y confirmar salud de TikTok Ads.
- Reemplazar `lib/googleAds.ts` (integración directa a Google Ads API) por una integración a la API REST de Windsor.ai.
- Crear proyecto Supabase (Free) y migrar el almacenamiento de "mock + intento en vivo" a "leer de Supabase" (Windsor.ai alimentaría Supabase, no se consultaría en cada request).
- Mapeo real cliente↔cuenta: las cuentas conectadas en Windsor.ai hoy son cuentas **propias de Taquión** (`Taquion`, `Taquion-AdAccountTTK`, `Taquion0126`), no los 4 clientes ficticios del mock (Norte Fintech, Andes Turismo, Terra Realty, MetroVoz) — falta decidir el mapeo real.
- Persistencia/histórico real por día (hoy el "acumulado por día" se estima con un patrón semanal genérico, no son datos diarios reales de la plataforma).
- Autenticación de acceso al dashboard (Supabase Auth, fase 2 — no bloquea el trabajo actual, pero recordar que hoy no tiene login y muestra presupuestos/eficiencia reales una vez conectado).
- Tests automatizados — no hay ninguno todavía.
