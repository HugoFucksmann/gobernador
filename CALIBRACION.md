# Calibración y pruebas (BORRADOR v0.1)

> Doc para el agente de prototipo. Reúne todo lo que se ajusta probando o simulando: valores iniciales, criterios de arranque de los mundos y plan de pruebas. Las reglas y la intención están en ESTADOS.md, GOBERNADOR.md, UI.md e IDEA_JUEGO.md. Todos los valores de acá son **iniciales**: los números de las tablas salen de los ejemplos de los docs de diseño y se esperan cambiar.

---

## 1. Para qué existe este doc y cómo se usa

**Regla de separación.** Va acá todo lo que se ajusta probando: constantes, coeficientes, umbrales, topes, plazos, tamaños y valores iniciales de los mundos. Se queda en los docs de diseño lo que es una **regla** (qué hace algo y de qué depende) y las decisiones de diseño que no se afinan (cuáles son los roles, cómo se cruzan los sistemas, qué ve el jugador).

**Por qué separado.** Estos valores cambian en cada ronda de pruebas y los maneja el agente de prototipo. Si vivieran en los docs de diseño se desfasarían del código. Los docs de diseño nombran cada parámetro y no dan su valor.

**Quién manda sobre qué.**
- Los valores: este doc y los presets (`presets/*.json`). Si difieren, el preset es el que se ejecuta y este doc se actualiza.
- Las reglas: los docs de diseño. El agente de prototipo **no cambia reglas**: si una prueba muestra que una regla no se puede balancear o se contradice con otra, lo registra en la sección 7 como hallazgo para diseño.
- El agente de prototipo cambia valores libremente. Cada cambio se registra en el informe de calibración del escenario (valor anterior, valor nuevo, por qué y qué prueba lo respalda).
- Cualquier valor distinto del preset en una partida se marca como "configuración de prueba" (IDEA §5).

## 2. Valores iniciales por área

### 2.1 Tiempo

| Parámetro | Valor inicial | Usado en |
|---|---|---|
| Duración del día de juego a x1 | 20 s reales | ESTADOS §5 |
| Ticks por día | 120 (1 tick ≈ 0,17 s a x1) | ESTADOS §5 |
| Velocidades | pausa, x1, x2 (más altas solo en modo desarrollador) | ESTADOS §5, UI §16 |
| `periodo_fiscal_dias` | 7 | ESTADOS §3.1 |

Con esto, 365 días de elecciones son unas 2 horas reales a x1 y 180 días de zombies, una hora.

### 2.2 Roles y economía

| Parámetro | Valor inicial | Usado en |
|---|---|---|
| `ingreso` por día [min, max] | agricultor [18, 28], obrero [20, 30], comerciante [24, 38], técnico [30, 44], periodista [20, 30] | ESTADOS §2, §12 |
| Producción de alimento por agricultor | 5,4 (con productividad típica ~0,65, 30 agricultores cubren el consumo de 100 NPCs) | ESTADOS §2 |
| `salario_base_publico` | 9 (puede quedar por debajo del ingreso privado) | ESTADOS §2 |
| `pension_base` | 8 | ESTADOS §2 |
| `empleados_por_comerciante` | 4 | ESTADOS §2 |
| `tope_privado[rol]` (ejemplo 100 NPCs) | agricultor 30, obrero 14, técnico 3, comerciante 4, periodista 3 | ESTADOS §2 |
| Composición inicial de ejemplo (100 NPCs) | estudiante 12, agricultor 30, obrero 14, técnico 3, policía 5, estatal 4, comerciante 4, docente 4, periodista 3, médico 5, ingeniero 3, desempleado 3, jubilado 10 | ESTADOS §10 |
| Coeficientes de `simple` (`coef_subsidio`, `coef_impuesto`, `k_salario`) | sin valor: calibrar | ESTADOS §3.1 |
| Factor fiscal | 1 hasta una tasa de 40 %, y baja 0,01 por cada punto por encima | ESTADOS §12 |
| `ingresos_propios` de cada medio | constante por medio (a definir) | ESTADOS §6 |

### 2.3 Alimento

| Parámetro | Valor inicial | Usado en |
|---|---|---|
| `consumo_por_npc` | 1 | ESTADOS §4 |
| `precio_base` | 1,0 | ESTADOS §4 |
| `silo_dias` | 25 | ESTADOS §4 |
| Stock inicial | unos 15 días de consumo (ej. 1.500) | ESTADOS §4, §13 |
| `k_hambre` (recorte de ración) | sin valor: calibrar | ESTADOS §12 |
| Compra más cara que venta | 30 % | ESTADOS §12 |
| Factor de sequía y plaga sobre el precio externo | sin valor: calibrar | ESTADOS §12 |

### 2.4 Clima y fenómenos

| Tipo | `exposicion_max` | `dano` (salud) | `atenuacion` |
|---|---|---|---|
| `plaga_zombie` | 1,0 | 20 a 50 | 0,7 |
| `pandemia` | 0,25 | 10 a 35 | sin `origen` |

| Parámetro | Valor inicial | Usado en |
|---|---|---|
| `proteccion_max` | 0,9 | ESTADOS §5 |
| Preset zombies | plaga con intensidad inicial 10 y `crecimiento_dia` 0,5 (llega a 100 en el día 180) | ESTADOS §5 |
| Hordas | fenómenos cortos de intensidad alta, con su `origen` y `aviso_dias` (sin valores) | ESTADOS §5 |
| `aviso_dias` | 0 por defecto, valor del preset por fenómeno | ESTADOS §5 |

### 2.5 Acciones, caos y contagio

| Parámetro | Valor inicial | Usado en |
|---|---|---|
| `max_acciones_por_periodo` (focos) | 3 | ESTADOS §9 |
| `periodo_dias` | 5 | ESTADOS §9 |
| `max_pct_rol_fuera_de_puesto` | 20 | ESTADOS §9 |
| `duracion_max_dias` | 10 | ESTADOS §9 |
| `respiro_si_satisfaccion_media_menor_a` | 35 | ESTADOS §9 |
| Candidatas ofrecidas por decisión | 8 a 12 | ESTADOS §9 |
| Cantidad de NPCs a los que se ofrece una acción por período | "unos pocos" (sin valor) | ESTADOS §9 |
| Disparador de `protesta` | `descontentos_pct` > 30 | ESTADOS §7 |
| Disparador de `saqueo` | `hambre_critica_pct` > 20 | ESTADOS §7 |
| `duracion_dias` de las acciones | cavar un pozo [3, 8], huelga [3, 10] (el resto, a definir) | ESTADOS §7 |
| `contagio` de las acciones | cavar un pozo 0,05, predicar 0,3, huelga 0,2 | ESTADOS §7 |
| Intensidades `baja`, `media`, `alta` de cada efecto | sin valores: definir por efecto | ESTADOS §7.1 |
| Susceptibilidad según `afinidad` | sin valor: calibrar | ESTADOS §7.2 |
| `k_orden`, `k_satisfaccion` | 0,5 y 0,3 | ESTADOS §14 |
| Tope propio de `acapara` | a definir | ESTADOS §7.1 |

### 2.6 IA opcional

| Parámetro | Valor inicial | Usado en |
|---|---|---|
| Plazo de una acción de condición | 30 s reales | ESTADOS §7, §9 |
| Descarte de un resultado atrasado | 5 días de juego | ESTADOS §9 |
| Latencia de referencia del clasificador | unos 150 ms (d3 2B) | ESTADOS §9 |
| Tope de VRAM entre IA y render | 6 GB (d3 2B cargado: unos 3,6 GB) | UI §12 |
| Sorteo según las probabilidades del clasificador | sin valor: calibrar cuánto se inclina (por ejemplo con una temperatura) | ESTADOS §9 |

**Propuesta para probar (no decidida):** unificar los plazos. Decisiones de acción (espontáneas y de condición): esperar al clasificador unos 2 s reales y, si no llega, decide el motor. Textos de noticias: el generativo tiene hasta el final del día de juego siguiente y, si no llega, sale la plantilla. Sin descarte de 5 días. Se evalúa contra los valores actuales.

### 2.7 Servicios y salud

| Parámetro | Valor inicial | Usado en |
|---|---|---|
| Profesionales objetivo (% de la población) | médicos 5, policías 5 (en zombies 15), docentes 4, estatales 4, comerciantes 4, ingenieros 3 | ESTADOS §12 |
| Pérdida máxima por falta de estatales | 30 % | ESTADOS §12 |
| Cobertura baja (recargo de miedo o malestar) | por debajo de 0,60, proporcional a (0,60 − cobertura) | ESTADOS §12 |
| Daño por hambre crítica | −2 por día con hambre > 80 | ESTADOS §12 |
| `umbral_hospital` | 60 | ESTADOS §12 |
| `pacientes_por_medico` | 3 | ESTADOS §12 |
| `cura_base` | 15 por día | ESTADOS §12 |
| `alta` | salud ≥ 90 | ESTADOS §12 |
| `cura_natural` | 0,5 por día, si el hambre es menor a 50 | ESTADOS §12 |

### 2.8 Zonas, defensa y orden

| Parámetro | Valor inicial | Usado en |
|---|---|---|
| `movilidad_defensa` (c) | 0,4 | ESTADOS §14 |
| `k_integridad` | 0,5 | ESTADOS §14 |
| `dano_integridad` | 1 por golpe | ESTADOS §14 |
| `rep_por_npc` | 0,3 por día | ESTADOS §14 |
| Reubicación de policías | 20 % por día | ESTADOS §14 |
| Amenaza por golpes recientes | min(100, 20 × golpes en los últimos 5 días) | ESTADOS §14 |
| Necesidad de orden | min(100, % de acciones espontáneas en curso + % de descontentos de la zona) | ESTADOS §14 |
| `min_reparto` | 20 % | ESTADOS §14 |
| `objetivo_orden` | 0,05 (un policía cada 20 habitantes) | ESTADOS §14 |

### 2.9 Objetivo e interfaz

| Parámetro | Valor inicial | Usado en |
|---|---|---|
| Cambio de color del indicador de derrota | al recorrer el 70 % de la distancia entre su valor inicial y su límite | ESTADOS §11 |
| Cámara (altura mínima y máxima, inclinación) | sin valores: calibrar probando | UI §6 |
| Perfiles de calidad (bajo, medio, alto): NPCs con modelo completo, distancia de cambio de detalle y calidad del clima | sin valores: calibrar con mediciones | UI §12 |
| Escala de NPCs | arranque en 100, techo de 1.000 (decidido); medir el rendimiento a 1.000 | UI §12 |

Los umbrales de victoria y derrota de cada escenario (ESTADOS §11) **no** se calibran: son parte del diseño del escenario. La calibración ajusta el mundo para que el objetivo sea alcanzable y desafiante.

### 2.10 Rangos de las palancas del gobernador

| Palanca | Rango |
|---|---|
| `impuesto` | 0 a 60 |
| `salario_publico` | 50 a 150 |
| `racion` | 50 a 150 |
| `garantia_alimentaria` | 0 a 100 |
| `intercambio` | −100 a 100 |
| `tope_emision` | 0 a 30 |
| `regulacion` | 0 a 100 |
| `presupuesto`, `subsidios`, `gasto_prensa`, `financiamiento` | 0 a 100 |
| `cupo_max_pct_poblacion` | 25 |
| `cambio_max_por_periodo_pct` | 20 |

## 3. Criterios de arranque de un mundo

Un mundo generado tiene que encajar al inicio y desajustarse después por el clima y el director de caos (IDEA §5). Criterios:

- Producción de alimento ≥ consumo × 1,05.
- Stock inicial de 15 a 20 días.
- Ingresos ≥ obligatorios × 1,10.
- Reserva ≥ 20 días de nómina.
- Ningún rol vacío.
- `lealtad` inicial heterogénea (centrada en ~54), y `apoyo_pct` inicial calculado del estado, no escrito a mano.
- El ingreso crece con la educación.
- El salario público base se calibra por escenario jugando, según su efecto sobre la satisfacción de los públicos y la nómina. No se fuerza a igualar el ingreso privado.

## 4. Plan de simulación y pruebas

**Modo de prueba.** Simulación sin interfaz y sin tope de velocidad, muchas partidas por semilla, con el director mecánico (no necesita IA). Cada tanda reporta: derrotas y en qué día, acciones dañinas, qué cadenas de causas ocurrieron de verdad, y la distribución de los indicadores clave.

**Propiedades que siempre deben cumplirse** (propuesta; son tests automáticos):
1. Sin caos ni fenómenos, un mundo recién generado no colapsa dentro del plazo del objetivo.
2. Nunca hay más focos que `max_acciones_por_periodo` por período, ni más gente fuera de su puesto que `max_pct_rol_fuera_de_puesto` por rol.
3. Todo contagiado termina junto con su foco, y toda acción tiene duración finita.
4. Si el caos se detiene, la comunidad se recupera sola.
5. La población solo baja por salud 0.
6. Todo evento con efecto tiene `origen`, y su cadena de `causa` se puede seguir hasta 5 pasos.
7. Cada palanca respeta su rango y su margen de cambio por período.
8. Sin IA, la misma semilla da la misma partida. Con el clasificador, la misma semilla más el registro de decisiones da la misma partida sin llamar al modelo.
9. Las consecuencias del impago, el hambre y la miseria ocurren aunque la IA no responda.
10. Reserva, stock y variables acotadas a sus rangos nunca salen de ellos.

**Cadenas esperadas.** Además de las propiedades, se miden las cadenas que el diseño dice que pasan (por ejemplo sequía → precio → hambre → protesta, o nómina impaga → huelga → servicios caen) y se registra con qué frecuencia ocurren. Si una cadena prometida nunca ocurre, o una sola domina todas las partidas, va a la sección 7.

**Evaluación del clasificador (IA opcional).**
- Set de casos propios (estado del NPC → acción esperable) y comparación contra la línea de base mecánica: qué elige distinto y si las partidas con el clasificador terminan mejor o peor.
- Cada candidata se describe de forma clara y distinta y el orden se mezcla en cada consulta.
- Medir cuánto del total resuelve el motor porque el clasificador no responde a tiempo. Referencia anterior: menos del 10 % de las acciones de condición a x1.
- Medir el sorteo: más variedad sin romper los límites del caos.

**Textos y noticias.** Cuántas variantes mínimas por acción y por tema y tono hacen falta para que no se repitan. Cómo se valida que el texto generativo no contradiga los datos de la noticia.

**Memoria y rendimiento.** Medir con los modelos reales si el clasificador y el generativo entran juntos en el tope de VRAM, y si no, cuál tiene prioridad o cómo se alternan. Medir el rendimiento con 1.000 NPCs.

## 5. Pendientes de calibración

- **Elecciones, zombies, módulos `individual` y `fiscal`:** el estado y los pendientes de cada ronda viven en el informe de calibración de cada escenario.
- **Salud individual:** calibrar exposición, daño, camas y cura con el mismo método que elecciones.
- **Zonas y defensa:** calibrar `movilidad_defensa`, `atenuacion`, el % de reubicación, la amenaza percibida y la integridad (`dano_integridad`, `k_integridad`, `rep_por_npc`) junto con zombies.
- **Contagio y orden:** calibrar la contagiosidad por acción, la susceptibilidad según `afinidad`, la necesidad de orden, `min_reparto`, `objetivo_orden`, `k_orden` y `k_satisfaccion`, y el efecto del reparto sobre la `defensa`.
- **Efectos:** definir las intensidades `baja`, `media` y `alta` de cada efecto del catálogo, y si `acapara` necesita un tope propio.
- **Plazos de la IA:** decidir con pruebas entre los valores actuales y la propuesta de la sección 2.6.

## 6. Informe de calibración

El historial de rondas de cada escenario (qué se probó, qué se cambió y qué resultó) sigue siendo un informe aparte por escenario. Este doc guarda solo los valores vigentes y los criterios.

## 7. Hallazgos para diseño

Lista que llena el agente de prototipo cuando una prueba muestra un problema que no se arregla con valores: una regla que no se puede balancear, dos reglas que se contradicen, una cadena prometida que nunca ocurre, o un sistema que domina todos los resultados. Cada hallazgo lleva: qué se observó, con qué prueba y qué regla del diseño está involucrada. Los resuelve el autor del juego, no el agente.

(Vacía por ahora.)
