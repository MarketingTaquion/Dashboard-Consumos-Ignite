# Tokens de diseño

Identidad: **Taquion 2026 Design System** (paquete completo en `SDD-TAQUION/Taquion 2026 Design System/`, hermano de este repo). Todos los estilos viven en [`app/globals.css`](../../app/globals.css) como CSS custom properties, con **3 bloques que definen el mismo set de variables**: `:root` (modo claro, default), `@media (prefers-color-scheme: dark)` (modo oscuro automático, según el SO), y `:root[data-theme="dark"]` (toggle manual de la app, si existiera). **Al agregar o cambiar un token, actualizá los 3 bloques** — un token definido en uno solo se "cae" a su valor por defecto en los otros modos sin avisar.

## Excepción funcional (leer antes de tocar colores)

La marca Taquion define **solo 3 acentos** (fucsia, naranja, azul) sobre negro/blanco/grises, y su regla de datos es "una serie protagonista, el resto desaturado, nunca colores para diferenciar categorías, sin leyenda". Este dashboard necesita **4 colores de plataforma simultáneos** (Meta/Google/LinkedIn/TikTok) **+ un semáforo de pacing** (bueno/alerta/crítico) que la marca no define en absoluto.

**Decisión (confirmada 2026-09-09):** `--plat-*` y `--status-*` quedan como una **excepción funcional documentada**, fuera de la paleta de marca — porque son información operativa para Ignite, no decoración. Todo lo demás (tipografía, fondos, bordes, radios, sombras, botones, labels) sigue el DS al pie de la letra.

## Colores base (Taquion)

| Token | Uso | Claro | Oscuro |
|---|---|---|---|
| `--bg` | Fondo de página | `#f5f5f6` (gris-050) | `#000000` (negro puro) |
| `--surface` | Fondo de tarjetas/cards | `#ffffff` | `#141414` (panel de "Tablero", spec de marca) |
| `--surface-2` | Fondo secundario (filas alternadas, hover) | `#ebebed` (gris-100) | `#1f1f1f` |
| `--border` / `--border-strong` | Bordes sutiles / marcados | `rgba(0,0,0,.12)` / `.22` | `rgba(255,255,255,.08)` / `.18` |
| `--text-primary` / `--text-secondary` / `--text-muted` | Jerarquía de texto | `#000000` / `#2d2d2d` / `#666666` | `#ffffff` / `rgba(255,255,255,.72)` / `rgba(255,255,255,.45)` |
| `--accent` | Acento operativo — fucsia de marca | `#ff00b8` | `#ff00b8` |
| `--accent-fill` | Relleno translúcido del acento (área del gráfico) | `rgba(255,0,184,.12)` | `rgba(255,0,184,.2)` |

Naranja (`#ffa900`) y azul (`#0026ff`) de marca quedan disponibles para usos puntuales (links, énfasis secundario) pero no están cableados como tokens propios todavía.

## Colores por plataforma (categóricos) — excepción funcional

**Orden fijo, no se reordenan ni se generan dinámicamente.** Cada plataforma tiene su propio color, consistente en toda la app (chips, dots de tabla, líneas de gráfico). Elegidos para no colisionar con fucsia/naranja de marca:

| Token | Plataforma | Claro | Oscuro |
|---|---|---|---|
| `--plat-meta` | Meta Ads | `#2a78d6` (azul) | `#3987e5` |
| `--plat-google` | Google Ads | `#eb6834` (naranja quemado) | `#f07a44` |
| `--plat-linkedin` | LinkedIn Ads | `#1baf7a` (verde azulado) | `#22c48a` |
| `--plat-tiktok` | TikTok Ads | `#eda100` (ámbar) | `#f2b32e` |

Ver [cómo agregar una plataforma](../how-to/agregar-una-plataforma.md) para el procedimiento completo al sumar una nueva.

## Colores de estado (semánticos) — excepción funcional

Independientes de los colores de plataforma — nunca se reusan para identificar una plataforma, y viceversa. La marca Taquion no define semáforo; se mantiene uno convencional (verde/ámbar/rojo) por legibilidad:

| Token | Significado | Valor |
|---|---|---|
| `--status-good` | En ritmo / sin problemas | `#0ca30c` |
| `--status-warning` | Sobre-ritmo / atención | `#fab219` |
| `--status-serious` | Alerta técnica seria | `#ec835a` |
| `--status-critical` | Bajo-ritmo / crítico | `#d03b3b` |
| `--delta-good-text` / `--delta-bad-text` | Texto de deltas (Δ, comparaciones) | `#006300` / `#b7291c` (claro), `#33d17a` / `#ff6b6b` (oscuro) |

## Tipografía

**Una sola familia, como manda el DS: Archivo.** Reemplaza el placeholder anterior (Archivo + IBM Plex Sans + IBM Plex Mono).

| Uso | Peso |
|---|---|
| Titulares (`h1`, `h2`, `h3`) | 900 (Archivo Black — regla de marca sin excepción) |
| Títulos de card (`.card h2`, 15px) | 700 — Black a ese tamaño lee mal; Bold mantiene la jerarquía |
| Texto de cuerpo, UI general | 400 / 500 |
| Números, cifras, fechas — clase utilitaria `.num` | 600, `font-variant-numeric: tabular-nums` (ya no hay familia monoespaciada aparte — el DS no define una) |
| Eyebrows (labels en mayúscula) | 700, color `var(--accent)` (fucsia) — "rótulos fucsia" de la referencia de Tablero del DS |

Cargada vía `@import` de Google Fonts (`Archivo:wght@400;500;600;700;900`) en la primera línea de `globals.css`.

## Forma

Radios alineados a `tokens/shape.css` del DS: `8px` en cards y menús (antes 16/10px), `4px` en inputs y el botón de fecha (antes 6px), `999px` solo en los chips/pills de filtro — excepción de UI deliberada, permitida por el DS "si el contexto lo exige". **Las cards no llevan sombra** (regla del DS: "la separación la da el contraste, no la elevación") — se apoyan solo en el borde hairline. `--shadow` quedó reservado para menús desplegables y tooltips.

## Marca

Isotipo Taquion en `public/brand/taquion-isotipo.png` (copiado de `assets/logo/isotipo-negro.png` del DS), en el header junto al título y como favicon. Se invierte a blanco en modo oscuro (`filter: invert(1)`) en vez de cargar un segundo archivo.

Sin emojis en ningún lado (regla de marca: "cero, en ningún soporte"). Donde antes había 🔥/✅/⚠️/📅 ahora hay texto plano o la flecha `↘` (`.tq-arrow`) — el signo de categoría del sistema, coloreado según el estado (`var(--accent)`, `var(--status-good)`, `var(--status-warning)`).

## Componentes reutilizables (clases, no tokens)

No son variables CSS pero son el vocabulario visual del proyecto — reusalos en vez de escribir estilos nuevos ad-hoc:

| Clase | Para qué |
|---|---|
| `.chip` / `.chip.plat` / `.chip[aria-pressed="true"]` | Botones tipo pill (filtros, dropdown de fecha, selector de orden en Anuncios) |
| `.pill.good` / `.pill.warning` / `.pill.critical` | Badges de estado con dot + texto |
| `.stat-chip` | Chip no interactivo para mostrar un total (Total Presupuesto, Total Gastado) |
| `.toggle-chip` (con `.toggle-track` / `.toggle-knob` adentro) | Switch real de un filtro on/off — usado por "Solo con actividad" en Finanzas, Campañas y Anuncios (`aria-pressed` en el botón controla el estado del knob vía CSS) |
| `.op-layout` / `.sidebar` / `.client-list` / `.client-row` | Layout de 2 columnas con barra lateral de selección (clientes en Finanzas, cuentas en Campañas/Anuncios) — colapsa a una columna en pantallas angostas |
| `.card` | Contenedor base (fondo, borde, radio — sin sombra) |
| `.tq-arrow` | Flecha `↘` de categoría/estado, reemplazo de emoji |
| `table.datatable` / `table.dense` | Tablas — `.dense` agrega cursor de orden en headers `.sortable` y zebra striping |
| `tr.campaign-subrow` | Fila anidada de desglose por campaña, debajo de una cuenta (Finanzas) — siempre visible, sin botón de expandir |
| `.ad-grid` / `.ad-card` / `.ad-campaign-group` | Grilla de tarjetas de Anuncios, agrupadas por campaña |
