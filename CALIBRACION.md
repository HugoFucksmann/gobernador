# Calibración y pruebas (v1.0)

<!--
  NOTA DE MANTENIMIENTO (Agente de prototipo):
  - Este archivo queda bajo mi responsabilidad (IDEA_JUEGO §8): cada ajuste en src/data/catalogs.ts,
    src/engine/worldGenerator.ts o presets/*.json debe reflejarse acá y verificarse antes de seguir.
  - Alcance actual: Nivel 1 (M0/M1 + G0/G1/G2 con mapa 2D). Lo de Nivel 1.1 (M2/G3: extensión fiscal,
    tope_emision_pct, etc.) se mantiene explícitamente marcado aparte para no mezclar pruebas.
  - Qué probar primero (HOJA_DE_RUTA §2, pasos 1 y 2):
      1. M0 + G0: arranque balanceado en una zona, sin clima ni caos, en piloto automático (ECONOMIA §12:
         30 días sin recortes ni impagos, dinero total y stock estables).
      2. M0 + G1 con el mapa 2D: construir servicios (hospital/comisaria) y 3 palancas (impuesto,
         ayuda_social, garantia_alimentaria) para validar si el dilema construir/gastar/ahorrar ya es divertido.
      3. Recién con 1 y 2 validados, iterar M1 + G2 (elecciones, zombies) e IA opcional.
-->

> Doc mantenido por el **agente de prototipo**. Reúne todo lo que se ajusta probando o simulando: valores iniciales, criterios de arranque de los mundos, presets vigentes y resultados de validación. Las reglas y la intención están en `MUNDO-1.md`, `ECONOMIA-1.md`, `CAOS_PRENSA-1.md`, `ACCIONES.md`, `EDIFICIOS.md`, `CONTROLES-1.md`, `GOBERNADOR-1.md`, `ACTORES.md`, `ESCENARIOS-1.md`, `MOTOR-1.md`, `HOJA_DE_RUTA-1.md`, `UI-1.md` e `IDEA_JUEGO-1.md`. Los números vigentes están sincronizados con `src/data/catalogs.ts`, `src/engine/worldGenerator.ts` y `presets/*.json`.

---

## 1. Para qué existe este doc y cómo se usa

**Regla de separación.** Va acá todo lo que se ajusta probando: constantes, coeficientes, umbrales, topes, plazos, tamaños y valores iniciales de los mundos. Se queda en los docs de diseño lo que es una **regla** (qué hace algo y de qué depende) y las decisiones de diseño que no se afinan (cuáles son los roles, cómo se cruzan los sistemas, qué ve el jugador).

**Quién manda sobre qué.**
- Los valores: este doc, `src/data/catalogs.ts` y los presets (`presets/*.json`). Si difieren, `src/data/catalogs.ts` / el preset es el que se ejecuta y este doc se actualiza (registrando cualquier desajuste en la sección 7).
- Las reglas: los docs de diseño. El agente de prototipo **no cambia reglas**: si una prueba muestra que una regla no se puede balancear o se contradice con otra, lo registra en la sección 7 como hallazgo para diseño.
- Cualquier valor distinto del preset en una partida se marca como **configuración de prueba** (`ESCENARIOS §1`, `IDEA_JUEGO §5`).

**Prioridad de pruebas (`HOJA_DE_RUTA §2`, pasos 1 y 2):**
1. **Paso 1 (`M0 + G0`):** una zona, sin clima ni caos, controles en piloto automático. Validar `ECONOMIA §12` (30 días sin recortes ni impagos, dinero total y stock estables).
2. **Paso 2 (`M0 + G1` con mapa 2D):** construir servicios (`hospital`, `comisaria`) y ajustar 3 palancas (`impuesto`, `ayuda_social`, `garantia_alimentaria`). Validar legibilidad del dilema y diversión base.
3. **Pasos 3–5 (`M1 + G2`):** `elecciones`, `zombies` y luego IA opcional.

---

## 2. Valores iniciales por área

### 2.1 Tiempo y calendario

| Parámetro | Valor vigente | Usado en |
|---|---|---|
| Duración del día de juego a x1 | 20 s reales | `MOTOR §1` |
| Ticks por día | 120 (1 tick ≈ 0,17 s a x1) | `MOTOR §1` |
| Velocidades | pausa, x1, x2 (x4, x8 en modo desarrollador) | `MOTOR §1`, `UI §16` |
| `periodo_dias` | 7 (calendario unificado de día de pago para empresas, estado y medios) | `ECONOMIA §1` |

Con esto, 365 días de elecciones son unas 2 horas reales a x1 y 180 días de zombies, una hora (`IDEA_JUEGO §6`).

### 2.2 Economía, roles y empresas (`ECONOMIA-1.md`, `MUNDO-1.md`)

| Parámetro | Valor vigente | Usado en |
|---|---|---|
| `salario_base_publico` | 4,25 $/día (al 100 %) | `ECONOMIA §3` |
| `pension_base` | 2,56 $/día | `ECONOMIA §3` |
| `ingreso` privado por día `[min, max]` | agricultor `[5,8, 7,8]`, obrero `[8,0, 10,6]`, técnico `[9,0, 12,2]`, periodista `[4,2, 6,4]` | `ECONOMIA §4` |
| `produccion_base_agricultor` | 5,35 u/día | `ECONOMIA §4` |
| `tecnicos_por_agricultor` | 0,20 | `ECONOMIA §4`, `MUNDO §3` |
| `k_tecnificacion` | 1,5 | `ECONOMIA §4` |
| `parte_sueldos` | La fija el generador al arranque para que ambas empresas inicien con `factor = 1,0` (acotada en `[0,25, 0,92]` en alimento y `[0,20, 0,90]` en comercio) | `ECONOMIA §4`, §12 |
| `factor_max` | 1,5 | `ECONOMIA §4` |
| `piso_sueldo_pct` | 70 % | `ECONOMIA §4` |
| `max_contrataciones_por_periodo` | 3 | `ECONOMIA §4` |
| `max_pase_desempleo_por_dia` | 2 | `ECONOMIA §4`, `MUNDO §3` |
| `margen_comercial_pct` | 26 % | `ECONOMIA §6` |
| `propension_gasto` `[base, min, max]` | 0,85 `[0,55, 0,95]` | `ECONOMIA §3` |
| `k_riqueza` | 0,045 | `ECONOMIA §3` |
| `colchon_dias` | 7 días de consumo en comida | `ECONOMIA §3`, §12 |
| Factor impositivo (`MUNDO §10`) | 1,0 hasta `40 %` de impuesto; baja `0,01` por cada punto por encima (piso `0,5`) | `MUNDO §10` |
| `ingresos_propios` de medios (por período) | El Heraldo `40`, La Crónica del Valle `36`, Voz Popular `32` | `ECONOMIA §7`, `CAOS_PRENSA §7` |
| `umbral_dependencia_pct` (prensa) | 35 % | `CAOS_PRENSA §7` |

*Nota sobre cupos iniciales:* los puestos de `agricultor`, `obrero`, `comerciante`, `policia` y `medico` derivan de los edificios iniciales del preset (sección 2.4 y sección 3). Los cupos fijos iniciales en `100` habitantes son `estatal = 4` y `docente = 4` en elecciones (`docente = 3` en zombies); `tecnico = 3`, `empresario = 1`, `periodista = 3`, `ingeniero = 3` (por `nivel_obras = 2`), `estudiante = 12`, `jubilado = 10`, `desempleado = 2`.

### 2.3 Alimento, despensas y comercio exterior (`ECONOMIA-1.md`)

| Parámetro | Valor vigente | Usado en |
|---|---|---|
| `consumo_por_npc` | 1,0 | `ECONOMIA §6` |
| `precio_base` | 2,55 | `ECONOMIA §6` |
| `silo_dias` | 25 (+ `silo_extra_dias` por cada silo construido) | `ECONOMIA §6` |
| Stock inicial | Elecciones: `1.600` (16 días). Zombies: `1.800` (18 días) | `ECONOMIA §12`, `ESCENARIOS §4` |
| `despensa_max_dias` | 14 | `ECONOMIA §6` |
| `objetivo_base_dias` | 3,4 | `ECONOMIA §6` |
| `umbral_recompra_dias` | 3,6 | `ECONOMIA §6` |
| `k_prudencia_despensa` | 0,35 | `ECONOMIA §6` |
| `k_miedo_despensa` | 0,45 | `ECONOMIA §6` |
| `pct_retencion` (medida `retencion_stock`) | 45 % (`0,45` del stock vendible por día) | `ECONOMIA §6`, `ACTORES §3` |
| `intercambio_por_comerciante` | 10 unidades/día por comerciante activo | `ECONOMIA §7` |
| `diferencial_importacion` | 1,30 (+30 % respecto del precio externo de venta) | `ECONOMIA §7` |
| `stock_min_exportar_dias` | 5 días de consumo | `ECONOMIA §7` |
| `coef_sequia` `[producción, precio]` | 0,50 / 0,25 | `MUNDO §5`, `ECONOMIA §6` |
| `coef_plaga` `[producción, precio]` | 0,45 / 0,25 | `MUNDO §5`, `ECONOMIA §6` |

### 2.4 Edificios y obras (`EDIFICIOS.md`, `MUNDO §13`)

**Catálogo por tipo:**

| Tipo | Categoría / quién | Costo | Días de obra | Mantenimiento ($/per) | Puestos / efecto |
|---|---|---|---|---|---|
| `hospital` | Público (gobernador) | $380 | 4 | $30 | `4` médicos (`educ_min: 3`), `12` camas |
| `comisaria` | Público (gobernador) | $300 | 3 | $22 | `4` policías (`educ_min: 1`), `bonus_defensa = +14` |
| `escuela` | Público (solo preset) | $0 | 0 | $0 | `4` docentes (`educ_min: 2`) |
| `oficina_publica` | Público (solo preset) | $0 | 0 | $0 | `4` estatales (`educ_min: 1`) |
| `campo` | Privado (alimento) | $260 | 3 | $0 | `6` agricultores |
| `local_comercio` | Privado (comercio) | $280 | 3 | $0 | `4` obreros + `1` comerciante |
| `muralla` | Obra de suceso (G2+) | $320 | 3 | $12 | `defensa_muralla = +20` en su zona |
| `silo` | Obra de suceso (G2+) | $260 | 3 | $8 | `silo_extra_dias = +10` días de consumo |
| `riego` | Obra de suceso (G2+) | $280 | 3 | $10 | Reduce `50 %` la caída de producción por sequía |
| `hospital_campana` | Obra de suceso (G2+) | $220 | 2 | $14 | `8` camas temporales por `25` días (cura `50 %`, sin médicos) |

**Constantes de edificios e inversión privada:**

| Parámetro | Valor vigente | Usado en |
|---|---|---|
| `camas_por_hospital` | 12 | `EDIFICIOS §1` |
| `bonus_defensa` (comisaría) | 14 | `EDIFICIOS §1`, `MUNDO §8` |
| `defensa_muralla` | 20 | `EDIFICIOS §2`, `MUNDO §8` |
| `silo_extra_dias` | 10 | `EDIFICIOS §2`, `ECONOMIA §6` |
| Efecto del `riego` (`reduccion_sequia_pct`) | 50 % | `EDIFICIOS §2` |
| `camas_campana` / `dias_campana` | 8 camas / 25 días (cura al 50 % del hospital normal) | `EDIFICIOS §2`, `MUNDO §6` |
| `puestos_por_local` | 4 obreros + 1 comerciante | `EDIFICIOS §3` |
| `puestos_por_campo` | 6 agricultores | `EDIFICIOS §3` |
| `periodos_para_invertir` | 2 períodos seguidos con `factor > 1` | `EDIFICIOS §3`, `MUNDO §13` |

### 2.5 Controles y palancas (`CONTROLES-1.md §2`, `GOBERNADOR-1.md §2`)

*(Los cambios de control entran en vigencia al día siguiente y emiten `control {control, valor_anterior, valor_nuevo, palanca?}`.)*

**Tabla de `nivel_obras` (0 a 5, ingenieros como % de la población viva y operación por período base 100 hab.):**

| Nivel | Etiqueta | Ingenieros (% pop.) | Operación ($/período) | Factor días de obra |
|---|---|---|---|---|
| `0` | Desactivado | 0 % | $0 | ×1,35 |
| `1` | Mínimo | 1 % | $8 | ×1,15 |
| `2` | Básico | 3 % | $18 | ×1,00 |
| `3` | Activo | 4 % | $30 | ×0,85 |
| `4` | Intensivo | 6 % | $48 | ×0,72 |
| `5` | Máximo | 8 % | $78 | ×0,60 |

**Rangos, modos y escalones de cada control:**

| Control (y palanca) | Rango / Modos / Escalones | Elecciones (piloto aut.) | Zombies (piloto aut.) |
|---|---|---|---|
| `tasa_impuesto` (`impuesto`) | `0` a `60 %` (paso `1`) | `38 %` | `40 %` |
| `salario_publico` (`salario_publico`) | `50` a `150 %` del salario base público (paso `5`; `2,13` a `6,38 $/d` hoy) | `100 %` | `100 %` |
| `puestos[ingeniero]`, `operacion[obras]` (`nivel_obras`) | Niveles `0` a `5` (tabla superior) | `2` (3 % / $18) | `2` (3 % / $18) |
| `ayuda_social` (`ayuda_social`) | `0` a `10 $/día` (paso `0,5`; para desempleados y jubilados) | `0 $/día` | `0 $/día` |
| `garantia_pct` (`garantia_alimentaria`) | `0` a `100 %` (paso `5`; menores siempre `100 %`) | `85 %` | `85 %` |
| `tope_precio` (`precio_maximo`) | `libre` (sin tope), `moderado` (**×1,25** `precio_base` = `$3,19`), `estricto` (**×0,60** `precio_base` = `$1,53`) | `libre` | `libre` |
| `flujo_exterior_pct` (`comercio_exterior`) | 5 escalones: `−100 %` (Exp. máx), `−50 %` (Exportar), `0 %` (Cerrado), `+50 %` (Importar), `+100 %` (Imp. máx) | `0 %` | `0 %` |
| `fondos_prensa` (`prensa`) | `0` a `100 $/período` (paso `5`; reparto parejo entre medios) | `12 $/per` | `12 $/per` |
| `tope_emision_pct` *(solo ext. `fiscal`, M2/G3)* | `0` a `30 %` (paso `1`) | `10 %` | `10 %` |

### 2.6 Actores y demandas (`ACTORES.md`)

| Parámetro | Valor vigente | Usado en |
|---|---|---|
| `dias_respuesta_demanda` | 5 | `ACTORES §1` |
| `dias_compromiso` | 28 | `ACTORES §1` |
| `dias_entre_demandas` | 14 | `ACTORES §1` |
| `dias_medida` | 14 | `ACTORES §3` |
| `despidos_medida` | 2 | `ACTORES §3` |
| `umbral_impuesto_demanda` | 42 % | `ACTORES §3` |
| `umbral_pauta` | 24 % (dependencia bajo 24 %) | `ACTORES §3` |
| `max_demandas_simultaneas` | 2 | `ACTORES §1` |
| `periodos_bajo_para_demanda` | 2 períodos con `factor < 1` | `ACTORES §3` |

**"Paso" de cada palanca en demandas (`ACTORES §3`):**

| Palanca | Paso pedido por el actor |
|---|---|
| `impuesto` (`bajen_impuestos`) | `−5` puntos porcentuales |
| `precio_maximo` (`liberen_precio`) | Un modo más libre (`estricto → moderado → libre`) |
| `comercio_exterior` (`abran_exportacion`) | Pasar a exportar (`−50 %`) |
| `prensa` (`mas_pauta`, `silencio_pagado`) | `+10 $/período` |

### 2.7 Clima, salud y seguridad por zona (`MUNDO §5-8`)

**Fenómenos con daño:**

| Tipo | `exposicion_max` | `dano` (salud) | `atenuacion` | `usa_proteccion` |
|---|---|---|---|---|
| `plaga_zombie` | 0,52 | 14 a 34 | 0,70 | Sí (`defensa` de zonas del camino) |
| `pandemia` | 0,25 | 10 a 35 | 1,00 (sin `origen`) | No (se enfrenta con hospital) |

| Parámetro | Valor vigente | Usado en |
|---|---|---|
| `proteccion_max_zona` | 0,78 | `MUNDO §5` |
| Clima aleatorio (M1+) | Duración `14–27` días, intensidad `35–69`, intervalo `18–37` días (primer disparo desde día `22` en elecciones y `28` en zombies) | `MUNDO §5` |
| `aviso_dias` por defecto | 0 | `MUNDO §5` |
| `objetivo_cobertura` (servicios) | `medico` 5 %, `ingeniero` 3 %, `policia` 5 % | `MUNDO §7` |
| `costo_base_servicio_por_poblacion` | 0,032 $/NPC/día | `MUNDO §7` |
| `cobertura_baja_umbral` | `< 0,60`: suma miedo (`22 × (0,60 − cob)`) por policía o malestar (`20 × (0,60 − cob)`) por médicos | `MUNDO §7` |
| `coef_hambre` `[subida, baja]` | `+24 × (1 − acceso)` / `−14` al comer | `MUNDO §10` |
| Daño por hambre crítica | `−2` salud/día con hambre `> 80` | `MUNDO §6` |
| `k_vulnerabilidad` (edad) | 1,35 (menores `< 18` y mayores `≥ 65` reciben `×1,35` daño por golpe) | `MUNDO §6` |
| `umbral_hospital` / `alta` | `< 60` pide cama / `≥ 90` recibe alta | `MUNDO §6` |
| `pacientes_por_medico` | 3 camas por médico activo | `MUNDO §6`, `EDIFICIOS §1` |
| `cura_base` / `cura_natural` | `15/día` internado (escalada por indicador `salud`; `50 %` en campaña) / `0,5/día` en casa si hambre `< 50` | `MUNDO §6` |
| `movilidad_defensa` (`c`) | 0,40 | `MUNDO §8` |
| `k_integridad` | 0,50 | `MUNDO §8` |
| `dano_integridad` | 0,45 por golpe | `MUNDO §8` |
| `rep_por_npc` | 0,45 por día por reparador efectivo (obreros, ingenieros y acción `repara`) | `MUNDO §8` |
| `reubicacion_policias_pct` | 20 % por día | `MUNDO §8` |
| Amenaza por golpes recientes | `min(100, 20 × golpes en últimos 5 días)` en la zona | `MUNDO §8` |
| `objetivo_orden` | 0,05 (1 policía cada 20 habitantes efectivos en la zona) | `MUNDO §8` |

### 2.8 Caos, prensa e IA opcional (`CAOS_PRENSA-1.md`, `ACCIONES.md`)

**Límites del caos y director:**

| Parámetro | Valor vigente | Usado en |
|---|---|---|
| `max_acciones_por_periodo` (focos) | 3 | `CAOS_PRENSA §6` |
| `periodo_dias_caos` | 5 | `CAOS_PRENSA §6` |
| `max_pct_rol_fuera_de_puesto` | 20 % | `CAOS_PRENSA §5`, §6 |
| `duracion_max_dias` | 10 | `CAOS_PRENSA §6` |
| `respiro_si_satisfaccion_media_menor_a` | 35 | `CAOS_PRENSA §6` |
| `ofertas_por_dia` | 2 | `CAOS_PRENSA §6` |
| `k_extremo`, `k_descontento`, `k_reciente` | `0,75`, `1,5`, `1,0` (ventana reciente: `3` días) | `CAOS_PRENSA §6` |
| `candidatas_max` | 8 | `CAOS_PRENSA §6` |
| `k_afinidad` | 0,85 | `CAOS_PRENSA §6` |
| `max_pct_accion` | 35 % | `CAOS_PRENSA §6` |
| Disparadores de condición (`huelga` / `protesta` / `saqueo`) | `impago.alcanza_nomina = true` / `descontentos_pct > 30` / `hambre_critica_pct > 20` | `CAOS_PRENSA §3` |
| `umbral_despensa_baja` / `umbral_salud_baja` | 1,5 días / 75 | `ACCIONES §5` |
| `k_orden`, `k_satisfaccion` (contagio) | 0,50 y 0,30 | `CAOS_PRENSA §4` |

**Prensa y noticias:**

| Parámetro | Valor vigente | Usado en |
|---|---|---|
| `relevancia_min` | 20 | `CAOS_PRENSA §8` |
| Relevancia por tema | `aviso: 100`, `objetivo: 100`, `ataque: 85`, `salud: 80`, `hambre: 80`, `impago: 80`, `conflicto: 78`, `clima: 75`, `presiones: 72`, `obras: 64`, `precio: 55`, `empresas: 55`, `gobierno: 50`, `vecinos: 25` | `CAOS_PRENSA §8` |
| Umbrales de disparo en prensa | `hambre_critica_pct >= 12 %` (suba `> 1,5` pp), variación precio `>= 18 %` | `CAOS_PRENSA §8` |
| `noticias_por_columnista` | 1 por día por columnista vivo | `CAOS_PRENSA §8` |
| `ventana_repeticion_dias` | 5 días (`factor_peso = 0,35`, `factor_efecto = 0,40`) | `CAOS_PRENSA §8` |
| `pesos_tono_base` | `neutral: 1,1`, `alarmista: 0,45`, `critico: 0,45`, `favorable: 0,45` | `CAOS_PRENSA §8` |
| `base_efecto_tono` | `alarmista: +10 miedo`, `critico: −10 lealtad`, `favorable: +8 lealtad`, `neutral: 0` | `CAOS_PRENSA §8` |
| `duracion_efecto_noticia` | 5 días | `CAOS_PRENSA §8` |
| `max_efecto_noticias_dia` | 14 puntos por NPC/día | `CAOS_PRENSA §8` |
| Interruptor `noticias_mueven_satisfaccion` | `false` (`[pendiente de prueba]`; activar si la prensa no se siente, apagar si duplica hambre/precio) | `CAOS_PRENSA §10` |

**IA opcional (`MOTOR §4`, `CAOS_PRENSA §9`):**

| Parámetro | Valor vigente | Usado en |
|---|---|---|
| `plazo_clasificador_ms` | 4.500 ms (respaldo inmediato al motor si falla o vence) | `CAOS_PRENSA §9`, `MOTOR §4` |
| `plazo_generativo_ms` | 4.500 ms (respaldo inmediato a plantilla si falla, vence o inventa datos) | `CAOS_PRENSA §9`, `MOTOR §4` |
| Tope de VRAM compartido (IA + render) | 6 GB | `MOTOR §4`, `UI §12` |

**Intensidades del catálogo de efectos (`baja` / `media` / `alta`, `CAOS_PRENSA §5`, `ACCIONES §5`):**

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

### 2.9 Objetivo, historial e interfaz (`MUNDO §11`, `GOBERNADOR §6`)

| Parámetro | Valor vigente | Usado en |
|---|---|---|
| `umbral_alerta_derrota` | 0,70 (cambia color al recorrer 70 % de la distancia inicial al límite) | `GOBERNADOR §6` |
| `historial_max_dias` | 200 (los días anteriores se compactan semanalmente) | `MUNDO §11` |
| Escala de NPCs | arranque en `100`, techo en `1.000` en modo desarrollador | `ESCENARIOS §1`, `IDEA_JUEGO §5` |

---

## 3. Presets y criterios de arranque (`ESCENARIOS §4`, `ECONOMIA §12`)

### 3.1 Estructura común de parcelas, medios y niveles

| Elemento | Configuración vigente |
|---|---|
| Nivel de mundo y de gobernador por defecto (Nivel 1) | `M1 + G2` (pruebas iniciales por pasos: `M0 + G0` → `M0 + G1`) |
| Parcelas por zona (`20` totales: `13` ocupadas, `5` libres, `2` bloqueadas) | `centro`: 1 `hospital`, 1 `comisaria`, 1 `oficina_publica`, 2 `local_comercio`, 1 libre (`p_centro_libre`) · `norte`: 2 `campo`, 1 libre (`p_norte_libre`) · `oeste`: 3 `campo`, 1 libre (`p_oeste_libre`) · `sur`: 2 `local_comercio`, 1 libre (`p_sur_libre`) · `este`: 1 `escuela`, 1 libre (`p_este_libre`), 2 bloqueadas (`p_hito_este_1`, `p_hito_este_2`) |
| Medios y columnistas por medio | `mediosDefault = 2`, `periodista = 3` (reparto round-robin: `El Heraldo` recibe `2` columnistas, `La Crónica del Valle` recibe `1`; con `3` medios, `1` cada uno sumando `Voz Popular`) |

### 3.2 Preset `elecciones` (Año Electoral)

- **Reserva y stock inicial:** `$4.800`, `1.600` u. (16 días).
- **Piloto automático (`initialLevers`):** `impuesto = 38 %`, `salario_publico = 100 %`, `nivel_obras = 2`, `ayuda_social = 0`, `garantia_alimentaria = 85 %`, `precio_maximo = libre`, `comercio_exterior = 0 %`, `prensa = 12 $/per` (`tope_emision = 10 %` en M2).
- **Hitos con sus parcelas:**
  - `hito_estabilidad`: `satisfaccion_media >= 52` durante `2` períodos → habilita `p_hito_este_1` (*Ensanche del Valle*).
  - `hito_prosperidad`: `apoyo_pct >= 55` durante `2` períodos → habilita `p_hito_este_2` (*Parque Nuevo*).
- **Objetivo y derrota:** victoria `apoyo_pct >= 50` al día `365`; derrota `hambre_critica_pct > 50`.
- **Clima:** sin fenómenos fijos al día 1 (clima aleatorio desde día `22`); **[propuesta]** agregar una **sequía con aviso a mitad de año** en el preset para dar sentido estratégico a `silo` y `riego` (`ESCENARIOS §2`). *(En `presets/elecciones_simple.json` se usa `droughtPrueba`: intensidad `95`, día `140`, `90` días.)*

### 3.3 Preset `zombies` (Apocalipsis Zombie)

- **Reserva y stock inicial:** `$3.400`, `1.800` u. (18 días).
- **Piloto automático (`initialLevers`):** `impuesto = 40 %`, `salario_publico = 100 %`, `nivel_obras = 2`, `ayuda_social = 0`, `garantia_alimentaria = 85 %`, `precio_maximo = libre`, `comercio_exterior = 0 %`, `prensa = 12 $/per` (`tope_emision = 10 %` en M2).
- **Hitos con sus parcelas:**
  - `hito_estabilidad`: `hambre_critica_pct <= 15` durante `2` períodos → habilita `p_hito_este_1`.
  - `hito_prosperidad`: `poblacion_pct >= 80` durante `3` períodos → habilita `p_hito_este_2`.
- **Objetivo y derrota:** victoria **`poblacion_pct >= 70`** al día `180`; derrota `poblacion_pct < 40`.
- **Fenómenos iniciales (en `M1+`):**
  - Plaga principal: `intensidad` inicial `10`, `crecimiento_dia = 0,5`, `origen = "este"`, `duracion_dias = 185`, `aviso_dias = 0`.
  - Horda 1: día `55`, `duracion_dias = 12`, `intensidad = 65`, `origen = "oeste"`, `aviso_dias = 8`.
  - Horda 2: día `115`, `duracion_dias = 14`, `intensidad = 80`, `origen = "norte"`, `aviso_dias = 10`.

### 3.4 Criterios de arranque de un mundo (`ECONOMIA §12`)

Un mundo generado debe cumplir al día 1–7 sin intervención del jugador:
- Producción de alimento ≥ consumo × 1,05 (medido: `113,4 u/d` vs `100 u/d`).
- Stock inicial de 15 a 20 días (`elecciones`: 16 días; `zombies`: 18 días).
- Ingresos ≥ gastos totales × 1,10 (medido: ratio `1,16` en elecciones, `1,23` en zombies).
- Reserva ≥ 20 días de nómina (`elecciones`: `$4.800`; `zombies`: `$3.400`).
- Ningún rol vacío al arranque y todas las empresas arrancando con `ultima_ganancia` positiva y `factor = 1,0` (`alimento = $265,24`, `comercio = $347,88 / $312,86`).
- `lealtad` inicial heterogénea, y `apoyo_pct` inicial derivado del estado (no fijo).

---

## 4. Plan de simulación y pruebas

**Modo de prueba.** `npx tsx scripts/run_calibration.ts` corre simulación headless determinista con el director mecánico.

**Propiedades e invariantes verificadas:**
1. **Sensibilidad de controles y edificios:** cada palanca y obra pública mueve métricas visibles en dirección esperada (`apoyo`, `reserva`, `indicadores.*`, `hambre`, `precio`, `stock`, `empresa_recorte` / `empresa_despido` / `empresa_aumento`, `medios[].alcancePct`/`credibilidad`/`dependencia`).
2. **No-dominancia:** ningún nivel `0..5` de `nivel_obras`, ningún modo de `precio_maximo`, ningún despliegue defensivo ni ningún escalón de `comercio_exterior` domina estrictamente a los demás.
3. **Tramo de `objetivo_perdido` sin `derrota` en ambos escenarios:** existen políticas subóptimas que sobreviven hasta el plazo sin caer bajo el límite de derrota pero pierden el objetivo (`apoyo_pct < 50` al día 365 en elecciones; `40 <= poblacion_pct < 70` al día 180 en zombies).
4. **Determinismo e invariantes:** misma semilla → estado idéntico; conservación estricta de dinero (`invariantViolations = 0`), `reserva >= 0`, `stock >= 0`, variables en `[0, 100]`, límites del caos respetados.

---

## 5. Resultados de la última corrida de validación

Corrida sobre el código vigente (`npx tsx scripts/run_calibration.ts`, `M1 + G2`):

- **Determinismo, sistemas nuevos e invariantes:** `deterministic: true`, `newSystems.passed: true` (`G1` vs `G2`, demolición/reubicación hospitalaria, `silo`/`riego`/`hospital_campana` a 25 días, desbloqueo de parcela por hito, demanda con bloqueo y rechazo con medida), `invariantViolations: 0` en todas las corridas.
- **Elecciones — Línea base y respuestas a sequía (`intensidad 95, día 140, 90d` + caos):**
  - Base sin perturbación (`B_no_perturb`, n=10): **80 % victoria**, 20 % `objetivo_perdido`, 0 % derrota, 0 impagos, `prod/cons = 113,4 / 100`, `ingRatio7 = 1,16`, `apoyoEnd = 53,13 %`, `resEnd = $8.464,65` *(nota: registró `65` eventos `empresa_recorte`/`empresa_despido` acumulados en el año, ver §7)*.
  - Pasivo con sequía + caos (`C1_passive_drought`, n=10): **0 % victoria**, **100 % derrota**, `hambreEnd = 68,1 %`, `apoyoEnd = 3,71 %`.
  - Heurístico (`C2_heuristic_drought`, n=10): **0 % victoria**, **100 % `objetivo_perdido` sin derrota** (`hambreEnd = 0,8 %`, `apoyoEnd = 4,12 %`, `impagos = 142`, `nomImpagos = 0`).
  - Activo balanceado (`C3_active_balanced`, n=10): **20 % victoria**, **80 % `objetivo_perdido`**, 0 % derrota (`hambreEnd = 0 %`, `apoyoEnd = 26,18 %`, `resEnd = $1.568,28`).
- **Sensibilidad de palancas y edificios (n=8):**
  - `impuesto` (48 vs 28 %): Δ`apoyo` −67,82 pp, Δ`reserva` +$1.839,06.
  - `salario_publico` (120 vs 80 %): Δ`apoyo` +21,72 pp, Δ`reserva` −$486,46.
  - `nivel_obras` (N5 vs N0): Δ`ind.infraestructura` +76,2, Δ`stock` +65,06 u., Δ`reserva` −$599,39.
  - `ayuda_social` (4 vs 0 $/d): Δ`apoyo` +1,55 pp, Δ`reserva` −$705,50.
  - `garantia_alimentaria` (100 vs 0 %, liquidez baja): Δ`hambre` −19,63 pp, Δ`apoyo` +5,98 pp, Δ`reserva` −$301,31.
  - `precio_maximo` (`libre` vs `estricto`, sequía): Δ`precio` +$9,02, Δ`empResp` (`empresa_recorte`/`empresa_despido`) −13,75, Δ`stock` +2,17, Δ`hambre` −20,12 pp.
  - `comercio_exterior` (+100 vs −100 %): Δ`stock` +1.808,84 u., Δ`reserva` −$10.407,42, Δ`ganancia_alimento` −$736,66, Δ`precio` −$1,47.
  - `prensa` (45 vs 0 $/per): Δ`alcance` +55 pp, Δ`credibilidad` −5,6, Δ`dependencia` +36 pp, Δ`reserva` −$340,58.
  - `obra.comisaria` (+2 comisarías vs sin obra): Δ`ind.seguridad` +40,1, Δ`apoyo` +4,81 pp, Δ`reserva` −$523,42.
  - `obra.hospital` (+2 hospitales vs sin obra): Δ`ind.salud` +29,4, Δ`apoyo` +15,03 pp, Δ`reserva` −$593,14.
- **Zombies (`M1 + G2`, n=10):**
  - Pasivo (`Z_passive`): **30 % victoria**, **50 % `objetivo_perdido`**, 20 % derrota (`popEnd = 56 %`, `hambreEnd = 71,13 %`).
  - `+1 comisaria` (`Z_1comisaria`): **100 % victoria**, `popEnd = 99,1 %`, `hambreEnd = 19,53 %`, `resEnd = $3.339,07`.
  - `+2 comisarias + 1 muralla` con impuesto 43 % (`Z_2com_muralla_tax43`): **10 % victoria**, **90 % `objetivo_perdido`** (`popEnd = 59,2 %`, `hambreEnd = 91,41 %`, `ingRatio7 = 0,88`).
- **No-dominancia (n=5 por punto):**
  - *`nivel_obras` en elecciones (con sequía `75, d140, 70d`):* N0–1 terminan en **100 % derrota** (`hambreEnd 56–63 %`), N2 en **100 % `objetivo_perdido`** (`apoyo 29,04 %`), N3 en `40 %` victoria (`apoyo 38,84 %`), **N4 rinde óptimo (`80 %` victoria, `apoyo 44,4 %`, `$8.691,68`)** y N5 cae a `60 %` victoria (`$8.469,93`).
  - *Defensa en zombies:* `base` da `40 %` victoria / `20 %` `objetivo_perdido` / `40 %` derrota (`popEnd 55,8 %`); **`1_comisaria` logra 100 % victoria (`popEnd 98,2 %`)**; `2_comisarias` y `2_com_1_muralla` bajan a `80 %` victoria / `20 %` `objetivo_perdido` (`popEnd 83,6–83,8 %`) por el costo fiscal de obra y mantenimiento.
  - *`precio_maximo` con sequía prolongada (`80, d90, 90d`):* `libre` sufre `40 %` derrota / `60 %` `objetivo_perdido` (`apoyo 19,2 %`); **`moderado` evita la derrota (`100 % objetivo_perdido`, `0 %` derrota, `hambre 0 %`)**; `estricto` sostenido dispara `74` respuestas/despidos empresariales, vacía el stock (`minStock 0,13`) y termina en **100 % derrota (`hambreEnd 87,8 %`)**.
  - *`comercio_exterior` (90d):* −100 % sube la reserva a `$12.072,96` drenando stock (`minStock 439,43`) y apoyo (`28,36 %`); **−50 % equilibra (`apoyo 80,26 %`, `$10.288,48`, `minStock 1.489,05`)**; 0 % da `apoyo 68,24 %`; +50 % y +100 % sostienen stock (`1.594–1.600`) vaciando la reserva (`$179,26` con 5 impagos y `$0` con 35 impagos).

---

## 6. Informe de calibración

El detalle reproducible de corridas y comparaciones se ejecuta con `npx tsx scripts/run_calibration.ts` sobre `presets/elecciones_simple.json` y `src/data/catalogs.ts`.

---

## 7. Hallazgos y pendientes de calibración (agente de prototipo)

1. **Pruebas pendientes por orden de `HOJA_DE_RUTA §2`:** agregar al banco de pruebas automático corridas explícitas para **Paso 1 (`M0 + G0`, 30 días sin clima ni caos)** y **Paso 2 (`M0 + G1`, servicios + 3 palancas)** antes de reajustar `M1 + G2`. En la corrida actual sobre `M1`, `B_no_perturb` a 365 días mostró `65` eventos `empresa_recorte`/`empresa_despido`: conviene verificar en `M0 + G0` a 30 días que el arranque sea limpio (`0` recortes, `ECONOMIA §12`).
2. **Desfasajes menores detectados entre presets/código y docs:**
   - `presets/elecciones_simple.json` conserva `topesPrivados.obrero = 14`, mientras `src/data/catalogs.ts` ya usa `16` (`4` locales iniciales × `4` obreros).
   - En `elecciones` falta incorporar la sequía con aviso a mitad de año (`[propuesta]` de `ESCENARIOS §2`) cuando se pase a calibrar `M1 + G2`.
   - El interruptor `noticias_mueven_satisfaccion` (`CAOS_PRENSA §10`, `[pendiente de prueba]`) todavía no está cableado en `applyPressArticleEffects`.
   - En `elecciones` con sequía intensa (`C2`/`C3`), la política balanceada logra `0 %` de hambre crítica pero queda corta en `apoyoEnd` (`26,18 %`): revisar en la ronda `M1 + G2` el peso del precio/sequía sobre `satisfaccion` y `lealtad`.
