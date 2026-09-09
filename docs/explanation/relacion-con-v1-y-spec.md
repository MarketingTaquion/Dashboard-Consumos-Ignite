# Relación con la V1 y el proceso de spec

Este proyecto (`pulso-ignite`, deployado como `Dashboard-Consumos-Ignite`) es la **segunda versión** de este dashboard, y forma parte de un proceso más amplio de spec-driven development que vive en un repo hermano, `SDD-TAQUION`.

## V1 — el mock

La primera versión fue un único archivo HTML estático (sin backend, sin build), publicado como Artifact, con datos hardcodeados. Sirvió para validar el diseño y los KPIs con el equipo de Ignite antes de invertir en una versión real con código de producción. Vive en `SDD-TAQUION/mockups/dashboard-consumos.html` (repo separado, no este).

## La spec de producto

`SDD-TAQUION/specs/003-dashboard-consumos.md` es el documento vivo de spec para este dashboard — contexto, requisitos, criterios de aceptación, decisiones de arquitectura, e historial de implementación versión por versión. Si estás por hacer un cambio de alcance grande (no un fix chico), **ese documento es la fuente de verdad de qué se decidió y por qué** — esta carpeta `docs/` documenta el código tal como es hoy, no el proceso de decisión que lo llevó ahí (eso vive en la spec).

<!-- TODO(humano): confirmar si `SDD-TAQUION` y este repo van a seguir viviendo como repos separados a largo plazo, o si en algún momento se consolidan — hoy son 2 repos de Git distintos sin ninguna referencia automática entre ambos más allá de estos links manuales. -->

## Por qué existen 2 repos separados

`SDD-TAQUION` es el espacio de trabajo del proceso de spec-driven development en general (incluye specs de otros temas, no solo este dashboard). `pulso-ignite` es el código de producción de un producto específico que nació de una de esas specs. Mantenerlos separados evita que el historial de commits de la app de producción se mezcle con el de documentos de planificación que cambian con otra cadencia.
