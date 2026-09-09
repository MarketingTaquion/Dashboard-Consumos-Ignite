# Estructura del proyecto

```
app/
  layout.tsx            # Shell raíz: fuente, metadata, importa globals.css
  page.tsx               # Entry point de la ruta "/", renderiza <Dashboard />
  globals.css             # Design tokens (ver design-tokens.md) + todos los estilos
  components/
    Dashboard.tsx         # Único componente de cliente: estado, filtros, KPIs, gráfico, tabla
  api/
    spend/route.ts        # GET /api/spend — ver api-spend.md
lib/
  types.ts                # Tipos compartidos (PlatformKey, ClientData, SpendResponse, ...)
  mockData.ts              # Dataset de ejemplo — los 4 clientes ficticios
  googleAds.ts              # Integración server-side con Google Ads API (ver conectar-google-ads.md)
docs/                      # Esta documentación
.claude/launch.json         # Config para levantar el dev server desde Claude Code
.env.example                # Plantilla de variables de entorno (ver variables-de-entorno.md)
```

## Por qué solo hay un componente de cliente

Todo el dashboard vive en un único archivo (`Dashboard.tsx`) en vez de estar dividido en subcomponentes. Es una decisión deliberada de simplicidad para el tamaño actual del proyecto (un solo dashboard, sin routing interno) — no un descuido. Si el archivo crece mucho más, separar la tabla densa, el gráfico SVG y el panel de filtros en componentes propios sería un refactor razonable, pero no se hizo preventivamente.

## Flujo de datos

```
lib/mockData.ts ──┐
                   ├─→ app/api/spend/route.ts ──→ (fetch) ──→ Dashboard.tsx (estado local)
lib/googleAds.ts ──┘        │
                             └─ decide mock vs. real según hasGoogleAdsCredentials()
```

`Dashboard.tsx` nunca importa `mockData.ts` ni `googleAds.ts` directamente — todo pasa por el `fetch("/api/spend")` en un `useEffect`. Esto es importante: **las credenciales de Google Ads nunca llegan al navegador**, solo se usan server-side dentro de la API route.
