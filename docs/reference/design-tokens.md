# Tokens de diseño

Todos los estilos viven en [`app/globals.css`](../../app/globals.css) como CSS custom properties, con **3 bloques que definen el mismo set de variables**: `:root` (modo claro, default), `@media (prefers-color-scheme: dark)` (modo oscuro automático, según el SO), y `:root[data-theme="dark"]` (toggle manual de la app, si existiera). **Al agregar o cambiar un token, actualizá los 3 bloques** — un token definido en uno solo se "cae" a su valor por defecto en los otros modos sin avisar (fue justamente el bug encontrado y corregido al escribir esta página: `--plat-tiktok` faltaba en el bloque de tema oscuro manual).

## Colores base

| Token | Uso | Claro | Oscuro |
|---|---|---|---|
| `--bg` | Fondo de página | `#f5f4fa` | `#100e17` |
| `--surface` | Fondo de tarjetas/cards | `#ffffff` | `#18151f` |
| `--surface-2` | Fondo secundario (filas alternadas, hover) | `#efedf6` | `#201d2b` |
| `--border` / `--border-strong` | Bordes sutiles / marcados | `rgba(22,18,31,.1)` / `.18` | `rgba(255,255,255,.1)` / `.18` |
| `--text-primary` / `--text-secondary` / `--text-muted` | Jerarquía de texto | `#16121f` / `#4d4860` / `#8b869c` | `#f6f4fb` / `#c3bdd6` / `#8d87a1` |
| `--accent` | Color de marca/acento (violeta) | `#4a3aa7` | `#9085e9` |
| `--accent-fill` | Relleno translúcido del acento (área del gráfico) | `rgba(74,58,167,.14)` | `rgba(144,133,233,.2)` |

## Colores por plataforma (categóricos)

**Orden fijo, no se reordenan ni se generan dinámicamente.** Cada plataforma tiene su propio color, consistente en toda la app (chips, dots de tabla, líneas de gráfico):

| Token | Plataforma | Claro | Oscuro |
|---|---|---|---|
| `--plat-meta` | Meta Ads | `#2a78d6` (azul) | `#3987e5` |
| `--plat-google` | Google Ads | `#eb6834` (naranja) | `#d95926` |
| `--plat-linkedin` | LinkedIn Ads | `#1baf7a` (verde azulado) | `#199e70` |
| `--plat-tiktok` | TikTok Ads | `#eda100` (ámbar) | `#c98500` |

Ver [cómo agregar una plataforma](../how-to/agregar-una-plataforma.md) para el procedimiento completo al sumar una nueva.

## Colores de estado (semánticos)

Independientes de los colores de plataforma — nunca se reusan para identificar una plataforma, y viceversa:

| Token | Significado | Valor |
|---|---|---|
| `--status-good` | En ritmo / sin problemas | `#0ca30c` |
| `--status-warning` | Sobre-ritmo / atención | `#fab219` |
| `--status-serious` | Alerta técnica seria | `#ec835a` |
| `--status-critical` | Bajo-ritmo / crítico | `#d03b3b` |
| `--delta-good-text` / `--delta-bad-text` | Texto de deltas (Δ, comparaciones) | `#006300` / `#b7291c` (claro) |

## Tipografía

Tres familias, cada una con un rol fijo (no se mezclan dentro del mismo tipo de contenido):

| Familia | Uso | Pesos cargados |
|---|---|---|
| Archivo | Títulos, eyebrows (labels en mayúscula) | 600, 700 |
| IBM Plex Sans | Texto de cuerpo, UI general | 400, 500, 600 |
| IBM Plex Mono | Números, cifras, fechas — clase utilitaria `.num` | 500, 600 |

Cargadas vía `@import` de Google Fonts en la primera línea de `globals.css`.

## Componentes reutilizables (clases, no tokens)

No son variables CSS pero son el vocabulario visual del proyecto — reusalos en vez de escribir estilos nuevos ad-hoc:

| Clase | Para qué |
|---|---|
| `.chip` / `.chip.plat` / `.chip[aria-pressed="true"]` | Botones tipo pill (filtros, dropdown de fecha) |
| `.pill.good` / `.pill.warning` / `.pill.critical` | Badges de estado con dot + texto |
| `.stat-chip` | Chip no interactivo para mostrar un total (Total Presupuesto, Total Gastado) |
| `.toggle-track` / `.toggle-knob` | Switch visual (aunque el control real de comparación hoy usa un `<input type="checkbox">` dentro del dropdown de fecha) |
| `.card` | Contenedor base (fondo, borde, sombra, radio) |
| `table.datatable` / `table.dense` | Tablas — `.dense` agrega cursor de orden en headers `.sortable` y zebra striping |
