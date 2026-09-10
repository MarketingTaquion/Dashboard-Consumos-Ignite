# API — `GET /api/spend`

Única ruta de API del proyecto. Devuelve el dataset completo que consume `Dashboard.tsx`. Sin parámetros de query — siempre devuelve el estado completo, el filtrado (por cliente/plataforma) ocurre client-side.

`export const dynamic = "force-dynamic"` — nunca se cachea, cada request recalcula.

## Respuesta

Tipo `SpendResponse` (definido en [`lib/types.ts`](../../lib/types.ts)):

| Campo | Tipo | Descripción |
|---|---|---|
| `source` | `"mock" \| "google-ads" \| "windsor"` | De dónde salieron los datos. `"windsor"` si `hasWindsorCredentials()` devuelve `true` (prioridad); si no, `"google-ads"` si `hasGoogleAdsCredentials()` devuelve `true`; si no, `"mock"`. También cae a `"mock"` si la consulta real que corresponda falló. |
| `today` | `number` | Día del mes usado como corte "hoy". En mock siempre `8`; con datos reales (Windsor o Google Ads directo), `now.getDate()`. |
| `daysInMonth` | `number` | Días totales del mes en curso. En mock siempre `30`. |
| `clients` | `ClientData[]` | Ver abajo. |
| `warnings` | `string[]` \| `undefined` | Presente solo si algo falló parcialmente (ej. Google Ads no respondió para un cliente puntual) — la respuesta sigue siendo 200 igual, el fallback ya ocurrió server-side. |

### `ClientData`

| Campo | Tipo | Descripción |
|---|---|---|
| `key` | `string` | Identificador interno (`"norte"`, `"andes"`, etc.) |
| `name` | `string` | Nombre para mostrar |
| `vertical` | `string` | Industria/vertical del cliente |
| `budget` | `number` | Presupuesto mensual, en ARS |
| `spend8` | `number` | Invertido acumulado a la fecha de corte (`today`), en ARS. El nombre es historico (viene de cuando `today` era siempre 8) — representa "spend to date", no literalmente "día 8". |
| `mix` | `Partial<Record<PlatformKey, number>>` | % de allocation por plataforma. Debería sumar ~100 entre las plataformas presentes. |
| `cpl` | `Partial<Record<PlatformKey, PlatformCpl>>` | Costo por resultado, por plataforma — ver abajo. |
| `health` | `HealthIssue[]` | Alertas técnicas activas para ese cliente. |

### `PlatformCpl`

| Campo | Tipo | Descripción |
|---|---|---|
| `target` | `number` | CPL/CPME objetivo (del media plan) |
| `real` | `number` | CPL/CPME real |
| `label` | `string?` | Por defecto se asume "CPL"; usar `"CPME"` para clientes de comunidad (costo por miembro efectivo, no por lead) |
| `prevPeriodDeltaPct` | `number?` | % de cambio del pacing vs. el período anterior. Ilustrativo — no hay histórico real conectado todavía (ver [estado y limitaciones](../explanation/estado-y-limitaciones.md)). |

### `HealthIssue`

| Campo | Tipo | Descripción |
|---|---|---|
| `platform` | `string` | Plataforma afectada |
| `text` | `string` | Descripción del problema |
| `sev` | `"warning" \| "serious" \| "critical"` | Severidad — determina el color de la franja en el panel de alertas |

## Ejemplo de respuesta (mock)

```json
{
  "source": "mock",
  "today": 8,
  "daysInMonth": 30,
  "clients": [
    {
      "key": "norte",
      "name": "Norte Fintech",
      "vertical": "Banca & Fintech",
      "budget": 18000000,
      "spend8": 6100000,
      "mix": { "meta": 40, "google": 36, "linkedin": 14, "tiktok": 10 },
      "cpl": {
        "meta": { "target": 850, "real": 910, "prevPeriodDeltaPct": 18 }
      },
      "health": [
        { "platform": "linkedin", "text": "Insight Tag sin eventos hace 4 días", "sev": "serious" }
      ]
    }
  ]
}
```

## Comportamiento de fallback

`GET /api/spend` **nunca devuelve un error al cliente** por falta o falla de credenciales — ver la lógica completa en [`app/api/spend/route.ts`](../../app/api/spend/route.ts):

1. Si `hasWindsorCredentials()` es `true` → intenta Windsor.ai (`lib/windsor.ts`). Si tira una excepción no controlada, cae a mock completo con un `warnings` explicando el error.
2. Si no, y `hasGoogleAdsCredentials()` es `true` → intenta Google Ads directo (`lib/googleAds.ts`), con el mismo fallback a mock ante excepción no controlada.
3. Si ninguna de las dos tiene credenciales → devuelve mock directamente.
4. Dentro de una consulta que sí funciona, si falla para un cliente puntual (sin mapeo, cuenta no encontrada, etc.) → ese cliente devuelve su valor mock, el resto sigue siendo real, y se agrega un warning por cliente afectado.
