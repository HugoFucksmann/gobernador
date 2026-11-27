# Parámetros del mundo y del juego

> Referencia de implementación derivada únicamente de la documentación en `docs/`.
> Donde un valor numérico, rango o unidad no está fijado en los docs, se indica **Pendiente** (sin inventar valores). Lo marcado **[propuesta]** o **[pendiente de prueba]** refleja el estado actual de los documentos.

---

## Convenciones

- **Fuente de verdad:** `docs/*.md` (citados como `DOC §n`).
- **Parámetros sin número fijo en docs:** los documentos indican expresamente que no fijan números salvo ejemplos o valores de prototipo, y que los valores iniciales se calibran o viven en los presets (`README.md`, `ECONOMIA §16`, `ESCENARIOS §4`).
- **Valores de prototipo o ejemplo:** cuando un documento cita un número como valor de prototipo, ejemplo o rango de diseño, se consigna aclarando su carácter.
- **Unidades base frecuentes:**
  - Escala general de rasgos, variables de persona, indicadores de servicio y estado de edificios/vías: `0-100` (`MUNDO`, `MAPA §3`, `EDIFICIOS §2`).
  - Unidad básica de tiempo de simulación: `1` día de juego (`MOTOR §1`).

---

## Índice de parámetros nuevos (`README.md`)

Estos 12 parámetros fueron incorporados en las últimas revisiones de los documentos y se detallan también en su dominio correspondiente:

| Parámetro | Dominio | Propósito resumido | Valor / rango en docs | Fuente |
|---|---|---|---|---|
| `personas_por_zona` | Zonas / generación | Divisor de `poblacion_inicial` para calcular zonas activas iniciales (acotado entre `4` y `12` salvo que el preset suba el tope) | `25` (*valor inicial de prototipo, no decidido*; ejemplo: con 100 hab → 4 zonas; con 500+ → 8-12) | `MUNDO §8` |
| `reserva_min_dias` | Piloto automático | Piso de reserva (en días de gasto corriente) para subir impuesto y para frenar obras nuevas | `21` días (*valor inicial de prototipo, no decidido*) | `MUNDO §9` |
| `reserva_max_dias` | Piloto automático | Techo de reserva (en días de gasto corriente) sobre el cual el piloto automático baja `tasa_impuesto` | `55` días (*valor inicial de prototipo, no decidido*) | `MUNDO §9` |
| `tasa_min_auto` | Piloto automático | Límite inferior de `tasa_impuesto` dentro del cual opera el ajuste fiscal automático | `20` % (*valor inicial de prototipo, no decidido*) | `MUNDO §9` |
| `tasa_max_auto` | Piloto automático | Límite superior de `tasa_impuesto` dentro del cual opera el ajuste fiscal automático | `48` % (*valor inicial de prototipo, no decidido*) | `MUNDO §9` |
| `periodos_ajuste_fiscal` | Piloto automático | Cantidad de períodos entre cada paso de ajuste automático de `tasa_impuesto` | `2` períodos (*valor inicial de prototipo, no decidido*) | `MUNDO §9` |
| `pct_mant_max` | Piloto automático | % máximo de los ingresos del estado en el período que puede ocupar el mantenimiento total proyectado | `35` % (*valor inicial de prototipo, no decidido*) | `MUNDO §9`, `ECONOMIA §16`, `ALCANCE §5` |
| `n_constructoras_inicial` | Generación / economía | Cantidad mínima de firmas de rubro `construccion` creadas al iniciar el mundo | `1` firma (*valor inicial de prototipo, no decidido*) | `MUNDO §12` |
| `k_obra_directa` | Estado / construcción | Multiplicador de costo cuando el estado ejecuta obra directa por falta de constructoras con capacidad | `1.35` (*valor inicial de prototipo, no decidido*; restricción: `> 1`) | `ECONOMIA §10` |
| `k_dias_obra_directa` | Estado / construcción | Multiplicador de duración en días cuando el estado ejecuta obra directa | `1.4` (*valor inicial de prototipo, no decidido*) | `ECONOMIA §10` |
| `umbral_obra_sin_capacidad` | Economía / emprendimiento | Umbral de obra directa o demanda de obras sin atender que atrae emprendimientos de `construccion` | `2` obras directas/período (*valor inicial de prototipo, no decidido*) | `ECONOMIA §8` |
| `periodos_obra_sin_capacidad` | Economía / emprendimiento | Períodos consecutivos superando `umbral_obra_sin_capacidad` para contar como demanda no cubierta | `2` períodos (*valor inicial de prototipo, no decidido*) | `ECONOMIA §8` |

---

## 1. Motor, tiempo, escala y guardado

Fuentes: `MOTOR.md`, `MUNDO.md`, `ESCENARIOS.md`.

| Parámetro | Propósito y qué controla | Relación con el mundo | Unidad | Valor / rango / defecto en docs | Fuente |
|---|---|---|---|---|---|
| `periodo_dias` | Duración de un período económico (día de pago) | Cada `periodo_dias` corren: pagos del estado, sueldos y ganancias de firmas, alquileres, mantenimiento, mercados de vivienda y compras, quiebras, inversión/construcción, piloto automático, medios, notables e informe periódico | días | Pendiente (ver nota en §13 sobre "30 días" y "meses") | `MOTOR §1`, `ECONOMIA §1`, `LECTURA §4` |
| `periodo_dias_demografico` | Duración del período demográfico | Cada `periodo_dias_demografico` corren: parejas, nacimientos, independizaciones, separaciones y migración | días | Pendiente | `MOTOR §1`, `MOTOR §2`, `MUNDO §5` |
| `ventana_eventos_dias` | Retención detallada de eventos de alta frecuencia | Eventos como `ataque`, `golpe`, `internacion`, `alta`, `casa_estado` y cambios diarios de zona se guardan uno por uno durante estos días y luego se agregan por día y zona | días | Pendiente | `MOTOR §3` |
| `historial_max_dias` | Retención diaria de series históricas | Pasado este plazo, las series de `reserva`, `inflacion`, `satisfaccion_media`, `hambre_critica_pct`, `apoyo_pct`, `poblacion_pct`, `calle_pct`, `edad_media` y `cuota_mayor_pct` se compactan por semana | días | Pendiente | `MUNDO §11`, `MOTOR §5` |
| `poblacion_inicial` | Cantidad inicial de personas vivas del mundo | Determina escala de mapa (`lado`), cantidad inicial de zonas activas (`personas_por_zona`), denominadores base y tamaño del mundo | personas | Rango: `100` a `5.000`; defecto en panel: `100`; tamaños de prueba: `100`, `500`, `5.000` | `MUNDO §1`, `MUNDO §8`, `MOTOR §5`, `MAPA §8`, `ESCENARIOS §1` |
| `baldosas_por_hora` | Velocidad de desplazamiento de personas en su agenda diaria | Convierte costo de ruta en tiempo de viaje (`costo de ruta ÷ baldosas_por_hora`). Si excede la franja, la persona llega tarde y produce menos | baldosas / hora | `18` (valor del prototipo) | `MOTOR §7` |
| `p_habito` | Probabilidad de repetir un lugar habitual en tiempo libre | En tiempo libre, con probabilidad `p_habito` repite uno de sus `2-3` hábitos; si no, explora por gusto y cercanía | probabilidad (0-1) | Pendiente | `MOTOR §7` |
| `dias_descanso` | Días libres semanales por empleado en turnos locales **[propuesta]** | Define qué días de `dia % 7` el empleado no entra a turno y queda en tiempo libre | días / semana | `1-2` (valor del prototipo) | `MOTOR §7` |
| *Constantes fijas / de prototipo en `MOTOR`* | Reglas estructurales del motor | `7` días/semana; franjas prototipo: `noche` (00-06), `manana` (06-12), `mediodia` (12-14), `tarde` (14-19), `anochecer` (19-24); `cronotipo` en `[-2, +2]` h; cadena "¿por qué?" hasta `5` pasos; tope memoria IA + render `6 GB` VRAM | varios | Fijos / prototipo según texto | `MOTOR §1`, `§4`, `§7`, `MUNDO §2`, `§10` |

---

## 2. Mapa, terreno y red vial

Fuentes: `MAPA.md`, `MUNDO.md`.

| Parámetro | Propósito y qué controla | Relación con el mundo | Unidad | Valor / rango / defecto en docs | Fuente |
|---|---|---|---|---|---|
| `personas_por_zona` | Divisor para fijar zonas activas iniciales | `zonas_activas = clamp(round(poblacion_inicial ÷ personas_por_zona), 4, 12)` (salvo que el preset suba el tope, o perfil `minimo` de 1 zona). Se suman las zonas `no_urbanizada` del preset | personas / zona | Pendiente (ejemplo: 100 hab → 4 zonas; 500+ → 8-12) | `MUNDO §8`, `ALCANCE §5` |
| `nivel_agua` **[propuesta]** | Umbral de `altura` bajo el cual la baldosa es `agua` | Define costas, mares o lagos que solo se cruzan con `puente` | altura | Pendiente | `MAPA §3b` |
| `n_rios` **[propuesta]** | Cantidad de puntos altos desde los que nacen ríos | Cada río baja por máxima pendiente hasta agua o borde, con ancho de `1` a `2` baldosas | ríos | Pendiente | `MAPA §3b` |
| `umbral_montana` **[propuesta]** | Umbral de `altura` sobre el cual la baldosa es `montaña` | Bloquea construcción y cruce de vías (se rodea) | altura | Pendiente | `MAPA §3b` |
| `umbral_monte` **[propuesta]** | Umbral inferior de `altura` para terreno `monte` | Entre `umbral_monte` y `umbral_montana` (o con pendiente fuerte) es `monte`, encareciendo obras | altura | Pendiente | `MAPA §3b` |
| `area_minima_nucleo` **[propuesta]** | Área mínima de suelo plano contiguo para el núcleo inicial | Valida que las zonas activas y red inicial quepan en el mayor claro | baldosas | Pendiente | `MAPA §3b` |
| `suelo_minimo_pct` **[propuesta]** | % mínimo de `suelo` en el mapa para aceptar el terreno generado | Si no se cumple, se regenera con semilla derivada | % | Pendiente | `MAPA §3b` |
| `factor_monte` **[propuesta]** | Multiplicador de costo de obra sobre terreno `monte` | Multiplica el costo base de edificios y vías construidos en `monte` | factor | Pendiente | `MAPA §3b` |
| `factor_pendiente` **[propuesta]** | Multiplicador de costo de obra sobre pendiente fuerte | Multiplica el costo base de edificios y vías sobre pendiente fuerte | factor | Pendiente | `MAPA §3b` |
| `costo_puente_por_baldosa` **[propuesta]** | Costo base por baldosa de agua cruzada por un `puente` | `costo = costo_puente_por_baldosa × baldosas de cruce` | dinero / baldosa | Pendiente | `MAPA §3b` |
| `k_vial` | Penalización de costo de ruta por deterioro de la vía | `costo_baldosa = 1 × (1 + k_vial × (1 − estado/100))`. Con `estado = 0` es intransitable | factor | Pendiente | `MAPA §6` |
| `baldosas_por_persona` **[propuesta]** | Escala del mapa respecto a la población inicial | `lado = round(sqrt(poblacion_inicial × baldosas_por_persona ÷ suelo_util_pct))` (`suelo_util_pct` deriva del terreno generado) | baldosas / persona | Pendiente (tabla referencia: 100→48×48, 500→80×80, 5000→160×160; ver §13) | `MAPA §8` |
| `margen_lotes_residenciales` **[propuesta]** | Margen inicial de lotes residenciales libres | `lotes_residenciales = hogares × (1 + margen_lotes_residenciales)`, evitando calle inicial por falta de lotes | proporción | Pendiente (el preset contempla además ~`30 %` de suelo `sin_calle` para crecer) | `MAPA §8` |
| *Clases de lote* **[propuesta]** | Dimensiones fijas por clase de parcela | `S`: `2×2`, `M`: `3×3`, `L`: `4×4`, `XL`: `6×6` baldosas | baldosas | Definido en tabla de `MAPA §4` | `MAPA §4` |

---

## 3. Mundo: población, ciclo de vida, capacitación y migración

Fuentes: `MUNDO.md`, `ECONOMIA.md`.

| Parámetro | Propósito y qué controla | Relación con el mundo | Unidad | Valor / rango / defecto en docs | Fuente |
|---|---|---|---|---|---|
| `edad_fertil` | Rango de edad en el que una pareja puede tener hijos | Condición para tirar nacimiento cada `periodo_dias_demografico` | años | Pendiente | `MUNDO §5` |
| `umbral_natalidad` | Satisfacción mínima del hogar para intentar un nacimiento | Junto con lugar en casa y pareja en `edad_fertil` | escala 0-100 | Pendiente | `MUNDO §5` |
| `tope_natalidad` | Límite global de nacimientos por período demográfico | Único tope artificial sobre el crecimiento natural de la población | nacimientos / período demográfico | Pendiente | `MUNDO §5` |
| `edad_independizacion` | Edad mínima para que un hijo forme hogar propio | Requiere además ingreso suficiente y una casa libre que pueda pagar | años | Pendiente | `MUNDO §5` |
| `pct_alquiler_max` | % máximo del ingreso del hogar que tolera pagar en alquiler | Si el alquiler lo supera, el hogar se postula a casas libres en el mercado de vivienda | % | Pendiente | `MUNDO §4`, `ECONOMIA §7` |
| `periodos_sin_pagar_alquiler` | Períodos consecutivos de impago de alquiler antes del desalojo | Al alcanzarlo, emite `desalojo` y el hogar pasa a `calle` | períodos | Pendiente | `MUNDO §4`, `ECONOMIA §7` |
| `max_llegadas` **[propuesta]** | Máximo de hogares migrantes que llegan por período demográfico | Requiere casas libres y vacantes. `0` apaga la inmigración | hogares / período demográfico | Pendiente (`0` desactiva llegadas) | `MUNDO §5` |
| `dinero_migrante` **[propuesta]** | Dinero inicial que trae cada hogar migrante al llegar | Entra como dinero desde el exterior del mundo (`ECONOMIA §12`) | dinero / hogar | Pendiente | `MUNDO §5`, `ECONOMIA §12` |
| `periodos_para_emigrar` **[propuesta]** | Períodos en calle o con baja satisfacción sostenida para emigrar | Aplica a hogares sin casa propia ni partes de firma; su dinero sale del mundo | períodos | Pendiente | `MUNDO §5`, `ECONOMIA §12` |
| `umbral_emigrar` **[propuesta]** | Satisfacción bajo la cual un hogar sin casa propia ni partes puede emigrar | Debe sostenerse durante `periodos_para_emigrar` | escala 0-100 | Pendiente | `MUNDO §5` |
| `periodos_vacante_critica` | Períodos con puesto crítico vacante antes de disparar capacitación | Aplica cuando falta personal con el `educ_min` requerido (médico, docente, policía, ingeniero u otro) | períodos | Pendiente | `MUNDO §5` |
| `edad_max_capacitacion` | Edad máxima para que un adulto pueda capacitarse | Filtra candidatos adultos de aptitud alta (laboriosidad, resiliencia) | años | Pendiente | `MUNDO §5` |
| `periodos_capacitacion` | Duración de la capacitación | Mientras dura no trabaja; al finalizar sube `1` nivel de `educacion` hasta el tope que permiten escuelas/universidades al alcance | períodos | Pendiente | `MUNDO §5` |
| `costo_capacitacion` | Costo pagado por el hogar del adulto que se capacita | Se descuenta del hogar (`capacitacion_inicio`) | dinero | Pendiente | `MUNDO §5` |
| `tecnicos_por_agricultor` | Tope de técnicos por agricultor en firmas `agro` | `técnicos_efectivos = min(técnicos, agricultores × tecnicos_por_agricultor)` | proporción | Pendiente | `MUNDO §7`, `ECONOMIA §5` |
| `max_pase_a_publico_por_periodo` | Máximo de empleados privados que pasan a puestos públicos por período | Solo ocurre cuando no hay desempleados calificados para la vacante pública | personas / período | Pendiente | `MUNDO §7` |
| `ruta_max_trabajo` | Costo máximo de ruta para buscar empleo | Limita las vacantes que considera un desempleado respecto a su hogar | costo de ruta | Pendiente | `MUNDO §7`, `§8` |
| `max_pase_desempleo_por_dia` | Ritmo diario máximo de pase a `desempleado` al bajar puestos o despedir | Limita despidos diarios por reducción de puestos, recorte bajo piso salarial o quiebra | personas / día | Pendiente | `MUNDO §7`, `ECONOMIA §5`, `§9` |
| `k_traslado` **[propuesta]** | Penalización de productividad por costo de ruta casa-trabajo | Reduce productividad de quien tiene traslado largo o vía deteriorada | factor | Pendiente | `MUNDO §8`, `MOTOR §7` |
| *Constantes fijas de `MUNDO`* | Reglas etarias y educativas | Menor `< 18`, adulto `18-64`, jubilado `>= 65`; egreso a los `18` (ver §13 sobre rol `estudiante` `[0, 24]`); `educacion`: `0` sin estudios, `1` básico, `2` medio, `3` superior | años / nivel | Fijas en reglas | `MUNDO §2`, `§5`, `§7` |

---

## 4. Mundo: salud, clima, servicios y seguridad

Fuentes: `MUNDO.md`, `ESCENARIOS.md`.

| Parámetro | Propósito y qué controla | Relación con el mundo | Unidad | Valor / rango / defecto en docs | Fuente |
|---|---|---|---|---|---|
| `k_vulnerabilidad` | Multiplicador de daño por golpe para menores y mayores de 65 | Aumenta el daño de golpes de `pandemia` o `plaga_zombie` en esos grupos etarios | factor | Pendiente | `MUNDO §6` |
| `umbral_hospital` | Nivel de salud bajo el cual una persona solicita cama de hospital | Prioriza internación a menor salud en el hospital con cama libre más cercano | escala 0-100 | Pendiente | `MUNDO §6` |
| `pacientes_por_medico` | Camas habilitadas por cada médico en un hospital | `camas = min(camas_por_hospital, médicos × pacientes_por_medico)` | camas / médico | Pendiente | `MUNDO §6`, `EDIFICIOS §3` |
| `cura_base` | Curación diaria base de un paciente internado | Cura diaria = `cura_base × (0,5 + 0,5 × indicador_salud/100)` (mitad en `hospital_campana`) | salud / día | Pendiente | `MUNDO §6`, `EDIFICIOS §5` |
| `alta` | Nivel de salud al que el paciente recibe el alta hospitalaria | Sale cuando `salud >= alta` | escala 0-100 | Pendiente | `MUNDO §6` |
| `cura_natural` | Curación diaria de quien no está internado | Aplica si el hambre está bajo su umbral; se frena si está en `calle` | salud / día | Pendiente | `MUNDO §6` |
| `duelo` | Caída de satisfacción en hogar y zona por cada muerte | Se aplica como modificador al ocurrir una muerte | satisfacción | Pendiente | `MUNDO §6` |
| `culpa` | Caída de lealtad en toda la ciudad por muerte evitable | Aplica si murió esperando cama, por hambre crítica o por golpe zombie (no aplica a mortalidad por edad) | lealtad | Pendiente | `MUNDO §5`, `§6` |
| `exposicion_max` | Probabilidad diaria base máxima de ataque de un fenómeno con daño | `P(exposición) = exposicion_max × (intensidad/100) × atenuacion^distancia` | probabilidad (0-1) | Pendiente | `MUNDO §9` |
| `atenuacion` | Factor de atenuación espacial por distancia entre zonas | Modula probabilidad de ataque y miedo por `plaga_zombie` según `atenuacion^distancia` | factor (0-1) | Pendiente | `MUNDO §9`, `§10` |
| `proteccion_max` | Probabilidad máxima por zona de repeler un ataque con protección | Cada zona del camino repele con `proteccion_max × (defensa/100)` | probabilidad (0-1) | Pendiente | `MUNDO §9` |
| `dano` | Daño a la salud cuando un golpe supera las defensas | Se sortea dentro de `dano` y se multiplica por `k_vulnerabilidad` según edad | salud (rango o monto) | Pendiente | `MUNDO §9` |
| `movilidad_defensa` (`c`) | Peso de la distribución policial en la defensa por zona | `defensa_base = seguridad × (1 − c + c × n × parte)` donde `parte = policías_zona ÷ policías_totales` | factor (0-1 esperado) | Pendiente | `MUNDO §9` |
| `k_integridad` | Penalización a la defensa de zona cuando baja su integridad | Factor `× (1 − k_integridad × (1 − integridad/100))` | factor | Pendiente | `MUNDO §9` |
| `objetivo_orden` | Ratio policías/población necesario para alcanzar orden 100 | `orden = min(100, 100 × (policías_zona ÷ población_zona) ÷ objetivo_orden)` | policías / habitante | Pendiente | `MUNDO §9` |
| `dano_integridad` | Pérdida de integridad de zona por cada golpe de `plaga_zombie` | Reduce `integridad` (arranca en `100`) y con ello reduce `defensa` | integridad / golpe | Pendiente | `MUNDO §9` |
| `rep_por_npc` | Reparación diaria de integridad de zona por cada reparador | `reparación = rep_por_npc × reparadores × (0,5 + 0,5 × infraestructura/100)` | integridad / día / reparador | Pendiente | `MUNDO §9` |
| *Umbrales comunitarios derivados* | Definiciones fijas de métricas derivadas | `apoyo_pct`: electores (≥ 18) con `lealtad >= 50`; `descontentos_pct`: `satisfaccion < 30`; `hambre_critica_pct`: `hambre > 80` | escala 0-100 | Fijos en `MUNDO §11` | `MUNDO §11` |

---

## 5. Economía: hogares, firmas, mercado de comida y bienes

Fuentes: `ECONOMIA.md`, `CONTROLES.md`.

| Parámetro | Propósito y qué controla | Relación con el mundo | Unidad | Valor / rango / defecto en docs | Fuente |
|---|---|---|---|---|---|
| `pension_base` | Ingreso por período de cada jubilado | Pagado por el estado el día de pago (exento de impuesto; calibrado en arranque) | dinero / período | Pendiente (calibrado por generador) | `ECONOMIA §3`, `§16` |
| `k_riqueza` | Fracción diaria del excedente sobre el colchón que va a gasto de vida | `gasto_vida += k_riqueza × max(0, dinero − colchón)` | proporción / día | Pendiente | `ECONOMIA §3` |
| `colchon_dias` | Días de gasto en comida que forman el colchón del hogar | `colchón = colchon_dias × gasto diario en comida` | días | Pendiente | `ECONOMIA §3` |
| `recargo_calle` | Sobrecosto de la comida para hogares en estado `calle` | Encarece las compras diarias de comida cuando no hay casa ni despensa | factor o % | Pendiente | `ECONOMIA §3` |
| `parte_sueldos` | Proporción de ventas destinada al fondo de sueldos de la firma | `fondo_sueldos = parte_sueldos × ventas` (calibrado en arranque) | proporción | Pendiente (calibrado por generador) | `ECONOMIA §5`, `§16` |
| `max_contrataciones_por_periodo` | Tope de nuevas contrataciones por firma en un día de pago | Limita cuánto crece la plantilla de una firma por período | personas / período | Pendiente | `ECONOMIA §5` |
| `factor_max` | Techo del `factor` salarial (`fondo ÷ sueldos de referencia`) | Limita cuánto pueden subir los sueldos respecto a la referencia | factor | Pendiente | `ECONOMIA §5` |
| `pct_reinversion` | % de la ganancia (`ventas − sueldos`) retenido en la `caja` de la firma | El resto se reparte entre dueños según `partes` (si no hay dueños, queda 100 % en `caja`) | % | Pendiente | `ECONOMIA §5` |
| `piso_sueldo_pct` | Umbral mínimo de `factor` antes de despedir | Si `factor < piso_sueldo_pct / 100`, despide excedentes al ritmo `max_pase_desempleo_por_dia` | % | Pendiente | `ECONOMIA §5` |
| `k_tecnificacion` | Bono de producción `agro` por cada técnico efectivo | `producción = Σ prod_agricultor × (prod/100) × (1 + k_tecnificacion × técnicos_efectivos)` | factor / técnico | Pendiente | `ECONOMIA §5` |
| `pct_publicidad` | % de ventas que cada firma (salvo `medio`) paga en publicidad | Se reparte entre medios según `alcance × credibilidad` (calibrado en arranque) | % | Pendiente (calibrado por generador) | `ECONOMIA §5`, `§16` |
| `silo_dias` | Tope base de `stock` por firma `agro` en días de consumo de la zona | El excedente sobre `silo_dias` (+ `silo_extra_dias` por silo) se pierde | días | Pendiente | `ECONOMIA §6` |
| `objetivo_base_dias` | Objetivo base de días de comida en despensa del hogar | Multiplicado por `1 + k_prudencia × (1 − valentía/100) + k_miedo × miedo/100` | días | Pendiente | `ECONOMIA §6` |
| `k_prudencia` | Ponderador de prudencia (`1 − valentía/100`) en objetivo de despensa | Sube la despensa objetivo en personas menos valientes | factor | Pendiente | `ECONOMIA §6` |
| `k_miedo` | Ponderador del `miedo` en objetivo de despensa | Genera corridas de compra cuando sube el miedo | factor | Pendiente | `ECONOMIA §6` |
| `despensa_max_dias` | Techo máximo de días de comida en la despensa de un hogar | Acota el objetivo de despensa (incluido el efecto de `acapara`) | días | Pendiente | `ECONOMIA §6` |
| `umbral_recompra_dias` | Días de despensa bajo los cuales el hogar sale a recomprar comida | Cuando `despensa < umbral_recompra_dias`, recompra hasta su objetivo | días | Pendiente | `ECONOMIA §6` |
| `margen_comercial_pct` | % de margen que retiene `comercio` sobre ventas de comida o bienes | Reparte el cobro entre comercio y `agro` / `industria` | % | Pendiente | `ECONOMIA §6`, `§6b` |
| `precio_base` | Precio base de referencia de la comida | Base de `precio de mercado`, `precio externo` y multiplicadores de `tope_precio` (calibrado en arranque) | dinero | Pendiente (calibrado por generador) | `ECONOMIA §6`, `§11`, `§16`, `CONTROLES §2` |
| `umbral_poder_precio` | `cuota_zona` desde la cual una firma gana poder de mercado | Dispara aumento de `margen_poder`, evento `monopolio` y posible `boicot` | cuota (0-1 o %) | Pendiente | `ECONOMIA §6`, `§9`, `CAOS_PRENSA §3` |
| `margen_max` | Techo del `margen_poder` por monopolio en una zona | Limita el recargo máximo de precio por concentración | proporción / factor | Pendiente | `ECONOMIA §6`, `§9` |
| `pct_retencion` | Fracción del stock diario que vende `agro` bajo medida `retencion_stock` | Reduce oferta efectiva diaria y eleva precio por escasez | % o fracción | Pendiente | `ECONOMIA §6`, `ACTORES §3` |
| `k_lujo` **[propuesta]** | Desplazamiento de pesos de gasto de vida hacia gastronomía/entretenimiento por riqueza | Reduce peso relativo de bienes básicos en hogares de mayor ingreso y dinero | factor | Pendiente | `ECONOMIA §6b` |
| `intercambio_por_comerciante` | Capacidad diaria de comercio exterior por cada comerciante | `capacidad_diaria = comerciantes × intercambio_por_comerciante` | unidades / día / comerciante | Pendiente | `ECONOMIA §11` |
| `stock_min_exportar_dias` | Piso de días de stock bajo el cual `agro` e `industria` no exportan | Evita que la exportación vacíe el stock mínimo local | días | Pendiente | `ECONOMIA §11` |

---

## 6. Economía: vivienda, suelo, construcción, compras y quiebras

Fuentes: `ECONOMIA.md`, `MUNDO.md`, `CAOS_PRENSA.md`.

| Parámetro | Propósito y qué controla | Relación con el mundo | Unidad | Valor / rango / defecto en docs | Fuente |
|---|---|---|---|---|---|
| `alquiler_base` | Alquiler base de referencia de una casa | `alquiler = alquiler_base × (estado/100) × índice_demanda_zona` (calibrado en arranque) | dinero / período | Pendiente (calibrado por generador) | `ECONOMIA §7`, `§16` |
| `paso_alquiler` | Reducción de alquiler por período cuando una casa libre no tiene postulantes | Ajusta el precio hacia abajo hasta encontrar inquilino | dinero o % / período | Pendiente | `ECONOMIA §7` |
| `multiplo_casa` | Múltiplo del alquiler anual para precio de compra de una casa | `precio_casa = multiplo_casa × alquiler_anual` | múltiplo | Pendiente | `ECONOMIA §7` |
| `periodos_para_invertir` | Períodos con `factor > 1` requeridos para que una firma expanda locales/campos | Exige además `caja` suficiente y parcela libre | períodos | Pendiente | `ECONOMIA §8` |
| `ahorro_min_emprender` | Ahorro mínimo personal para fundar una firma chica | Junto con alta `propension_emprender` en adulto y demanda no cubierta | dinero | Pendiente | `ECONOMIA §8` |
| `periodos_recupero` | Horizonte de retorno esperado del alquiler para construir vivienda nueva | Condiciona inversión de constructoras/inmobiliarias cuando sube calle o hacinamiento | períodos | Pendiente | `ECONOMIA §8` |
| `umbral_obra_sin_capacidad` | Umbral de obra directa o demanda de obras sin atender | Superarlo durante `periodos_obra_sin_capacidad` cuenta como demanda no cubierta de `construccion` y atrae emprendimientos | Pendiente (no precisa si es cantidad, monto o ratio) | Pendiente | `ECONOMIA §8` |
| `periodos_obra_sin_capacidad` | Períodos consecutivos superando `umbral_obra_sin_capacidad` | Evita que un pico puntual de un solo período dispare apertura de constructoras | períodos | Pendiente | `ECONOMIA §8` |
| `precio_base_lote`[clase] **[propuesta]** | Precio base del suelo público `libre` por clase (`S`, `M`, `L`, `XL`) | Base de `precio_lote = precio_base_lote[clase] × (1 + k_acceso × accesibilidad)`; el pago entra a la `reserva` | dinero (por clase) | Pendiente | `ECONOMIA §8` |
| `k_acceso` **[propuesta]** | Ponderador de accesibilidad al centro comercial en el precio del lote | `accesibilidad` va de `0` a `1` según cercanía por ruta | factor | Pendiente | `ECONOMIA §8` |
| `multiplo_compra` | Múltiplo sobre ganancia media para valuar una firma en oferta de compra | `precio = multiplo_compra × ganancia_media(periodos_valuacion)` | múltiplo | Pendiente | `ECONOMIA §9` |
| `periodos_valuacion` | Cantidad de períodos usados para promediar la ganancia de una firma | Si ganancia media es 0, se valúa por múltiplo de caja y valor de locales | períodos | Pendiente | `ECONOMIA §9` |
| `max_compras_por_periodo` | Tope de compras de firmas por comprador en un mismo día de pago | Frena adquisiciones en cadena en un solo período | compras / período | Pendiente | `ECONOMIA §9` |
| `periodos_para_quebrar` | Períodos consecutivos con `caja < 0` tras los cuales una firma o medio quiebra | Dispara despidos, pérdida de partes, liquidación de caja, liberación/remate de locales | períodos | Pendiente | `ECONOMIA §9`, `CAOS_PRENSA §7` |
| `caja_max_sin_dueno` | Techo de `caja` de una firma sin dueño | El excedente sobre este límite pasa a la `reserva` del estado | dinero | Pendiente | `ECONOMIA §9` |
| `n_constructoras_inicial` | Mínimo de firmas de `construccion` creadas al generar el mundo | Se crean con su oficina y capacidad de obra para el primer año | firmas | Pendiente | `MUNDO §12` |

---

## 7. Estado, piloto automático y extensión `fiscal`

Fuentes: `MUNDO.md`, `ECONOMIA.md`, `CONTROLES.md`, `PALANCAS_MINIMAS.md`.

| Parámetro | Propósito y qué controla | Relación con el mundo | Unidad | Valor / rango / defecto en docs | Fuente |
|---|---|---|---|---|---|
| `estado_automatico` | Interruptor del piloto automático del estado en el preset | Encendido (`true`) sin gobernador (`G0`); apagado (`false`) cuando entra el gobernador (`G1-G3`). Habilita ajuste fiscal, freno de obra, servicios y vías automáticos | booleano | `true` en piloto automático / `false` con gobernador | `MUNDO §9`, `CONTROLES §1`, `PALANCAS_MINIMAS §7` |
| `reserva_min_dias` | Reserva mínima objetivo en días de gasto corriente | (1) Ajuste fiscal: si hay impago o `reserva < reserva_min_dias` de gasto corriente, sube `tasa_impuesto` un paso. (2) Freno de obra: impide ordenar obra si tras pagarla la reserva queda bajo este piso | días (de gasto corriente) | Pendiente | `MUNDO §9` |
| `reserva_max_dias` | Reserva máxima objetivo en días de gasto corriente | Si `reserva > reserva_max_dias` de gasto corriente, el ajuste fiscal baja `tasa_impuesto` un paso | días (de gasto corriente) | Pendiente | `MUNDO §9` |
| `tasa_min_auto` | Piso de `tasa_impuesto` para el piloto automático | Acota por abajo el ajuste fiscal automático | % | Pendiente | `MUNDO §9` |
| `tasa_max_auto` | Techo de `tasa_impuesto` para el piloto automático | Acota por arriba el ajuste fiscal automático; si al tope persiste impago, indica problema de calibración | % | Pendiente | `MUNDO §9` |
| `periodos_ajuste_fiscal` | Cadencia mínima entre cambios automáticos de `tasa_impuesto` | Limita la frecuencia de movimiento fiscal a un paso cada `periodos_ajuste_fiscal` | períodos | Pendiente | `MUNDO §9` |
| `pct_mant_max` | % máximo de ingresos del estado permitido para mantenimiento proyectado | Freno de obra: no ordena obras si el mantenimiento total (edificios + vías) proyectado supera `pct_mant_max` de los ingresos del estado en el período | % | Pendiente | `MUNDO §9`, `ECONOMIA §16`, `ALCANCE §5` |
| `umbral_demanda_suelo` **[propuesta]** | Umbral de demanda de suelo (`demanda ÷ parcelas_libres`) por zona y tipo | Superarlo sostenidamente dispara construcción automática de vías | proporción | Pendiente | `MUNDO §9` |
| `periodos_demanda_suelo` **[propuesta]** | Períodos consecutivos superando `umbral_demanda_suelo` | Confirma necesidad persistente antes de construir calle, camino o puente | períodos | Pendiente | `MUNDO §9` |
| `k_obra_directa` | Multiplicador de costo de obra directa estatal | Si no hay constructora con capacidad libre, el estado ejecuta con `costo × k_obra_directa`, repartido como jornales a hogares con adultos desempleados | factor | Pendiente (restricción: `> 1`) | `ECONOMIA §10` |
| `k_dias_obra_directa` | Multiplicador de días de duración de obra directa estatal | Aplica `dias × k_dias_obra_directa` cuando el estado ejecuta por su cuenta | factor | Pendiente | `ECONOMIA §10` |
| `tope_emision_pct` | Tope de emisión monetaria autorizado (extensión `fiscal`, M4) | Con saldo negativo y M4 activo, el estado emite antes del impago hasta `tope_emision_pct` de los ingresos | % de ingresos | Pendiente | `ECONOMIA §14`, `CONTROLES §2` |

---

## 8. Edificios y obras

Fuentes: `EDIFICIOS.md`, `ECONOMIA.md`, `MUNDO.md`.

| Parámetro | Propósito y qué controla | Relación con el mundo | Unidad | Valor / rango / defecto en docs | Fuente |
|---|---|---|---|---|---|
| `cap_chica` | Capacidad máxima de personas de `casa_chica` | Define umbral de hacinamiento y tamaño de hogar alojable | personas | Pendiente | `EDIFICIOS §2` |
| `cap_mediana` | Capacidad máxima de personas de `casa_mediana` | Define umbral de hacinamiento | personas | Pendiente | `EDIFICIOS §2` |
| `cap_grande` | Capacidad máxima de personas de `casa_grande` | Define umbral de hacinamiento | personas | Pendiente | `EDIFICIOS §2` |
| `dias_obra_casa` | Duración de obra para construir una casa | Acortada por `infraestructura` | días | Pendiente | `EDIFICIOS §2` |
| `camas_por_hospital` | Capacidad máxima de camas de un `hospital` | Tope físico de internados; efectivo = `min(camas_por_hospital, médicos × pacientes_por_medico)` | camas | Pendiente | `EDIFICIOS §3` |
| `lugares_por_escuela` | Cupo de cobertura educativa nivel 2 de una `escuela` | Habilita `educacion = 2` al egresar a los 18 si hay lugar al alcance por ruta | lugares | Pendiente | `EDIFICIOS §3` |
| `lugares_por_universidad` | Cupo de cobertura educativa nivel 3 de una `universidad` | Habilita `educacion = 3` al egresar a los 18 si hay lugar al alcance por ruta | lugares | Pendiente | `EDIFICIOS §3` |
| `bonus_defensa` | Bono fijo de defensa zonal por cada `comisaria` | Se suma a `defensa` de la zona (modulada luego por `integridad`) | puntos de defensa | Pendiente | `EDIFICIOS §3`, `MUNDO §9` |
| `puestos_por_campo` | Cantidad de agricultores por cada `campo` (`agro`) | Determina vacantes y tope de producción | puestos | Pendiente | `EDIFICIOS §4` |
| `puestos_por_fabrica` | Cantidad de obreros y técnicos por cada `fabrica` (`industria`) | Determina vacantes y capacidad productiva de bienes | puestos | Pendiente | `EDIFICIOS §4` |
| `puestos_por_almacen` | Cantidad de obreros por cada `almacen` (`comercio`) | Más `1` comerciante fijo por almacén | puestos | Obreros: Pendiente; comerciante: `1` | `EDIFICIOS §4` |
| `dias_obra_local` | Duración de obra de un local privado | Acortada por `infraestructura` | días | Pendiente | `EDIFICIOS §4` |
| `defensa_muralla` | Bono de defensa zonal otorgado por una `muralla` (obra de suceso) | Permanente; se daña con la integridad de la zona | puntos de defensa | Pendiente | `EDIFICIOS §5` |
| `silo_extra_dias` | Días adicionales de tope de stock por cada `silo` (obra de suceso) | Permanente; se suma a `silo_dias` contra `sequia` y `plaga` | días | Pendiente | `EDIFICIOS §5`, `ECONOMIA §6` |
| `camas_campana` | Camas del `hospital_campana` (obra de suceso) | No requiere médicos; cura a la mitad de `cura_base` de un hospital | camas | Pendiente | `EDIFICIOS §5`, `MUNDO §6` |
| `dias_campana` | Duración del `hospital_campana` antes de desarmarse solo | Temporal contra `pandemia` | días | Pendiente | `EDIFICIOS §5` |
| *Efecto de `riego`* | Obra de suceso permanente contra `sequia` | Reduce a la mitad (`50 %`) la caída de producción por sequía | proporción | Fijo (`0,5×` caída) | `EDIFICIOS §5` |

---

## 9. Caos, acciones, medios y noticias

Fuentes: `CAOS_PRENSA.md`, `ACCIONES.md`.

| Parámetro | Propósito y qué controla | Relación con el mundo | Unidad | Valor / rango / defecto en docs | Fuente |
|---|---|---|---|---|---|
| `k_orden` | Freno del `orden` de la zona sobre el contagio espontáneo | `p_contagio = contagio × exposición × (1 − k_orden × orden/100) × (1 − k_satisfaccion × satisfacción/100) × k_contagio_global × afinidad` | factor | Pendiente | `CAOS_PRENSA §4` |
| `k_satisfaccion` | Freno de la `satisfaccion_media` de la zona sobre el contagio espontáneo | Reduce el contagio en zonas satisfechas | factor | Pendiente | `CAOS_PRENSA §4` |
| `max_pct_rol_fuera_de_puesto` | % máximo de un rol que puede quedar `fuera_de_puesto` | Frena solo al caos espontáneo (las acciones de condición ocupan cupo pero no se frenan) | % | Pendiente | `CAOS_PRENSA §3`, `§5`, `§6` |
| `max_pct_despensa_cedida` | % máximo de despensa cedida por día en efecto `comparte` | Acota la cesión solidaria diaria de comida entre vecinos | % / día | Pendiente | `CAOS_PRENSA §5` |
| `max_ocupaciones_por_periodo` | Tope de ocupaciones de casas vacías (`ocupa`) por período | Acota la acción de condición `ocupacion` | ocupaciones / período | Pendiente | `CAOS_PRENSA §5` |
| `max_pct_hogares_boicot` | % máximo de hogares participando en `boicotea` | Acota la acción de condición `boicot` | % | Pendiente | `CAOS_PRENSA §5` |
| `ofertas_por_dia` | Cantidad diaria de personas a las que el director ofrece acciones | Actúa mientras queden focos en el período y no haya respiro | personas / día | Pendiente | `CAOS_PRENSA §6` |
| `k_extremo` **[propuesta]** | Peso por cada rasgo extremo (`< 20` o `> 80`) al sortear persona | En `interés = 1 + k_extremo × ...` | peso | Pendiente | `CAOS_PRENSA §6` |
| `k_descontento` **[propuesta]** | Peso adicional si `satisfaccion < 30` al sortear persona | Aumenta probabilidad de recibir foco de caos | peso | Pendiente | `CAOS_PRENSA §6` |
| `k_reciente` **[propuesta]** | Peso adicional por modificador reciente (familia o bienes) | Incluye nacimiento, muerte familiar, desalojo, quiebra, herencia, compra | peso | Pendiente | `CAOS_PRENSA §6` |
| `candidatas_max` | Tope de acciones candidatas evaluadas por el director para una persona | Se sortean por peso entre las que cumplen requisitos, contexto y hogar | acciones | Pendiente | `CAOS_PRENSA §6` |
| `k_afinidad` **[propuesta]** | Peso de afinidad por rasgo al puntuar acciones candidatas | Multiplicador `1 + k_afinidad × (rasgo_efectivo − 50)/50` por signo | factor | Pendiente | `CAOS_PRENSA §6` |
| `max_acciones_por_periodo` | Tope de focos espontáneos elegidos por el director en `periodo_dias_caos` | No incluye contagiados ni acciones de condición | acciones / período | Pendiente | `CAOS_PRENSA §3`, `§4`, `§6` |
| `periodo_dias_caos` | Duración en días del período de conteo del caos | Ventana de `max_acciones_por_periodo` | días | Pendiente | `CAOS_PRENSA §6` |
| `duracion_max_dias` | Tope máximo de duración en días de cualquier acción espontánea | Acota `duracion_dias` de la tabla de acciones | días | Pendiente | `CAOS_PRENSA §6` |
| `respiro_si_satisfaccion_media_menor_a` | Umbral bajo el cual el caos espontáneo se detiene (respiro) | Frena el director cuando la comunidad está al borde | escala 0-100 | Pendiente | `CAOS_PRENSA §6` |
| `k_linea` **[propuesta]** | Velocidad de ajuste de línea editorial al cambiar de dueños | Mueve `afinidad_gobierno` y `sensacionalismo` de a poco por período | tasa / período | Pendiente | `CAOS_PRENSA §7` |
| `umbral_dependencia_pct` | % de dependencia estatal sobre el cual cae la credibilidad del medio | `dependencia = fondos_estado ÷ (publicidad + fondos)`; bajo él se recupera de a poco | % | Pendiente | `CAOS_PRENSA §7` |
| `relevancia_min` | Relevancia mínima de un evento para entrar a la cola de noticias del día | Filtra eventos menores antes de que publiquen los medios | relevancia | Pendiente | `CAOS_PRENSA §8` |
| `noticias_por_columnista` | Capacidad diaria de publicación por columnista vivo del medio | `capacidad_diaria = columnistas_vivos × noticias_por_columnista` | noticias / día / columnista | Pendiente | `CAOS_PRENSA §8` |
| `ventana_repeticion_dias` | Días dentro los cuales una noticia de igual tema y zona se considera repetida | Reduce peso de publicación e impacto del efecto | días | Pendiente | `CAOS_PRENSA §8` |
| `duracion_efecto_noticia` | Duración en días del modificador de una noticia sobre sus lectores | Decae con los días | días | Pendiente | `CAOS_PRENSA §8` |
| `max_efecto_noticias_dia` | Tope diario acumulado de efecto de noticias por persona | Evita bucles o saturación de modificadores mediáticos | puntos / día | Pendiente | `CAOS_PRENSA §8` |
| `max_pct_accion` | Criterio de prueba: % máximo de focos que puede acaparar una sola acción | Verificación automática sin IA | % | Pendiente | `CAOS_PRENSA §10` |
| `noticias_mueven_satisfaccion` **[pendiente de prueba]** | Interruptor para probar si las noticias modifican la satisfacción además de miedo/lealtad | Se apaga si duplica el efecto del hambre o del precio | booleano | Pendiente de prueba | `CAOS_PRENSA §10` |
| *Catálogo de 27 espontáneas y 6 de condición* **[propuesta]** | `duracion_dias` y `contagio` por acción | Cada acción define su rango `[min, max]` de días (espontáneas entre `1-2` y `3-8`; condición entre `2-5` y `3-10`) y tasa de contagio base (`0,02` a `0,30`) | días / 0-1 | Propuestos fila por fila en `ACCIONES §2` y `§3`; noticia `vecinos` desde `3` participantes (`CAOS_PRENSA §8`) | `ACCIONES §2`, `§3`, `CAOS_PRENSA §8` |

---

## 10. Lectura del mundo

Fuentes: `LECTURA.md`.

| Parámetro | Propósito y qué controla | Relación con el mundo | Unidad | Valor / rango / defecto en docs | Fuente |
|---|---|---|---|---|---|
| `ventana_referencia` **[propuesta]** | Ventana móvil para calcular `referencia` (mediana móvil) de cada indicador | Contexto propio del mundo contra el cual se evalúa el desvío | días / puntos | Pendiente | `LECTURA §2` |
| `umbral_atencion` **[propuesta]** | Desvío relativo contra `referencia` para estado `atencion` | Dispara cambio visual del indicador (con histéresis) | desvío relativo | Pendiente | `LECTURA §2` |
| `umbral_mal` **[propuesta]** | Desvío relativo contra `referencia` para estado `mal` | Dispara cambio a estado crítico y puede crear alerta | desvío relativo | Pendiente | `LECTURA §2` |
| `ventana_tendencia` **[propuesta]** | Ventana sobre la cual se calcula regresión lineal de tendencia | Determina `tendencia.dir` y `tendencia.magnitud` | días / puntos | Pendiente | `LECTURA §2` |
| `banda_estable` **[propuesta]** | Pendiente relativa bajo la cual la tendencia se clasifica `estable` | Evita marcar fluctuaciones menores como subida o bajada | pendiente relativa | Pendiente | `LECTURA §2` |
| `periodos_tendencia_mala` | Períodos manteniendo tendencia mala antes de crear alerta | Evita alertas prematuras | períodos | Pendiente | `LECTURA §3` |
| `enfriamiento_alerta_dias` | Días de enfriamiento para deduplicar alertas de mismo indicador y entidad | Impide repetición continua de alertas iguales | días | Pendiente | `LECTURA §3` |
| `alertas_visibles` | Tope de alertas simultáneas mostradas en el vistazo de la UI | El motor conserva la cola completa; la UI muestra hasta este máximo | alertas | `3` | `LECTURA §3` |
| `ventana_serie_dias` | Días en los que las series por indicador y zona se guardan con resolución diaria | Más atrás se agregan por período y por año | días | Pendiente | `LECTURA §4` |
| `notables_max` | Tope absoluto de personajes notables simultáneos | `tope = min(notables_max, notables_pct × población)` | personas | Pendiente | `LECTURA §5` |
| `notables_pct` | Porcentaje de la población usado como tope relativo de notables | Escala la lista de notables con el tamaño del mundo | proporción / % | Pendiente | `LECTURA §5` |
| `peso_alto` | Umbral de peso para entrar a la lista de notables | Aplica sobre `empresario` (cuota, empleados, caja) y `medio` (alcance × credibilidad) | peso | Pendiente | `LECTURA §5` |
| `peso_bajo` | Umbral inferior de peso bajo el cual un notable sale de la lista | Provee histéresis respecto a `peso_alto` | peso | Pendiente | `LECTURA §5` |
| `dias_min_notable` | Permanencia mínima en días tras entrar como notable | Evita rotación diaria de la lista de notables | días | Pendiente | `LECTURA §5` |
| *Constantes fijas en `LECTURA`* | Topes de resumen e informe | Hasta `3` `causas_top` por indicador; `3` cambios más importantes por informe periódico | conteo | Fijos en `LECTURA §2` y `§4` | `LECTURA §2`, `§4` |

---

## 11. Capa del gobernador: controles, palancas, actores y escenarios

Fuentes: `CONTROLES.md`, `GOBERNADOR.md`, `ACTORES.md`, `ESCENARIOS.md`.
*Nota:* los docs señalan que la capa del gobernador está pendiente de rediseño de palancas (`README.md`, `GOBERNADOR.md`, `PALANCAS_MINIMAS.md`) y que `ACTORES.md` completo es **[propuesta]**.

### Controles del mundo (`CONTROLES §2`, `GOBERNADOR §2`)

| Parámetro / Control | Propósito y qué controla | Unidad | Rango / valores definidos en docs | Fuente |
|---|---|---|---|---|
| `tasa_impuesto` | Impuesto sobre ingresos de hogares (salvo pensiones y ayuda social) | % sobre ingreso | Rango del preset pendiente (en piloto automático: `[tasa_min_auto, tasa_max_auto]`) | `CONTROLES §2`, `ECONOMIA §3`, `MUNDO §9` |
| `salario_publico` | Nivel salarial de empleados públicos | `%` del valor base (`salario_base_publico`) | Rango: `50` a `150` | `CONTROLES §2`, `GOBERNADOR §2` |
| `nivel_obras` | Fija `puestos[ingeniero]` y `operacion[obras]` a la vez | Nivel entero | `0` a `5` (cantidades de puestos y operación por nivel pendientes) | `CONTROLES §2`, `GOBERNADOR §2` |
| `ayuda_social` | Monto diario entregado a cada desempleado o jubilado | dinero / día | Rango y valor inicial pendientes | `CONTROLES §2`, `ECONOMIA §3` |
| `garantia_pct` | % del faltante de comida cubierto por el estado a adultos que no alcanzan a comprarla | % | Rango del preset pendiente (conceptual `0-100`) | `CONTROLES §2`, `ECONOMIA §6` |
| `tope_precio` | Límite máximo al precio de venta de comida de las firmas | Modo discreto | `libre` (sin tope), `moderado` (`1,25× precio_base`), `estricto` (`0,6× precio_base`) | `CONTROLES §2`, `ECONOMIA §6` |
| `flujo_exterior_pct` | Apertura/dirección del comercio exterior de comida respecto a capacidad diaria | % de capacidad | Rango: `−100` a `100`; palanca en 5 escalones: `−100, −50, 0, 50, 100` | `CONTROLES §2`, `GOBERNADOR §2` |
| `fondos_prensa` | Fondos del estado repartidos parejo entre los medios | dinero / período | Rango y paso pendientes | `CONTROLES §2`, `CAOS_PRENSA §7` |
| `tope_emision_pct` | Tope autorizado de emisión monetaria en M4 (`fiscal`) | % de los ingresos | Rango pendiente | `CONTROLES §2`, `ECONOMIA §14` |

### Demandas de actores (`ACTORES.md`, **[propuesta]**)

| Parámetro | Propósito y qué controla | Unidad | Valor en docs | Fuente |
|---|---|---|---|---|
| `dias_respuesta_demanda` | Plazo para aceptar o rechazar una demanda antes de vencer como rechazo | días | Pendiente | `ACTORES §1` |
| `dias_compromiso` | Días durante los cuales la palanca aceptada queda bloqueada (y duración de tono favorable en `silencio_pagado`) | días | Pendiente | `ACTORES §1`, `§3` |
| `dias_entre_demandas` | Enfriamiento mínimo entre dos demandas del mismo actor | días | Pendiente | `ACTORES §1` |
| `umbral_impuesto_demanda` | Tasa de impuesto sobre la cual los empresarios disparan `bajen_impuestos` | % | Pendiente (alternativa del disparador: `factor < 1` en alguna firma durante `2` períodos) | `ACTORES §3` |
| `despidos_medida` | *Reemplazado por `pct_despido_medida`* (sección 15) | — | — | `ACTORES §4` |
| `dias_medida` | Duración de las medidas `retencion_stock`, `sin_inversion` y `campana` | días | Pendiente | `ACTORES §3` |
| `umbral_pauta` | Nivel de dependencia bajo el cual un medio pide `mas_pauta` | % (o proporción) | Pendiente | `ACTORES §3` |

### Condiciones de escenario definidas (`ESCENARIOS.md`)

| Escenario | Condición de objetivo (victoria) | Condiciones de derrota | Notas paramétricas | Fuente |
|---|---|---|---|---|
| `Elecciones` | `apoyo_pct >= 50` al día `365` | `hambre_critica_pct > 50` o `poblacion_pct < 50` | Propuesta de `sequia` con aviso a mitad de año | `ESCENARIOS §2` |
| `Apocalipsis zombie` | `poblacion_pct >= 70` al día `180` | `poblacion_pct < 40` | Referencia de policías por población mayor que en otros escenarios | `ESCENARIOS §3` |

---

## 12. Parámetros referenciados en reglas sin identificador explícito

Los documentos mencionan los siguientes parámetros conceptuales (en catálogo, preset o calibración) sin asignarles todavía un nombre `parametro_en_codigo`:

- **Motor e IA (`MOTOR §1`, `§4`):** segundos reales por día, ticks por día, lista de velocidades de simulación, plazo límite (timeout) de respuesta de IA.
- **Ciclo de vida y salud (`MUNDO §5`, `§6`, `§10`):** curva diaria de mortalidad por edad, probabilidad base de separación de pareja, aptitud mínima para capacitación, tasa de deriva diaria de salud (por edad, por calle, por hambre), umbral de hambre crítica para daño diario (ver §13 respecto a `80`), tasa umbral del factor impositivo en productividad.
- **Servicios (`MUNDO §9`, `ESCENARIOS §3`):** profesionales de referencia por población para cada rol público (policía, médico, docente de escuela, docente de universidad), costo base de área por población, tasa de decaimiento de `seguridad`/`salud`/`infraestructura`, umbral de cobertura baja de policía/médico y sus recargos graduales de miedo/malestar, % diario de policías que se reubican.
- **Economía (`ECONOMIA §5`, `§6`, `§6b`, `§7`, `§8`, `§10`, `§11`, `§14`, `§16`):**
  - Rangos de sueldo de referencia `(min, max)` por cada rol y sueldo de gerente sin partes **[propuesta]**.
  - Curva/función de escasez de comida según días de stock.
  - Pesos base del gasto de vida (`bienes`, `gastronomia`, `servicios`, `entretenimiento`), precios externos de importación y diferencial de precio externo compra/venta.
  - Fórmula del índice de demanda de zona en alquiler **[propuesta]**.
  - Umbrales de `calle_pct` o hacinamiento que disparan construcción residencial; requisitos exactos de ahorro/caja para fundar un `medio`.
  - Costo diario de acogida de menores en estado `acogida`.
  - Parámetros de subida y decaimiento de inflación dinámica en `fiscal` (M4).
- **Mapa (`MAPA §3b`):** umbral de pendiente fuerte para `monte` y `factor_pendiente`.
- **Edificios y vías (`EDIFICIOS §2`, `§3`, `§3b`, `§4`, `§5`):** costo de obra, mantenimiento por período y tasa de deterioro de `estado` para casas, locales privados, edificios públicos y tramos de vía (`calle`, `camino`, `puente`); días de obra por edificio público y vía; puestos y capacidad diaria de ventas/producción/función de cada tipo de local privado y edificio público; costo y días de obra de obras de suceso.
- **Caos, acciones y prensa (`CAOS_PRENSA §3`, `§5`, `§8`, `ACCIONES §2`):**
  - Valores numéricos de intensidades `baja`, `media`, `alta` de los efectos.
  - Tope diario de comida en efecto `toma` (`saqueo`).
  - Umbrales disparadores de acciones de condición (`paro_firma`, `protesta`, `saqueo`, `ocupacion`, `boicot`) y umbrales de disparo de noticias (`hambre`, `precio`, `vivienda`), además de relevancia por tema y pesos de tono.
- **Lectura (`LECTURA §2`):** parámetro de histéresis de estado (`bien` / `atencion` / `mal`).
- **Actores y controles (`ACTORES §3`, `GOBERNADOR §2`, `§7`):** pasos fijos de palancas (`impuesto`, `prensa`), umbral de "stock cerca del tope del silo" en `abran_exportacion`, controles `presion` y `acceso` sobre prensa y contraofertas (nivel G3, sin especificación aún).

---

## 15. Parámetros agregados en la segunda revisión

Fuentes: `MUNDO.md`, `MAPA.md`, `CAOS_PRENSA.md`, `ACTORES.md`, `UI.md`, `CONTROLES.md`.

### Servicios por radio y cobertura (`MUNDO §9`)

| Parámetro | Propósito y qué controla | Relación con el mundo | Unidad | Valor / rango / defecto en docs | Fuente |
|---|---|---|---|---|---|
| `radio_escuela` | Radio de acción de una escuela, en pasos entre zonas | Fuera del radio el menor no estudia (tope de educación 1) | pasos de zona | `1` (*valor inicial de prototipo, no decidido*; 0 = solo su zona) | `MUNDO §9`, `EDIFICIOS §3` |
| `radio_universidad` | Radio de acción de una universidad | Fuera del radio el tope de educación es 2 | pasos de zona | `2` (*valor inicial de prototipo, no decidido*) | `MUNDO §9`, `EDIFICIOS §3` |
| `radio_hospital` | Radio de acción de un hospital | Fuera del radio nadie se interna: espera en casa sin cura asistida | pasos de zona | `1` (*valor inicial de prototipo, no decidido*) | `MUNDO §9`, `EDIFICIOS §3` |
| `radio_comisaria` | Radio dentro del cual los policías de una comisaría pueden destacarse y aportar presencia | Sin comisaría en el radio la cobertura policial de la zona es 0 | pasos de zona | `1` (*valor inicial de prototipo, no decidido*) | `MUNDO §9`, `EDIFICIOS §3` |
| `atenuacion_policia` | Peso con que un policía destacado en la zona y aporta a otra zona a distancia d: `atenuacion_policia^d` | Modela que tarden más en llegar | factor 0-1 | `0.55` (*valor inicial de prototipo, no decidido*) | `MUNDO §9` |
| `habitantes_por_policia` | Población que cubre un policía para cobertura policial 1 | `cobertura = presencia ÷ (población ÷ habitantes_por_policia)` | personas / policía | `25` (*valor inicial de prototipo, no decidido*) | `MUNDO §9` |
| `habitantes_por_<rol>` | Referencia de población por profesional para médico y docente (escuela y universidad) | Define la cobertura por zona de salud y educación | personas / profesional | `medico: 25`, `docente: 14`, `universidad: 18` (*valor inicial de prototipo, no decidido*) | `MUNDO §9` |
| `anios_pre_egreso` | Últimos años de menor que cuentan como población relevante de la universidad | Denominador de la cobertura universitaria | años | `4` (*valor inicial de prototipo, no decidido*) | `MUNDO §9` |
| `puestos_por_comisaria` | Cantidad máxima de policías que da una comisaría | Tope de policías por puesto | puestos | `4` (*valor inicial de prototipo, no decidido*) | `MUNDO §9`, `EDIFICIOS §3` |
| `cobertura_min` | Cobertura de zona bajo la cual el piloto automático construye un servicio y los actores piden `seguridad_en_mi_zona` | Dispara obras automáticas y demandas | 0-1 | `0.65` (*valor inicial de prototipo, no decidido*) | `MUNDO §9`, `ACTORES §4` |
| `k_miedo_sin_policia` | Recargo diario de miedo por cobertura policial baja | `k × (1 − cobertura policial)` | factor | `2.2` (*valor inicial de prototipo, no decidido*) | `MUNDO §9` |
| `k_malestar_sin_salud` | Recargo diario de malestar por cobertura médica baja | `k × (1 − cobertura médica)` | factor | `1.8` (*valor inicial de prototipo, no decidido*) | `MUNDO §9` |
| `umbral_hambre_critica` | Nivel de hambre sobre el cual hay daño diario y cuenta para `hambre_critica_pct` | Unifica el umbral de daño y el de indicador | escala 0-100 | `80` (definido por `MUNDO §11`) | `MUNDO §6`, `§11` |

### Estabilidad, colapso, mapa y UI (`MUNDO §14`, `MAPA §8`)

| Parámetro | Propósito y qué controla | Relación con el mundo | Unidad | Valor / rango / defecto en docs | Fuente |
|---|---|---|---|---|---|
| `escala_fenomenos` | Cuántos fenómenos de clima hay y qué tan intensos | Perilla de estabilidad | factor | `estable: 0.75`, `normal: 1.0`, `fragil: 1.25`, `extremo: 1.5` (*valor inicial de prototipo, no decidido*) | `MUNDO §14` |
| `holgura_inicial` | Holgura económica al arrancar: reserva, colchón de hogares, caja de firmas, producción sobre consumo | Perilla de estabilidad | factor | `estable: 1.25`, `normal: 1.0`, `fragil: 0.8`, `extremo: 0.65` (*valor inicial de prototipo, no decidido*) | `MUNDO §14` |
| `cobertura_inicial` | Qué tan cubierta de servicios arranca la ciudad | Perilla de estabilidad | 0-1 | `estable: 0.9`, `normal: 0.7`, `fragil: 0.55`, `extremo: 0.4` (*valor inicial de prototipo, no decidido*) | `MUNDO §14` |
| `n_rios` | Cantidad de ríos que genera el terreno | Perilla de territorio (aislamiento) | ríos | `normal: 2` (`1–3` por perfil; *valor inicial de prototipo, no decidido*) | `MAPA §3b`, `MUNDO §14` |
| `nivel_agua` | Altura bajo la cual el terreno es agua | Perilla de territorio | altura | `normal: 0.21` (`0.18–0.27` por perfil; *valor inicial de prototipo, no decidido*) | `MAPA §3b`, `MUNDO §14` |
| `pct_menores / pct_jubilados` | Composición de edades de la pirámide inicial | Perilla demográfica | % | `normal: 22% / 12%` (*valor inicial de prototipo, no decidido*) | `MUNDO §12`, `§14` |
| `umbral_colapso_poblacion` | `poblacion_pct` bajo el cual el mundo se considera colapsado | Define el evento `colapso` | % | `45` % (*valor inicial de prototipo, no decidido*) | `MUNDO §14` |
| `umbral_colapso_hambre` | `hambre_critica_pct` sobre el cual el mundo se considera colapsado | Define el evento `colapso` | % | `55` % (*valor inicial de prototipo, no decidido*) | `MUNDO §14` |
| `umbral_colapso_descontento` | `descontentos_pct` sobre el cual el mundo se considera colapsado | Define el evento `colapso` | % | `75` % (*valor inicial de prototipo, no decidido*) | `MUNDO §14` |
| `dias_colapso` | Días que deben sostenerse las condiciones de colapso | Evita declarar colapso por un pico | días | `7` días (*valor inicial de prototipo, no decidido*) | `MUNDO §14` |
| `lado_min, baldosas_por_persona, suelo_util_pct` | Piso del lado del mapa, densidad y proporción de suelo útil | `lado = máx(lado_min, raíz(población × baldosas_por_persona ÷ suelo_util_pct))` | baldosas / baldosas por persona / % | `lado_min: 48`, `baldosas_por_persona: 14`, `suelo_minimo_pct: 0.54` (*valor inicial de prototipo, no decidido*) | `MAPA §8` |
| `periodos_balance` | Cada cuántos períodos sale el balance de apoyo en la UI | Tarjeta de balance | períodos | `4` períodos (`28` días; *valor inicial de prototipo, no decidido*) | `UI §3` |
| `salario_base_publico` | Valor base del salario público al que se aplica el % de `salario_publico` | Monto diario = base × %/100 | dinero / día | `4.25` (*valor inicial de prototipo, no decidido*) | `CONTROLES §2`, `ECONOMIA §3` |

### Caos, contagio y rarezas (`CAOS_PRENSA §2`, `§3`, `§4`, `§6`)

| Parámetro | Propósito y qué controla | Relación con el mundo | Unidad | Valor / rango / defecto en docs | Fuente |
|---|---|---|---|---|---|
| `k_contagio_global` | Escala todo el contagio; 0 lo apaga | Probabilidad diaria de contagio × `k_contagio_global`; perilla de estabilidad | factor | `1.0` (`0.75–1.4` por perfil; *valor inicial de prototipo, no decidido*) | `CAOS_PRENSA §4`, `MUNDO §14` |
| `max_rarezas_por_periodo` | Tope de rarezas por período (no cuentan contra `max_acciones_por_periodo`) | Da vida sin quitarle lugar al caos que importa | acciones / período | `2` (*valor inicial de prototipo, no decidido*) | `CAOS_PRENSA §2`, `§6` |
| `umbral_protesta, umbral_saqueo, umbral_ocupacion, umbral_boicot, umbral_recorte_paro` | Umbral propio de cada acción de condición | Cada uno es independiente del umbral de la noticia correspondiente | según indicador | `protesta: 35`, `saqueo: 20`, `ocupacion: 8`, `boicot: 38`, `recorte_paro: 82` (*valor inicial de prototipo, no decidido*) | `CAOS_PRENSA §3` |
| `umbral_noticia_<tema>` | Umbral de disparo de noticias por tema (`hambre`, `precio`, `vivienda`, …) | Independiente de los umbrales de acciones | según indicador | `hambre: 12%`, `precio: 18%`, `vivienda: 8%` (*valor inicial de prototipo, no decidido*) | `CAOS_PRENSA §3`, `§8` |

### Actores: favor y extorsión (`ACTORES §3`, `§4`, `§5`)

| Parámetro | Propósito y qué controla | Relación con el mundo | Unidad | Valor / rango / defecto en docs | Fuente |
|---|---|---|---|---|---|
| `decaimiento_favor` | Cuánto decae el `favor` hacia 0 por período | Relación con los actores | puntos / período | `2` (*valor inicial de prototipo, no decidido*) | `ACTORES §3` |
| `favor_aliado / favor_hostil` | Umbrales de `favor` para postura aliado y hostil | Definen la `postura` | puntos (−100 a 100) | `35` / `-35` (*valor inicial de prototipo, no decidido*) | `ACTORES §3` |
| `k_aliado` | Multiplicador que suaviza y espacia las medidas de un aliado | Menos presión de aliados | factor | `0.5` (*valor inicial de prototipo, no decidido*) | `ACTORES §3` |
| `pct_despido_medida` | % de empleados de las firmas del actor que despide `despido_forzado` | Reemplaza el conteo `despidos_medida` | % | `15` % (*valor inicial de prototipo, no decidido*) | `ACTORES §4` |
| `periodos_sin_lote` | Períodos sin lotes libres que disparan `via_a_mi_zona` | Disparador de demanda de obra | períodos | `2` (*valor inicial de prototipo, no decidido*) | `ACTORES §4` |
| `peso_extorsion` | `peso` mínimo del actor para poder extorsionar | Condición 1 de extorsión | 0-100 | `55` (*valor inicial de prototipo, no decidido*) | `ACTORES §5` |
| `periodos_memoria_rechazo` | Ventana en la que un rechazo o incumplimiento cuenta como hostilidad | Condición 2 de extorsión | períodos | `4` (*valor inicial de prototipo, no decidido*) | `ACTORES §5` |
| `margen_vulnerable` | Puntos de `apoyo_pct` a la meta o al límite que cuentan como gobernador débil | Condición 3 de extorsión | puntos | `8` (*valor inicial de prototipo, no decidido*) | `ACTORES §5` |
| `dias_respuesta_extorsion` | Plazo de una extorsión (más corto que el de una demanda) | Presión de tiempo | días | `3` días (*valor inicial de prototipo, no decidido*) | `ACTORES §5` |
| `k_extorsion, pct_despido_extorsion` | Multiplicador y % de despido de la medida de una extorsión rechazada | Medida más fuerte | factor / % | `1.75` / `25%` (*valor inicial de prototipo, no decidido*) | `ACTORES §5` |
| `periodos_precedente` | Períodos durante los cuales ceder a una extorsión acelera nuevas demandas | Costo de ceder | períodos | `6` (*valor inicial de prototipo, no decidido*) | `ACTORES §5` |
| `max_extorsiones_activas, dias_entre_extorsiones` | Topes de extorsión simultánea y de espera por actor | Límites | extorsiones / días | `1` / `21` días (*valor inicial de prototipo, no decidido*) | `ACTORES §5` |

---

## 13. Contradicciones y ambigüedades detectadas en la documentación

Se registran las discrepancias que encontró este documento. **Estado tras la segunda revisión de los docs:** los puntos 1 a 7 quedaron **resueltos en los docs** (ver nota en cada uno); lo que queda abierto está en la sección 14.

1. **Unidad de `salario_publico` y nombre de base (`ECONOMIA §3` y `MUNDO §7` vs `CONTROLES §2` y `GOBERNADOR §2`):** *Resuelto:* `salario_publico` es un % del valor base `salario_base_publico` (nombre unificado en snake_case); `ECONOMIA §3` lo dice igual.
   - `ECONOMIA §3` y `MUNDO §7` lo describen como el monto que cobra el rol público (`"Público | salario_publico (no se ajusta solo con la inflación)"`).
   - `CONTROLES §2` y `GOBERNADOR §2` definen `salario_publico` como `% del valor base (50-150)` referido a `salarioBasePublico` (escrito además en camelCase, a diferencia de la convención `parametro_en_codigo` de `README.md`).
2. **Edad del rol `estudiante` vs egreso a los 18 (`MUNDO §2`, `§5` y `§7`):** *Resuelto:* el rol `estudiante` pasó a `[0, 17]` (`MUNDO §7`).
   - `MUNDO §2` define menor `< 18` ("estudia") y adulto `18-64` ("trabaja"), y `MUNDO §5` y `§7` indican que el menor es `estudiante` y egresa cuando `edad >= 18` para elegir rol.
   - Sin embargo, el JSON de roles en `MUNDO §7` define `{ "id": "estudiante", "edad": [0, 24], "educ_min": 0, "estudia": true }`, superponiéndose con el tramo `18-24`.
3. **Tamaño del mapa a 5.000 personas y fórmula de escala (`MAPA §2` vs `MAPA §8`):** *Resuelto:* `MAPA §8` usa una sola regla con `lado_min` y un ejemplo coherente (`48`, `82`, `258`); `MAPA §2` dice unas 66.000 baldosas.
   - `MAPA §2` menciona `"unas 16.000 baldosas para 5.000 personas"`.
   - `MAPA §8` muestra en su tabla `5.000 personas → 160 × 160` (`25.600` baldosas), y a la vez propone `lado = raíz(poblacion_inicial × baldosas_por_persona ÷ suelo_util_pct)` (con factor lineal bajo raíz, `50×` población respecto a `100` hab daría `~7,07×` el lado: de `48` pasaría a `~339`, no a `160`), aclarando luego que la tabla `"son valores de referencia, no una regla"`.
4. **Existencia inicial de `universidad` vs hito de desbloqueo (`MUNDO §5`, `§12` vs `GOBERNADOR §4` y `ESCENARIOS §2`):** *Resuelto:* el hito de ejemplo ya no desbloquea `universidad` y `ESCENARIOS §2` arranca con hospital, comisaría, escuela y universidad.
   - `MUNDO §5` y `§12` establecen que el generador siempre crea como mínimo un hospital, una comisaría, una escuela y una `universidad` en la zona central (incluso en mundos de 100 personas) para permitir el nivel educativo `3` y la capacitación.
   - `GOBERNADOR §4` da como ejemplo de hito `h1` desbloquear `["universidad", "muralla"]`, y `ESCENARIOS §2` describe el arranque de Elecciones como `"núcleo chico con un hospital y una comisaría insuficientes"` sin mencionar escuela ni universidad.
5. **Unidad temporal de períodos: `periodo_dias` vs `30 días` / `meses` (`ECONOMIA §1`, `LECTURA §4` vs `UI §3`, `CONTROLES §4`, `UI_PROTOTIPO_MUNDO §3`):** *Resuelto:* la UI usa `períodos` y `periodos_balance`; no hay meses ni 30 días fijos.
   - El motor y la economía usan `periodo_dias` (`periodos_sin_pagar_alquiler`, informe cada `periodo_dias`).
   - `UI §3` menciona por separado `"resumen de cada día de pago"` y `"balance cada 30 días"`, y `CONTROLES §4` / `UI_PROTOTIPO_MUNDO §3` muestran `"meses sin pagar"` en lugar de períodos. No se especifica si `periodo_dias = 30` o si el balance de 30 días es independiente.
6. **Cantidad de series en el historial y capas del mapa (`MUNDO §11`, `LECTURA §4` vs `UI §3`; `UI_PROTOTIPO_MUNDO §1` vs `§4`):** *Resuelto:* la UI remite a las series de `MUNDO §11` y las capas son las del selector (`UI_PROTOTIPO_MUNDO §4`, 13).
   - `UI §3` menciona `"las seis series"` en la ventana de historial, mientras `MUNDO §11` lista `9` series y `LECTURA §4` indica una serie por cada indicador (`6` o `7` con M2) y por zona.
   - `UI_PROTOTIPO_MUNDO §1` dibuja 8 opciones en la barra de capas, mientras `UI_PROTOTIPO_MUNDO §4` afirma `"Son 12"` (listando `ninguna` más 11 capas).
7. **Umbrales compartidos o independientes en condición, noticias y hambre crítica (`MUNDO §6`, `§11`, `CAOS_PRENSA §3`, `§8`, `ACCIONES §3`, `ACTORES §3`):** *Resuelto:* `umbral_hambre_critica` es único para daño e indicador; cada acción de condición y cada tema de noticia tiene su umbral propio (`CAOS_PRENSA §3`).
   - `MUNDO §11` fija `hambre_critica_pct` como `hambre > 80`, pero `MUNDO §6` habla genéricamente de `"su umbral"` para daño por hambre crítica y cura natural.
   - `CAOS_PRENSA §3` y `§8` hablan de `"su umbral"` tanto para disparar acciones de condición (`saqueo`, `ocupacion`) como noticias (`hambre`, `vivienda`), sin precisar si son el mismo parámetro o dos distintos (aunque `ACTORES §3` refiere expresamente al `"umbral de noticia"`).
   - Para `paro_firma`, `CAOS_PRENSA §3` dice `"sobre su umbral de recorte"` y `ACCIONES §3` dice `"Recorte o despido fuerte de una firma"`, sin precisar un parámetro único.

---

## 14. Datos pendientes de definición en diseño

1. **Valores numéricos iniciales, rangos y pasos de todos los parámetros** listados como *Pendiente* en las secciones 1 a 11 (incluidos los **12 parámetros nuevos del `README.md`**).
2. **Definición de unidad exacta de `umbral_obra_sin_capacidad`** (`ECONOMIA §8`): si mide cantidad de obras acumuladas en obra directa/pendientes, monto o proporción respecto a la demanda total.
3. **Reglas marcadas `[propuesta]`** que aún deben pulirse antes o durante la calibración (entre otras: sueldo de gerente sin partes, compra parcial/holding, índice de demanda de zona en alquiler, precio del suelo, migración, educación por ruta, reparto en separaciones, abandono/demolición de casas vacías, terreno por semilla y tamaño del mapa, turnos por local, pesos del director de caos, lectura e indicadores de vistazo, tabla completa de `ACCIONES.md` y `ACTORES.md`).
4. **Rediseño de palancas y capa del gobernador (`PALANCAS_MINIMAS.md`, `GOBERNADOR.md`):** estado de palancas finales, indicadores nuevos pedidos en `PALANCAS_MINIMAS §7` (constructoras y mantenimiento total) y especificación de controles G3 (`presion`, `acceso`, contraofertas).
5. **Prueba pendiente de prensa (`CAOS_PRENSA §10`):** resolución del interruptor `noticias_mueven_satisfaccion`.
