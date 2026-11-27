# Docs del juego

Un doc por tema, sin versiones: cada uno es autocontenido y es la única fuente de verdad de lo que describe. El historial está en git.

## Orden de lectura

| Capa | Doc | Qué tiene |
|---|---|---|
| **Mundo** | [MUNDO](MUNDO.md) | Personas, hogares, casas, ciclo de vida, salud, roles, zonas, clima, servicios, seguridad, comunidad, niveles M0-M4 |
| | [MAPA](MAPA.md) | Grilla de baldosas, terreno por semilla, lotes, zonas y red de rutas |
| | [ECONOMIA](ECONOMIA.md) | Hogares, firmas, propiedad, comida, vivienda, mercado, estado, comercio exterior, `fiscal` |
| | [EDIFICIOS](EDIFICIOS.md) | Catálogo de lotes, casas, públicos, vías, privados y obras de suceso |
| | [CAOS_PRENSA](CAOS_PRENSA.md) | Director de caos, efectos, medios, noticias e IA opcional |
| | [ACCIONES](ACCIONES.md) | Tabla de acciones espontáneas y de condición |
| **Contrato** | [CONTROLES](CONTROLES.md) | Controles, órdenes, medidas, indicadores y eventos entre el mundo y el gobernador |
| | [MOTOR](MOTOR.md) | Tiempo, orden de cálculo, determinismo, guardado, escala, agenda, IA (infraestructura) |
| | [LECTURA](LECTURA.md) | Capa derivada de solo lectura: indicadores de vistazo, alertas, series, informe, notables |
| **Gobernador** | [GOBERNADOR](GOBERNADOR.md) | Palancas, construir, hitos, objetivo y derrota, niveles G0-G4 |
| | [ACTORES](ACTORES.md) | Demandas y medidas de los actores |
| | [ESCENARIOS](ESCENARIOS.md) | Presets: Elecciones y Apocalipsis zombie |
| **UI** | [UI_PROTOTIPO_MUNDO](UI_PROTOTIPO_MUNDO.md) | UI 2D de observación (etapa actual) |
| | [UI](UI.md) | UI final en Godot 3D |
| **Trabajo** | [ALCANCE_ETAPA_MUNDO](ALCANCE_ETAPA_MUNDO.md) | Orden de trabajo de la etapa actual (mundo sin gobernador) |
| | [ALCANCE_VERSION_JUGABLE](ALCANCE_VERSION_JUGABLE.md) | Orden de trabajo de la primera versión jugable (G1, luego G2) y complejidad de cada pieza |
| | [PALANCAS_MINIMAS](PALANCAS_MINIMAS.md) | Insumo para el rediseño final de las palancas |

## Convenciones

- **Referencias:** `DOC §n` (por ejemplo `MUNDO §9`). Un doc no repite lo que otro define: lo cita.
- **Parámetros:** los valores son nombres con formato `parametro_en_codigo`. Su lista, significado y valores iniciales están en `PARAMETROS.md`, que mantiene el agente de código; los docs no fijan números salvo ejemplos. Los parámetros nuevos de estos docs (`personas_por_zona`, `reserva_min_dias`, `reserva_max_dias`, `tasa_min_auto`, `tasa_max_auto`, `periodos_ajuste_fiscal`, `pct_mant_max`, `n_constructoras_inicial`, `k_obra_directa`, `k_dias_obra_directa`, `umbral_obra_sin_capacidad`, `periodos_obra_sin_capacidad`) también van ahí. Los de la segunda revisión (radios y cobertura de servicios, estabilidad y colapso, contagio y rarezas, favor y extorsión) están en `PARAMETROS.md §15`. El documento incluye además qué contradicciones quedaron resueltas (§13) y qué falta (§14).
- **[propuesta]:** regla a pulir. Lo demás está decidido.
- **Capa del gobernador** (GOBERNADOR, ACTORES, ESCENARIOS, UI): alineada con el mundo, pendiente de rediseño de palancas.
