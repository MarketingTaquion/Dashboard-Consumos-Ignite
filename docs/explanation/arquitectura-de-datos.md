# Por qué esta arquitectura de datos (y no Segment/BigQuery)

## El problema que se evaluó resolver

El dashboard necesita (a) traer datos reales de plataformas publicitarias, (b) guardarlos con histórico, y (c) eventualmente dar acceso a usuarios cliente además del equipo interno de Ignite. Se evaluó usar Segment y/o BigQuery para esto, con la idea de un "centro de datos" estilo Customer.io.

## Por qué esas herramientas no encajaban

Segment, BigQuery y Customer.io resuelven problemas **distintos entre sí y distintos al de este proyecto**:

- **Segment** es un CDP (Customer Data Platform) para eventos de comportamiento de producto/usuario (clicks, pageviews) — no para gasto publicitario de Meta/Google/TikTok.
- **BigQuery** es un data warehouse: almacenamiento + motor SQL. No "trae" datos por sí solo — necesita algo que lo alimente (de hecho, Windsor.ai puede exportar a BigQuery como destino, pero BigQuery en sí no reemplaza a un conector).
- **Customer.io** es marketing automation (mensajería basada en comportamiento) — otra categoría de producto completamente distinta a un dashboard de reporting.

Confundir estas categorías llevaba a intentar resolver 3 problemas separados (ingesta, almacenamiento, multiusuario) con herramientas pensadas para un cuarto problema distinto.

## La decisión: 3 capas independientes

| Capa | Pregunta que resuelve | Elegido |
|---|---|---|
| Ingesta | ¿Cómo traigo el gasto de Meta/Google/TikTok? | **Windsor.ai**, vía su API REST (`connectors.windsor.ai`, autenticación por API key simple — no OAuth) |
| Almacenamiento | ¿Dónde guardo histórico para consultar/cruzar? | **Supabase (Postgres)**, plan Free |
| Multiusuario | ¿Cómo hago que un admin de Taquión vea todo y un cliente vea solo lo suyo? | **Supabase Auth + Row Level Security**, mismo proyecto que el almacenamiento |

### Por qué Windsor.ai vía API REST y no MCP

El MCP (Model Context Protocol) de Windsor.ai le sirve a un asistente de IA para consultar datos en una conversación — no es una vía de acceso para una aplicación web en producción. La API REST, con autenticación por API key, es el mecanismo correcto para que el propio backend del dashboard traiga datos en cada request o job programado.

### Por qué no BigQuery, por ahora

BigQuery es un motor pensado para volúmenes grandes y analítica pesada. Para el volumen actual (2-3 fuentes conectadas, un puñado de clientes) es complejidad de más — proyecto de GCP, billing, IAM — sin necesidad real todavía. Se reconsideraría si Taquión escala a decenas o cientos de clientes con años de histórico que requieran cruces analíticos pesados.

### Por qué Supabase y no un stack separado de auth

Supabase resuelve almacenamiento (Postgres) y multiusuario (Auth + Row Level Security) **en un solo producto**. Para un equipo chico, evitar armar y mantener dos sistemas distintos (una base de datos por un lado, un proveedor de auth por otro) es una ganancia real de simplicidad operativa, no solo de costo.

## Prioridad confirmada

El panel **interno de Ignite es la prioridad inmediata**. La capa de multiusuario (admin de Taquión + usuario cliente) es una **fase 2** — no bloquea el trabajo actual. Hoy el dashboard sigue construyéndose para uso interno solamente, sin login.

## Estado de implementación

Ver [estado actual y limitaciones](./estado-y-limitaciones.md) para qué de este plan ya está hecho y qué sigue pendiente.
