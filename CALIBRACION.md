# Calibración y pruebas (BORRADOR v0.2)

> Doc para el agente de prototipo. Reúne todo lo que se ajusta probando o simulando: valores iniciales, criterios de arranque de los mundos y plan de pruebas. Las reglas y la intención están en ESTADOS.md (v0.39), GOBERNADOR.md (v0.25), EMPRESAS.md (v0.1), ACCIONES.md (v0.2), UI.md e IDEA_JUEGO.md. Los números vigentes están sincronizados con `src/data/catalogs.ts` y `presets/*.json`.

---

## 1. Para qué existe este doc y cómo se usa

**Regla de separación.** Va acá todo lo que se ajusta probando: constantes, coeficientes, umbrales, topes, plazos, tamaños y valores iniciales de los mundos. Se queda en los docs de diseño lo que es una **regla** (qué hace algo y de qué depende) y las decisiones de diseño que no se afinan (cuáles son los roles, cómo se cruzan los sistemas, qué ve el jugador).

**Por qué separado.** Estos valores cambian en cada ronda de pruebas y los maneja el agente de prototipo. Si vivieran en los docs de diseño se desfasarían del código. Los docs de diseño nombran cada parámetro y no dan su valor.

**Quién manda sobre qué.**
- Los valores: este doc y los presets (`presets/*.json`). Si difieren, el preset / `src/data/catalogs.ts` es el que se ejecuta y este doc se actualiza.
- Las reglas: los docs de diseño. El agente de prototipo **no cambia reglas**: si una prueba muestra que una regla no se puede balancear o se contradice con otra, lo registra en la sección 7 como hallazgo para diseño.
- Cualquier valor distinto del preset en una partida se marca como "configuración de prueba" (IDEA §5).

## 2. Valores iniciales por área

### 2.1 Tiempo

| Parámetro | Valor vigente | Usado en |
|---|---|---|
| Duración del día de juego a x1 | 20 s reales | ESTADOS §5 |
| Ticks por día | 120 (1 tick ≈ 0,17 s a x1) | ESTADOS §5 |
| Velocidades | pausa, x1, x2 (x4, x8 en modo desarrollador) | ESTADOS §5, UI §16 |
| `periodo_fiscal_dias` | 7 | ESTADOS §3.1 |

Con esto, 365 días de elecciones son unas 2 horas reales a x1 y 180 días de zombies, una hora.

### 2.2 Roles, empresas y economía

| Parámetro | Valor vigente | Usado en |
|---|---|---|
| `ingreso` por día [min, max] | agricultor [6,6, 8,8], obrero [8,0, 10,6], técnico [9,0, 12,2], periodista [16, 22] | ESTADOS §2, §12 |
| `produccion_base_agricultor` | 5,35 (con productividad típica ~0,72 y 3 técnicos, 30 agricultores cubren >105 % del consumo de 100 NPCs) | ESTADOS §2, EMPRESAS §7 |
| `tecnicos_por_agricultor` | 0,20 | ESTADOS §2, EMPRESAS §7 |
| `k_tecnificacion` | 1,5 | ESTADOS §2, EMPRESAS §7 |
| `salario_base_publico` | 3,15 por día (al 100 %) | ESTADOS §2, §12 |
| `pension_base` | 1,95 por día | ESTADOS §2, §12 |
| `tope_privado[rol]` (base 100 NPCs) | agricultor 30, obrero 14, comerciante 4, empresario 1, técnico 3, periodista 3 | ESTADOS §2, EMPRESAS §2 |
| `cupos_fijos` por escenario (base 100 NPCs) | Elecciones: estatal 4, docente 4. Zombies: estatal 4, docente 3 | ESTADOS §2, GOBERNADOR §3 |
| Composición inicial (100 NPCs, elecciones) | estudiante 12, agricultor 30, obrero 14, técnico 3, policía 5, estatal 4, comerciante 4, docente 4, periodista 3, médico 5, ingeniero 3, desempleado 2, jubilado 10, empresario 1 | ESTADOS §10 |
| `periodo_pago_dias` (empresas) | 7 | EMPRESAS §4, ESTADOS §4 |
| `dias_respuesta` (empresa) | 7 | EMPRESAS §4, §11 |
| `piso_sueldo_pct` | 70 % | EMPRESAS §4, ESTADOS §4 |
| `max_pase_desempleo_por_dia` | 2 | EMPRESAS §4, ESTADOS §2 |
| `max_contrataciones_por_dia` | 2 | EMPRESAS §5, §11 |
| `margen_comercial_pct` | 26 % | EMPRESAS §2, ESTADOS §4 |
| `propension_gasto` [base, min, max] | 0,85 [0,55, 0,95] | ESTADOS §1, §4 |
| `fiscal_umbral` y `fiscal_pendiente` | factor fiscal = 1 hasta 40 %; baja 0,01 por cada punto por encima | ESTADOS §12 |
| `ingresos_propios` de medios (por período) | El Heraldo 35, La Crónica del Valle 30, Voz Popular 25 | ESTADOS §6 |
| `umbral_dependencia_pct` (prensa) | 35 % | GOBERNADOR §5, ESTADOS §6 |

### 2.3 Alimento y despensas

| Parámetro | Valor vigente | Usado en |
|---|---|---|
| `consumo_por_npc` | 1,0 | ESTADOS §4 |
| `precio_base` | 2,55 | ESTADOS §4 |
| `silo_dias` | 25 | ESTADOS §4, EMPRESAS §7 |
| Stock inicial | Elecciones: 1.600 (16 días). Zombies: 1.800 (18 días) | ESTADOS §4, §13 |
| `despensa_max_dias` | 14 | ESTADOS §4 |
| `objetivo_base_dias` | 3,4 | ESTADOS §4 |
| `umbral_recompra_dias` | 3,6 | ESTADOS §4 |
| `k_prudencia_despensa` | 0,35 | ESTADOS §4 |
| `k_miedo_despensa` | 0,45 | ESTADOS §4 |
| `intercambio_por_comerciante` | 10 unidades/día por comerciante vivo | ESTADOS §12 |
| `diferencial_importacion` | 1,30 (+30 % respecto del precio externo de venta) | ESTADOS §12 |
| `stock_min_exportar_dias` | 5 días de consumo | ESTADOS §12 |
| `coef_sequia` [producción, precio] | 0,50 / 0,25 | ESTADOS §5, §12 |
| `coef_plaga` [producción, precio] | 0,45 / 0,25 | ESTADOS §5, §12 |

### 2.4 Clima y fenómenos

| Tipo | `exposicion_max` | `dano` (salud) | `atenuacion` | `usa_proteccion` |
|---|---|---|---|---|
| `plaga_zombie` | 0,52 | 14 a 34 | 0,70 | Sí (`defensa` de zonas del camino) |
| `pandemia` | 0,25 | 10 a 35 | 1,00 (sin `origen`) | No (se enfrenta con hospital) |

| Parámetro | Valor vigente | Usado en |
|---|---|---|
| `proteccion_max_zona` | 0,78 | ESTADOS §5 |
| Preset zombies — plaga principal | `intensidad` inicial 10, `crecimiento_dia` 0,5, `origen: "este"`, `duracion_dias: 185` (llega a 100 al día 180) | ESTADOS §5 |
| Preset zombies — hordas | Horda 1 (día 55, `duracion: 12`, `intensidad: 65`, `origen: "oeste"`, `aviso_dias: 8`); Horda 2 (día 115, `duracion: 14`, `intensidad: 80`, `origen: "norte"`, `aviso_dias: 10`) | ESTADOS §5 |
| `aviso_dias` por defecto | 0 | ESTADOS §5 |
| Clima aleatorio (elecciones / zombies) | Duración 14–27 días, intensidad 35–69, intervalo entre eventos 18–37 días | ESTADOS §5 |

### 2.5 Acciones, caos, efectos y contagio

| Parámetro | Valor vigente | Usado en |
|---|---|---|
| `max_acciones_por_periodo` (focos) | 3 | ESTADOS §9 |
| `periodo_dias` (caos) | 5 | ESTADOS §9 |
| `max_pct_rol_fuera_de_puesto` | 20 % | ESTADOS §9 |
| `duracion_max_dias` | 10 | ESTADOS §9 |
| `respiro_si_satisfaccion_media_menor_a` | 35 | ESTADOS §9 |
| `candidatas_por_decision` | 8 | ESTADOS §9 |
| `npcs_candidatos_por_periodo` | 3 | ESTADOS §9 |
| Disparador de `huelga` | `impago.alcanza_nomina = true` | ESTADOS §7, §12 |
| Disparador de `protesta` | `descontentos_pct` > 30 | ESTADOS §7 |
| Disparador de `saqueo` | `hambre_critica_pct` > 20 | ESTADOS §7 |
| `umbral_despensa_baja` (`compartir_comida`) | 1,5 días | ACCIONES §5 |
| `umbral_salud_baja` (`cuidar_vecinos`) | 75 | ACCIONES §5 |
| `k_orden`, `k_satisfaccion` | 0,50 y 0,30 | ESTADOS §14 |

**Intensidades del catálogo de efectos (`baja` / `media` / `alta`, ACCIONES §5):**

| Efecto | `baja` | `media` | `alta` |
|---|---|---|---|
| `anima` | ±6 satisfacción | ±12 satisfacción | ±18 satisfacción |
| `agita` | miedo +4, rebeldía +10, radio 15 % | miedo +7, rebeldía +14, radio 25 % | miedo +12, rebeldía +18, radio 35 % |
| `acapara` | +2 días objetivo, miedo +3 | +4 días objetivo, miedo +6 | +6 días objetivo, miedo +10 |
| `gasta` | +0,10 propensión | +0,18 propensión | +0,28 propensión |
| `ahorra` | −0,10 propensión | −0,18 propensión | −0,25 propensión |
| `comparte` (`max_pct_despensa_cedida`) | 18 % | 25 % | 35 % |
| `difunde` | radio 20 %, magnitud 6 | radio 30 %, magnitud 10 | radio 45 %, magnitud 14 |
| `repara` (`peso_reparador`) | 0,6 | 1,0 | 1,4 |
| `cuida` (`cura_extra`) | +1,5/día | +2,5/día | +4,0/día |
| `toma` (`tope_diario`) | 1,5 u/día | 2,5 u/día | 4,0 u/día |

### 2.6 IA opcional

| Parámetro | Valor vigente | Usado en |
|---|---|---|
| Tiempo máximo de espera al clasificador / generativo | 4.500 ms (umbral de estado `lenta`), respaldo inmediato a motor/plantilla si falla o vence | ESTADOS §9 |
| Latencia de referencia objetivo (local) | ~150 ms (d3 2B) | ESTADOS §9 |
| Tope de VRAM compartido (IA + render) | 6 GB | UI §12 |
| Sorteo del clasificador | Ponderado determinista con la semilla según probabilidades recibidas | ESTADOS §9 |

### 2.7 Servicios y salud

**Niveles 0 a 5 por servicio (puestos objetivo como % de la población viva y operación por período de 7 días, GOBERNADOR §4, ESTADOS §12):**

| Nivel | Seguridad (`policia`: puestos % / op. $/per) | Salud (`medico`: puestos % / op. $/per) | Obras (`ingeniero`: puestos % / op. $/per) |
|---|---|---|---|
| `0` (Desactivado) | 0 % / $0 | 0 % / $0 | 0 % / $0 |
| `1` (Mínimo) | 3 % / $8 | 2 % / $8 | 1 % / $8 |
| `2` (Básico) | 5 % / $18 | 3 % / $18 | 3 % / $18 |
| `3` (Estándar / Activo) | 8 % / $32 | 5 % / $32 | 4 % / $30 |
| `4` (Alto / Reforzado) | 12 % / $46 | 7 % / $52 | 6 % / $48 |
| `5` (Máximo) | 16 % / $76 | 10 % / $76 | 8 % / $78 |

*Nota: la operación por período de la tabla escala proporcionalmente con `población / 100` (con `costo_base_servicio_por_poblacion = 0,032` $/NPC/día).*

| Parámetro | Valor vigente | Usado en |
|---|---|---|
| Cobertura objetivo de referencia (`objetivo_cobertura`) | `medico` 5 %, `ingeniero` 3 %, `policia` 5 % (12 % en zombies) | ESTADOS §12 |
| Cobertura baja (`cobertura_baja_umbral`) | < 0,60: penaliza miedo (`22 × (0,60 − cob)`) para policía y satisfacción (`20 × (0,60 − cob)`) para médicos | ESTADOS §12 |
| `coef_hambre` [subida, baja] | +24 × (1 − acceso) / −14 al comer | ESTADOS §12 |
| Daño por hambre crítica | −2 salud/día con hambre > 80 | ESTADOS §12 |
| `k_vulnerabilidad_edad` | 1,35 (menores < 18 y mayores ≥ 65 reciben ×1,35 daño por golpe) | ESTADOS §12 |
| `umbral_hospital` / `alta` | < 60 pide cama / ≥ 90 recibe alta | ESTADOS §12 |
| `pacientes_por_medico` | 3 camas por médico activo | ESTADOS §12 |
| `cura_base` / `cura_natural` | 15/día internado (escalada por indicador `salud`) / 0,5/día en casa si hambre < 50 | ESTADOS §12 |

### 2.8 Zonas, defensa y orden

*(Cada policía cuenta entero para defensa y orden en su zona, sin reparto; ESTADOS §14.)*

| Parámetro | Valor vigente | Usado en |
|---|---|---|
| `movilidad_defensa` (c) | 0,40 | ESTADOS §14 |
| `k_integridad` | 0,50 | ESTADOS §14 |
| `dano_integridad` | 0,45 por golpe | ESTADOS §14 |
| `rep_por_npc` | 0,45 por día por reparador efectivo (obreros, ingenieros y acción `repara`) | ESTADOS §14 |
| `reubicacion_policias_pct` | 20 % por día | ESTADOS §14 |
| Amenaza por golpes recientes | min(100, 20 × golpes en los últimos 5 días en la zona) | ESTADOS §14 |
| `objetivo_orden` | 0,05 (1 policía cada 20 habitantes efectivos en la zona) | ESTADOS §14 |

### 2.9 Objetivo, historial e interfaz

| Parámetro | Valor vigente | Usado en |
|---|---|---|
| Meta de victoria — Elecciones | `apoyo_pct >= 50` al día 365 | ESTADOS §11 |
| Derrota — Elecciones | `hambre_critica_pct > 50` en cualquier momento | ESTADOS §11 |
| Meta de victoria — Zombies | `poblacion_pct >= 70` al día 180 | ESTADOS §11 |
| Derrota — Zombies | `poblacion_pct < 40` en cualquier momento | ESTADOS §11 |
| `umbral_alerta_derrota` | 0,70 (cambia color al recorrer el 70 % de la distancia inicial al límite) | ESTADOS §11 |
| `historial_max_dias` | 200 (los días más antiguos se compactan semanalmente) | ESTADOS §10 |
| Escala de NPCs | arranque en 100, techo en 1.000 en modo desarrollador | UI §12 |

### 2.10 Las 10 palancas del gobernador (rangos, modos y valores por escenario)

*(Sin topes de cambio por período; los cambios entran en vigencia al día siguiente.)*

| Palanca | Rango / Modos / Escalones | Elecciones (inicial) | Zombies (inicial) |
|---|---|---|---|
| `impuesto` | 0 a 60 % (paso 1) | 38 % | 40 % |
| `salario_publico` | 50 a 150 % (paso 5) | 100 % | 100 % |
| `servicios.seguridad` | Nivel 0 a 5 | 2 | 2 |
| `servicios.salud` | Nivel 0 a 5 | 3 | 3 |
| `servicios.obras` | Nivel 0 a 5 | 2 | 2 |
| `ayuda_social` | 0 a 10 $/día (paso 0,5; para desempleados y jubilados) | 0 $/día | 0 $/día |
| `garantia_alimentaria` | 0 a 100 % (paso 5; menores siempre 100 %) | 85 % | 85 % |
| `precio_maximo` | `libre` (sin tope), `moderado` (**×1,25** `precio_base` = $3,19), `estricto` (**×0,60** `precio_base` = $1,53) | `libre` | `libre` |
| `comercio_exterior` | 5 escalones: **−100 %** (Exp. máx), **−50 %** (Exportar), **0 %** (Cerrado), **+50 %** (Importar), **+100 %** (Imp. máx) de `comerciantes × intercambio_por_comerciante` | `0 %` | `0 %` |
| `prensa` | 0 a 100 $/período (paso 5; reparto parejo entre medios) | 12 $/per | 12 $/per |
| `tope_emision` *(solo ext. `fiscal`)* | 0 a 30 % (paso 1) | 10 % | 10 % |

## 3. Criterios de arranque de un mundo

Un mundo generado debe cumplir al día 1–7 sin intervención del jugador:
- Producción de alimento ≥ consumo × 1,05 (medido: ~113,8 u/d en elecciones, ~116,6 u/d en zombies vs 100 u/d).
- Stock inicial de 15 a 20 días (elecciones: 16 días; zombies: 18 días).
- Ingresos ≥ gastos totales × 1,10 (medido: ratio 1,17 en elecciones, 1,24 en zombies).
- Reserva ≥ 20 días de nómina (elecciones: $4.800; zombies: $3.400).
- Ningún rol vacío (mínimo ≥ 1 en los 14 roles al arranque y durante partida sin bajas).
- Ambas empresas (`alimento` y `comercio`) arrancan con `ultima_ganancia` positiva y 0 respuestas en los primeros períodos sin perturbación.
- `lealtad` inicial heterogénea, y `apoyo_pct` inicial derivado del estado (no fijo).

## 4. Plan de simulación y pruebas

**Modo de prueba.** `npx tsx scripts/run_calibration.ts` corre simulación headless determinista con el director mecánico.

**Propiedades e invariantes verificadas:**
1. **Sensibilidad de las 10 palancas:** cada palanca mueve métricas visibles del juego en dirección esperada (`apoyo`, `reserva`, `indicadores.*`, `hambre`, `precio`, `stock`, `empresa_respuesta`, `medios[].alcancePct`/`credibilidad`).
2. **No-dominancia:** ningún nivel `0..5` de servicio, ningún modo de `precio_maximo` y ningún escalón de `comercio_exterior` domina estrictamente a los demás.
3. **Tramo de `objetivo_perdido` sin `derrota` en ambos escenarios:** existen políticas subóptimas que sobreviven hasta el plazo sin caer por debajo del límite de derrota pero pierden el objetivo (`apoyo_pct < 50` al día 365 en elecciones; `40 <= poblacion_pct < 70` al día 180 en zombies).
4. **Determinismo e invariantes:** misma semilla → estado idéntico; `reserva >= 0`, `stock >= 0`, variables en `[0, 100]`, límites del caos respetados.

## 5. Resultados de la última corrida de validación

Corrida sobre el código vigente (`npx tsx scripts/run_calibration.ts`):

- **Determinismo e invariantes:** `deterministic: true`, `invariantViolations: 0` en todas las corridas.
- **Elecciones — Línea base y respuestas a sequía (`intensidad 95, día 140, 90d` + caos):**
  - Base sin perturbación (n=10): **100 % victoria**, 0 impagos, 0 respuestas empresariales, `prod/cons = 113,77 / 100`, `ingRatio7 = 1,17`, `apoyoEnd = 56,8 %`.
  - Pasivo con sequía + caos (n=10): **0 % victoria**, 10 % `objetivo_perdido`, **90 % derrota**, `hambreEnd = 65,8 %`.
  - Heurístico rígido (sobrecarga impuestos a 46 %): **20 % victoria**, **80 % `objetivo_perdido` sin derrota** (`hambreEnd = 0 %`, `apoyoEnd = 44,1 %`).
  - Activo balanceado (`moderado` + importación + alivio fiscal selectivo): **100 % victoria** (`hambreEnd = 0 %`, `apoyoEnd = 61,8 %`).
- **Sensibilidad de las 10 palancas (n=8):**
  - `impuesto` (48 vs 28 %): Δ`apoyo` −33,81 pp, Δ`reserva` +$2.796.
  - `salario_publico` (120 vs 80 %): Δ`apoyo` +16,05 pp, Δ`reserva` −$809.
  - `servicios.seguridad` (N5 vs N0): Δ`ind.seguridad` +76,6, Δ`apoyo` +2,16 pp, Δ`reserva` −$1.256.
  - `servicios.salud` (N5 vs N0): Δ`ind.salud` +73,1, Δ`apoyo` +34,66 pp, Δ`reserva` −$874.
  - `servicios.obras` (N5 vs N0): Δ`ind.infraestructura` +76,2, Δ`stock` +2,07, Δ`reserva` −$701.
  - `ayuda_social` (4 vs 0 $/d): Δ`apoyo` +2,39 pp, Δ`reserva` −$1.338.
  - `garantia_alimentaria` (100 vs 0 %, con liquidez baja): Δ`hambre` −30,38 pp, Δ`apoyo` +1,85 pp, Δ`reserva` −$383.
  - `precio_maximo` (`libre` vs `estricto`, sequía): Δ`precio` +$9,35, Δ`emp_respuesta` −12,38, Δ`stock` +14,21.
  - `comercio_exterior` (+100 vs −100 %): Δ`stock` +1.636 u., Δ`reserva` −$10.940, Δ`ganancia_alimento` −$1.252, Δ`precio` −$1,12.
  - `prensa` (45 vs 0 $/per): Δ`alcance` +55 pp, Δ`credibilidad` −8,8, Δ`dependencia` +39,1 pp, Δ`reserva` −$360.
- **No-dominancia (n=5 por punto):**
  - *Servicios en elecciones (con sequía):* `seguridad` rinde óptimo en N2 (80 % win, reserva $9.833; N4–5 pierden por drenaje fiscal/productivo e impagos). `salud` rinde óptimo en N3 (80 % win, $9.833; N0–1 caen por enfermedad y N5 sufre 9 impagos). `obras` rinde óptimo en N3 (100 % win, apoyo 57,3 %, $10.505; N0–1 caen por baja productividad y N5 baja apoyo a 54,0 % y reserva a $6.139).
  - *Seguridad en zombies:* N0–2 terminan en **100 % derrota** (`popEnd ~38 %`). **N3** genera tramo de **`objetivo_perdido` sin derrota** (en n=10 `Z_seg3`: 50 % victoria, **40 % `objetivo_perdido`**, 10 % derrota, `popEnd = 67,8 %`). N4 logra 70–100 % victoria según manejo fiscal; N5 empeora la reserva ($1.414 vs $4.203), genera impagos y dispara el hambre (55,1 % vs 37,2 % en N4) al absorber agricultores.
  - *`precio_maximo` con sequía prolongada:* `libre` sufre picos de precio (60 % derrota, 40 % `objetivo_perdido`), **`moderado` logra el equilibrio (80 % victoria, 20 % `objetivo_perdido`, 0 respuestas)** y `estricto` sostenido 365d provoca 42 respuestas/despidos empresariales y acaparamiento barato que vacía el stock (`minStock 0,32`).
  - *`comercio_exterior` (90d):* −100 % eleva reserva a $13.635 drenando stock (min 487 u.) y reduciendo apoyo (35,6 %); −50 % y 0 % mantienen stock y equilibrio; +50 % y +100 % sostienen stock a costa de la reserva ($885 y $0).

## 6. Informe de calibración

El detalle histórico de corridas y comparaciones se conserva en `presets/elecciones_simple.json` y se ejecuta de forma reproducible con `npx tsx scripts/run_calibration.ts`.

## 7. Hallazgos para diseño

(Sin contradicciones ni bloqueos abiertos tras la alineación a GOBERNADOR v0.25, ESTADOS v0.39, EMPRESAS v0.1 y ACCIONES v0.2.)
