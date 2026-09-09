# Pulso Ignite (V2)

Dashboard interno de Taquión para monitorear consumo de pauta publicitaria multi-cliente (Meta Ads, Google Ads, LinkedIn Ads, TikTok Ads). Next.js + TypeScript, deployado en Vercel.

- **En producción:** https://dashboard-consumos-ignite.vercel.app
- **V1 (mock estático, sin backend):** [`SDD-TAQUION/mockups/dashboard-consumos.html`](../SDD-TAQUION/mockups/dashboard-consumos.html)
- **Spec de producto:** [`SDD-TAQUION/specs/003-dashboard-consumos.md`](../SDD-TAQUION/specs/003-dashboard-consumos.md)

## 📚 Documentación

La documentación completa vive en [`docs/`](./docs/index.md), organizada por lo que necesites en el momento:

- **[Tutoriales](./docs/tutorials/)** — levantar el proyecto por primera vez.
- **[Guías (How-To)](./docs/how-to/)** — conectar Google Ads, deployar a Vercel, agregar una plataforma nueva.
- **[Referencia](./docs/reference/)** — estructura del proyecto, API, variables de entorno, tokens de diseño.
- **[Explicación](./docs/explanation/)** — por qué la arquitectura de datos es así, por qué la UI es una tabla operativa densa, estado y limitaciones actuales.

## Quick start

```bash
npm install
npm run dev
```

Abrí `http://localhost:3000` — funciona con datos de ejemplo sin ninguna variable de entorno. Guía completa: [levantar el proyecto por primera vez](./docs/tutorials/getting-started.md).

## Qué falta (backlog conocido)

- Terminar de conectar Google Ads en Windsor.ai (login de Google pendiente del lado del usuario) y confirmar salud de TikTok Ads.
- Reemplazar `lib/googleAds.ts` (integración directa a Google Ads API) por una integración a la API REST de Windsor.ai.
- Crear proyecto Supabase (Free) y migrar el almacenamiento de "mock + intento en vivo" a "leer de Supabase".
- Mapeo real cliente↔cuenta — ver [estado y limitaciones](./docs/explanation/estado-y-limitaciones.md#todos-los-clientes-del-dashboard-son-ficticios).
- Persistencia/histórico real por día (hoy se estima con un patrón semanal genérico).
- Autenticación de acceso al dashboard (Supabase Auth — fase 2, no bloquea el trabajo actual).
- Tests automatizados — no hay ninguno todavía.
