# Actores y demandas (v0.1)

> Actores del mundo que presionan al gobernador con demandas de una tabla cerrada. Funcionan sin IA y todo queda explicable. Capa del gobernador: las demandas piden palancas (GOBERNADOR §2) y sus consecuencias usan medidas del mundo (CONTROLES §3). Valores: CALIBRACION.md. Toda la tabla es **[propuesta]**.

---

## 1. Cómo funciona

- **Actor:** tiene un **interés** (lo que quiere), un **recurso** (con qué presiona) y una **amenaza** (lo que hace si no lo atienden).
- **Demanda:** cuando se cumple su disparador, el actor pide un cambio concreto de palanca, con un **plazo** en días (`dias_respuesta_demanda`). El juego no se pausa.
- **Aceptar:** la palanca pasa al valor pedido y queda bloqueada `dias_compromiso` días. El actor queda conforme: no vuelve a pedir lo mismo por un tiempo.
- **Rechazar** (o dejar vencer el plazo): el actor aplica su medida (sección 3). Es un hecho más del mundo, con causa en la demanda.
- **Ritmo:** una demanda activa por actor, como máximo; entre dos demandas del mismo actor pasan al menos `dias_entre_demandas`.
- **Explicable:** la demanda tiene como causa el evento que la disparó (un cambio de control, un indicador); la medida tiene como causa la demanda rechazada. "El empresario retuvo stock porque subiste el impuesto" sale de seguir la cadena.

## 2. Actores del nivel 1

| Actor | Interés | Recurso | Amenaza |
|---|---|---|---|
| **Empresarios** (dueños de alimento y comercio) | Su ganancia | La comida y el empleo | Retener stock, despedir, no invertir |
| **Cada medio** | Sus fondos y su audiencia | Lo que publica | Una campaña con un tono fijo |

## 3. Demandas

| Id | Actor | Disparador | Pide | Si se rechaza |
|---|---|---|---|---|
| `bajen_impuestos` | Empresarios | Factor < 1 en alguna empresa durante 2 períodos, o `impuesto` sobre `umbral_impuesto_demanda` | Bajar `impuesto` un paso | `despido_forzado`: la empresa con peor factor despide `despidos_medida` |
| `liberen_precio` | Empresarios | `precio_maximo` moderado o estricto y factor de alimento < 1 | `precio_maximo` un modo más libre | `retencion_stock` en alimento por `dias_medida` (ECONOMIA §6) |
| `abran_exportacion` | Empresarios | Stock cerca del tope del silo y `comercio_exterior` en cerrado o importando | Pasar a exportar | `sin_inversion`: no construyen locales ni campos por `dias_medida` |
| `mas_pauta` | Un medio | Su dependencia bajo `umbral_pauta` y una noticia mala reciente para el gobierno | Subir `prensa` un paso | `campana`: tono crítico sobre el gobierno por `dias_medida` |
| `silencio_pagado` | Un medio con afinidad alta | `hambre_critica_pct` sobre su umbral de noticia | Subir `prensa` un paso a cambio de tono favorable | `campana`: tono alarmista sobre el hambre por `dias_medida` |

- "Un paso" es el siguiente valor de la palanca (un modo, un escalón o el salto fijo de CALIBRACION).
- Si la palanca está bloqueada por otra demanda aceptada, la demanda no se dispara.
- `silencio_pagado` aceptada fuerza el tono favorable sobre el hambre por `dias_compromiso`: es pagar por propaganda, y cuenta como dependencia del medio.

## 4. Fuera del nivel 1

Responder con condiciones (contraofertas), más actores (sindicatos de públicos, vecinos de una zona), relación acumulada con cada actor y demandas generadas por la IA.