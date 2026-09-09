# Cómo agregar una plataforma nueva al dashboard

Esta guía documenta los pasos reales que se siguieron para agregar **TikTok Ads** como 4ta plataforma — usalos como plantilla para la próxima (ej. cuando se conecte LinkedIn Ads o Google Analytics de verdad).

## 1. Extender el tipo `PlatformKey`

En [`lib/types.ts`](../../lib/types.ts):

```ts
export type PlatformKey = "meta" | "google" | "linkedin" | "tiktok";
```

## 2. Agregar el color categórico en `globals.css`

En [`app/globals.css`](../../app/globals.css), agregá el token en **las 3 secciones de tema** (`:root` claro, `@media prefers-color-scheme: dark`, y `:root[data-theme="dark"]`) — ver [referencia de tokens de diseño](../reference/design-tokens.md) para el criterio de qué color usar (los colores categóricos siguen un orden fijo, nunca se reordenan ni se inventan libremente).

```css
--plat-tiktok: #eda100; /* claro */
--plat-tiktok: #c98500; /* oscuro, en ambos bloques dark */
```

## 3. Agregar la plataforma al array `PLATFORMS`

En [`app/components/Dashboard.tsx`](../../app/components/Dashboard.tsx):

```ts
const PLATFORMS: { key: PlatformKey; label: string; varName: string }[] = [
  { key: "meta", label: "Meta Ads", varName: "--plat-meta" },
  { key: "google", label: "Google Ads", varName: "--plat-google" },
  { key: "linkedin", label: "LinkedIn Ads", varName: "--plat-linkedin" },
  { key: "tiktok", label: "TikTok Ads", varName: "--plat-tiktok" }, // nueva
];
```

Y agregá la clave al estado inicial `enabled`:
```ts
const [enabled, setEnabled] = useState<Record<PlatformKey, boolean>>({
  meta: true, google: true, linkedin: true, tiktok: true,
});
```

Con esto ya aparece el chip de filtro, la fila en la tabla densa (si algún cliente tiene datos para esa plataforma) y entra en los cálculos agregados (`platformTotals`, `totalBudgetEnabled`, etc.) sin tocar nada más — esos cálculos ya iteran sobre `PLATFORMS` genéricamente.

## 4. Agregar datos (mock o reales) por cliente

En [`lib/mockData.ts`](../../lib/mockData.ts), cada cliente necesita:
- Un `%` en `mix` para la nueva plataforma — **rebalanceá el resto de los porcentajes del mismo cliente para que sigan sumando 100** (si no, los cálculos de presupuesto agregado quedan mal, contando de más).
- Una entrada en `cpl` con `target`/`real` (y `prevPeriodDeltaPct` si vas a mostrar la columna de comparación).

```ts
mix: { meta: 40, google: 36, linkedin: 14, tiktok: 10 }, // rebalanceado, suma 100
cpl: {
  // ...las que ya tenía...
  tiktok: { target: 700, real: 750, prevPeriodDeltaPct: 5 },
},
```

## 5. Verificar antes de pushear

```bash
npm run build
```

Si compila sin errores de tipos, TypeScript ya validó que todas las referencias a la nueva clave de `PlatformKey` son consistentes. Corré `npm run dev` y confirmá visualmente:
- El chip de la plataforma aparece con su color propio y su cifra de gasto/presupuesto.
- Las filas correspondientes aparecen en la tabla densa.
- Sumar/restar esa plataforma del filtro cambia los totales agregados.

## Si la plataforma va a traer datos reales (no mock)

Esto solo cubre agregar la plataforma al **modelo de datos y la UI**. Conectarla a una fuente real es un trabajo aparte — ver [Conectar Google Ads](./conectar-google-ads.md) como ejemplo del patrón (variables de entorno, fallback a mock, no romper el dashboard si falla), y [Decisión de arquitectura de datos](../explanation/arquitectura-de-datos.md) para el plan general de ingesta vía Windsor.ai.
