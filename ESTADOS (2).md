# Estados internos (borrador v0.20)

> Lo marcado **[cerrado]** está decidido; el resto es lo acordado hasta ahora, salvo lo listado en la sección 15. Los valores que se ajustan probando (constantes, coeficientes, umbrales, topes, plazos y valores iniciales) no viven acá: están en CALIBRACION.md y en el preset de cada escenario. Los números que aparecen en los ejemplos solo ilustran la forma de los datos. Escala 0-100 salvo donde se indique. Ejemplos escalados a unos 100 NPCs. Las palancas del gobernador están en GOBERNADOR.md; acá solo sus efectos sobre los estados. La economía es modular (sección 3.1).

---

## 1. Estado del NPC (uno por habitante)

```json
{
  "id": "npc_07",
  "nombre": "Marta",
  "edad": 34,
  "educacion": { "nivel": 1, "progreso": 40 },
  "personalidad": {
    "valentia": 35,
    "laboriosidad": 80,
    "codicia": 60,
    "rebeldia": 20,
    "resiliencia": 55
  },
  "variables": {
    "salud": 90,
    "hambre": 20,
    "miedo": 10,
    "satisfaccion": 65,
    "lealtad": 70
  },
  "economia": { "ingreso_pos": 60, "dinero": 40 },
  "rol": "agricultor",
  "zona": "este",
  "accion": null,
  "modificadores": [
    {
      "id": "mod_3",
      "afecta": { "laboriosidad": -30 },
      "duracion_dias": 5,
      "origen": "accion:predicar/npc_12",
      "causa": "ev_88",
      "texto": "Anda desanimada desde la discusión del pozo"
    }
  ]
}
```

- `edad`: define la **etapa** (se deriva): menor (<18) solo estudia, adulto (18-64) trabaja (en el nivel 1 solo estudian los menores), jubilado (65+) no trabaja. Cada NPC cumple años en su propio día, fijado al generar el mundo por semilla.
- `educacion.nivel`: 0 sin estudios, 1 básico, 2 medio, 3 superior. Define a qué roles accede.
- `personalidad` es el valor **base y fijo** de cada rasgo. Las reglas usan el valor **efectivo** = base + modificadores activos (temporales, con decaimiento), acotado a 0-100. `variables` cambian. Salud 0 = muere.
- `economia` **[cerrado: cada NPC gana y gasta su dinero]**: `ingreso_pos` (0-100) es su posición fija dentro del rango de ingreso de su rol (da variedad). `dinero` es lo que tiene ahorrado. Los campos existen siempre. El módulo `simple` usa `ingreso_pos` (recaudación y poder adquisitivo) y no usa `dinero`.
- `accion`: acción de la tabla (sección 7) en curso, elegida por el director de caos (sección 9): el motor por afinidad y azar o, si la IA opcional está activa, con el clasificador. Si tiene el efecto `fuera_de_puesto` (sección 7.1), no produce ni cobra ingreso por su trabajo. Los empleados públicos mantienen su salario (propuesta), salvo en impago.
- `modificadores`: canal único de efectos (sección 8), con `origen`.
- `zona`: zona del mundo donde está el NPC (sección 14), asignada al generar el mundo según su rol. Su zona efectiva puede ser otra (acción con `zona_destino`, internación). Los policías cambian de `zona` al reubicarse.

## 2. Catálogo de roles y grupos (configuración, no es estado)

```json
[
  { "id": "estudiante",  "edad_min": 0,  "edad_max": 24,   "educ_min": 0, "estudia": true, "produce": {} },
  { "id": "agricultor",  "edad_min": 18, "edad_max": 64,   "educ_min": 0, "afinidad": "laboriosidad", "produce": { "alimento": "ver CALIBRACION" } },
  { "id": "obrero",      "edad_min": 18, "edad_max": 64,   "educ_min": 0, "afinidad": "laboriosidad", "produce": {} },
  { "id": "policia",     "edad_min": 18, "edad_max": 64,   "educ_min": 1, "afinidad": "valentia",     "publico": true, "produce": { "seguridad": 1 } },
  { "id": "estatal",     "edad_min": 18, "edad_max": 64,   "educ_min": 1, "afinidad": "laboriosidad", "publico": true, "produce": { "administracion": 1 } },
  { "id": "comerciante", "edad_min": 18, "edad_max": 64,   "educ_min": 1, "afinidad": "codicia",      "produce": { "comercio": 1 } },
  { "id": "tecnico",     "edad_min": 18, "edad_max": 64,   "educ_min": 2, "afinidad": "laboriosidad", "produce": {} },
  { "id": "docente",     "edad_min": 18, "edad_max": 64,   "educ_min": 2, "afinidad": "laboriosidad", "publico": true, "produce": { "educacion": 1 } },
  { "id": "periodista",  "edad_min": 18, "edad_max": 64,   "educ_min": 2, "afinidad": "rebeldia",     "produce": { "informacion": 1 } },
  { "id": "medico",      "edad_min": 18, "edad_max": 64,   "educ_min": 3, "afinidad": "laboriosidad", "publico": true, "produce": { "salud": 1 } },
  { "id": "ingeniero",   "edad_min": 18, "edad_max": 64,   "educ_min": 3, "afinidad": "laboriosidad", "publico": true, "produce": { "infraestructura": 1 } },
  { "id": "desempleado", "edad_min": 18, "edad_max": 64,   "educ_min": 0, "produce": {} },
  { "id": "jubilado",    "edad_min": 65, "edad_max": null, "educ_min": 0, "produce": {} }
]
```

- `ingreso: [min, max]` por rol (valores en CALIBRACION): lo que gana por día un NPC privado en ese rol. Real = (min + `ingreso_pos` / 100 × (max − min)) × productividad. En `simple` solo sirve para calcular la recaudación.
- `publico: true`: cobra el `salario_publico`, igual para todos: `salario_base_publico` × palanca / 100, con `salario_base_publico` (se calibra por escenario y puede quedar por debajo del ingreso privado). No tiene ingreso propio y forma parte de la nómina.
- Obrero y técnico no producen un recurso físico: su aporte es el ingreso gravable.
- **Comerciante (empleados confirmados: son los obreros; la comisión por ventas sigue como propuesta):** gana su ingreso base (el rango de `ingreso`) más una comisión sobre lo que se vende en el período. Ventas = gasto de la población en comida + volumen de intercambio con el exterior, repartidas entre los comerciantes. Es un valor derivado: no se traza quién le paga a quién (ver Circulación en la sección 12). Tiene empleados: cada comerciante sostiene hasta `empleados_por_comerciante` obreros. El tope efectivo de obreros = min(`tope_privado[obrero]`, comerciantes × `empleados_por_comerciante`). Si baja el número de comerciantes, el tope efectivo baja de inmediato, pero los obreros que quedan sin puesto no pasan todos a desempleados de golpe: pasan como máximo `max_pase_desempleo_por_dia` por día (valor en CALIBRACION), elegidos al azar con semilla entre los que exceden el tope. Mientras haya exceso no se cubren vacantes de obrero. Cada pase queda con origen `estado:comercio` y `causa` = el evento que redujo a los comerciantes (muerte, acción en curso), para poder explicar la cadena.
- **Sin ingreso propio (desde `individual`):** los jubilados reciben una pensión fija (`pension_base`), gasto obligatorio del estado. La comida de los menores la paga el estado. Los desempleados dependen de la garantía alimentaria y de los subsidios.
- `policia`: rol de seguridad en el nivel 1, con dos usos: defensa y orden (sección 14). En zombies el gobernador sube el cupo y los NPCs lo cubren por afinidad (valentía), como cualquier rol. Su `zona` define dónde defiende (sección 14).
- `medico`: da camas al hospital (sección 12, Salud).
- `periodista`: columnista de un medio, produce `informacion`. Es un rol privado: cobra su ingreso del rango, paga impuestos (grupo `comercio`) y no depende de su medio en el nivel 1.
- `alimento` es un stock del mercado (sección 4). `seguridad`, `salud`, `educacion` e `infraestructura` son indicadores del gobierno (sección 3). Los servicios actúan según su **cobertura** (profesionales respecto de la población). El indicador `salud` es la calidad de la atención sanitaria, no la salud de la gente: no existe una salud agregada de la comunidad. No es la `salud` del NPC.
- `administracion`: sin estatales se pierde parte de la recaudación y del presupuesto. `comercio`: capacidad de intercambio de alimento con el exterior.

**Cambios de rol**

- Menor: rol forzado `estudiante`. Al cumplir 18 elige. En el nivel 1 solo estudian los menores: el estudiante egresa cuando `edad` ≥ 18 (se evalúa cada día, no por igualdad exacta) y al generar el mundo los estudiantes tienen menos de 18. `edad_max` 24 queda como dato para estudios superiores (a futuro).
- Adulto: cada cierto tiempo puede cambiar a un rol para el que cumpla edad y educación, si hay vacante. Elige por afinidad.
- Al superar el `edad_max` de su rol sin llegar a 65, pasa a `desempleado`. A los 65 pasa directo a `jubilado` y deja de trabajar.
- El gobernador fija **cupos** solo de los roles públicos. Los roles privados no tienen cupo del gobernador: se cubren por afinidad y vacantes, con un tope por escenario (`tope_privado[rol]`, parámetro del mundo en CALIBRACION, no palanca). Vacantes = tope − ocupados. Un puesto solo se cubre con NPCs que cumplan los requisitos.
- Menores, estudiantes, desempleados y jubilados consumen y no producen ni ganan por trabajo. Estar desempleado baja la satisfacción.

**Grupos** (para impuestos y subsidios). Pagan impuesto todos los grupos con ingreso, incluido el público (sobre su salario); los `sin_ingreso` no tienen ingreso gravable. Los subsidios apuntan a un grupo de roles:

```json
{
  "agro": ["agricultor"],
  "industria": ["obrero", "tecnico"],
  "comercio": ["comerciante", "periodista"],
  "publico": ["policia", "estatal", "docente", "medico", "ingeniero"],
  "sin_ingreso": ["desempleado", "jubilado", "estudiante"]
}
```

## 3. Estado del Gobierno

```json
{
  "reserva": 4200,
  "inflacion": 0,
  "finanzas": { "ingresos": 0, "nomina": 0, "pensiones": 0, "garantia_alimentaria": 0, "deficit": 0, "emision": 0 },
  "indicadores": { "seguridad": 40, "salud": 50, "educacion": 50, "infraestructura": 50 },
  "integridad": { "centro": 100, "norte": 100, "este": 100, "sur": 100, "oeste": 100 },
  "palancas": {}
}
```

- `reserva`: stock de fondos. Lo no asignado del presupuesto va acá. También paga las compras de alimento (sección 12).
- `inflacion` **[cerrado]**: variable del gobierno, no del escenario. Sube con la emisión y decae sin ella. Solo cambia desde el módulo `fiscal`. Se expresa en % (15 = precios ×1,15). En `simple` vale 0 (precio fijo); en `individual`, el valor del preset.
- `finanzas`: resultado del último período (se recalcula, no se decide). `deficit` y `emision` se usan desde `fiscal`.
- `indicadores`: se acumulan con inversión y personal, y decaen con el tiempo. `seguridad` es el total de la ciudad; la defensa de cada zona se deriva de dónde están los policías y de su `integridad`, que se guarda acá (sección 14).
- `palancas`: valores vigentes de las palancas del gobernador (estructura en GOBERNADOR.md). Las de prensa se guardan en cada medio (sección 6).

### 3.1 Módulos de economía (esquema cerrado, detalles abiertos)

La economía es un módulo con salidas fijas. El resto del juego (hambre, satisfacción, servicios, objetivo) solo lee esas salidas. Se elige en el panel y cada escenario trae su preset (cambiarlo se marca como "configuración de prueba").

```json
{ "economia": { "modulo": "simple", "extensiones": [] } }
```

```ts
interface SalidaEconomica {
  accesoComida: Record<npcId, number>      // 0 a 1
  poderAdquisitivo: Record<npcId, number>  // 0 a 100, entra en la satisfacción
  disponible: number                       // fondos para presupuesto
  precioAlimento: number
  inflacion: number
}
```

Se calcula una vez por día.

- **Período fiscal:** ingresos y gastos se acumulan a diario y se liquidan cada `periodo_fiscal_dias`. Presupuesto y subsidios se reparten en cada liquidación. Es independiente del período del caos (sección 9).
- **Combinación:** `individual` reemplaza a `simple`. `fiscal` solo se activa sobre `individual`.
- **Preset inicial:** elecciones y zombies arrancan en `simple`. En elecciones, sin emisión: el límite del gasto es la reserva y el impago. La emisión y la inflación dinámica llegan con `fiscal`.
- **Fórmulas de `simple`:** un coeficiente por efecto, a calibrar. `poderAdquisitivo` = 50 + `coef_subsidio` × subsidio por habitante del grupo (con rendimientos decrecientes) − `coef_impuesto` × tasa del grupo (más con codicia) + `k_salario` × (`salario_publico` − 100) solo para el grupo `publico` + un ajuste individual según `ingreso_pos` y `resiliencia` (para que un subsidio no mueva de golpe a todo un grupo), acotado a 0-100. Entra en la satisfacción igual que en los otros módulos.

| Elemento | `simple` | `individual` | `fiscal` |
|---|---|---|---|
| Alimento | Almacén común del estado (con silo) y ración global. Precio fijo. Intercambio con el exterior | Mercado con precio y garantía alimentaria | Precio afectado por la inflación |
| Recaudación | Un impuesto único sobre el ingreso de todos los roles con ingreso | Impuestos por grupo | Igual |
| NPC | Sin `dinero` en uso | `dinero`, gasto de vida, ingreso propio | Igual |
| Subsidios | Suben la satisfacción del grupo directamente | Transfieren dinero al grupo | Igual |
| Nómina | Sí | Sí | Sí |
| Pensiones | No (los jubilados comen de la ración) | Sí | Igual |
| Déficit | Se usa la reserva y, si no alcanza, hay impago | Igual | Igual, y antes del impago se puede emitir |
| Inflación | Fija en 0 | Fija (valor del preset) | Dinámica: sube con la emisión |

## 4. Alimento: stock y mercado

Módulo `individual`: el alimento es un stock de mercado (estado de la economía, sin empresas como entidad) y el estado lo regula. Lo que pagan los NPCs sale del sistema; los comerciantes ganan según las ventas (sección 2, valor derivado). En `simple`, el mismo stock es el almacén común del estado, con ración global y precio fijo.

```json
{
  "alimento": { "stock": 1500, "consumo_por_npc": 1, "dias_stock": 15, "precio": 1.0, "silo_dias": 25 },
  "precio_base": 1.0
}
```

- Producción de los agricultores → `stock`. Consumo diario = población × `consumo_por_npc`. `dias_stock` y `precio` se derivan. **Silo:** el `stock` tiene un tope de `silo_dias` días de consumo y lo que excede se pierde. Sin tope, un superávit chico se acumula sin límite y las sequías no tienen efecto. El gobernador puede vender el excedente (intercambio).
- `precio` = `precio_base` × escasez (según `dias_stock`) × clima × (1 + inflación / 100). Sube cuando el stock baja.
- Cada NPC paga su comida con su `dinero`. El faltante lo cubre en parte el estado (garantía alimentaria).
- Si el stock no alcanza para todos, el reparto es parejo y sube el hambre general. El dinero no crea comida: el estado puede importar (intercambio).

## 5. Estado del Clima

```json
{
  "reloj": { "tick": 18340, "dia": 153, "anio": 1 },
  "fenomenos": [
    { "tipo": "sequia", "intensidad": 60, "inicio_dia": 140, "duracion_dias": 30, "aviso_dias": 5 }
  ]
}
```

| Tipo | Efecto |
|---|---|
| `sequia` | Baja la producción de alimento y sube su precio |
| `plaga` | Baja la producción de alimento y sube su precio |
| `pandemia` | Da golpes de salud a NPCs individuales (ver abajo). La productividad baja por la salud |
| `plaga_zombie` | Sube el miedo (sección 12) y da golpes de salud a NPCs individuales (ver abajo). Su intensidad crece con el tiempo. No crea zombies como agentes: la única baja es la muerte por salud 0 |

- `aviso_dias` (por defecto 0, vale para todos los fenómenos): días de anticipación con los que se anuncia. Incluye la zona de `origen` si la tiene. La prensa lo cuenta (el motor fija el tema): la ciudadanía se entera por esa noticia y por los golpes (sección 14), y el gobernador ve el aviso y el origen exactos.
- `crecimiento_dia` (opcional): la intensidad sube ese valor por día desde `inicio_dia`, con tope 100.
- `origen` (zona; solo fenómenos con daño): de dónde vienen los ataques. Sin `origen`, el fenómeno actúa parejo en toda la ciudad.
- **Preset zombies:** una plaga con `origen` en la zona de entrada del preset, que crece con el tiempo hasta llegar al máximo hacia el final del plazo (valores en CALIBRACION). Las hordas son fenómenos `plaga_zombie` adicionales, cortos y de intensidad alta, con su propio `origen` y `aviso_dias`.
- **Escala de tiempo [cerrado]:** el día de juego es la unidad: la lógica económica y social corre una vez por día y la UI interpola entre ticks. Los segundos reales por día, los ticks por día y las velocidades están en CALIBRACION.

**Fenómenos con daño individual:** `pandemia` y `plaga_zombie` **atacan** a NPCs individuales. No existe una salud de la comunidad que reduzcan: cada NPC se enferma o muere por separado. Cada día, cada fenómeno activo hace una tirada de ataque por cada NPC vivo que no esté internado, con probabilidad `exposicion_max` × intensidad/100 × `atenuacion`^distancia (distancia entre el `origen` y la zona efectiva del NPC; sin `origen`, 0). Si el tipo tiene protección, el ataque debe pasar las defensas de las zonas del camino más corto desde el `origen` hasta la zona del NPC, incluida la suya: cada zona lo repele con probabilidad `proteccion_max` × `defensa`/100, con `proteccion_max` (valor en CALIBRACION). Si alguna zona lo repele, el resultado es *repelido* en esa zona. Si pasa todas, es un **golpe**: resta a la salud un valor al azar dentro de `dano`. Si el tipo tiene protección, el golpe también daña la integridad de la zona (sección 14). Ambos resultados son eventos (sección 14). Una horda suma ataques a los de la plaga: cada fenómeno activo tira por separado. En el nivel 1 la exposición es pareja entre los NPCs de una misma zona. Qué pasa después del golpe: sección 12, Salud.

| Tipo | Protección |
|---|---|
| `plaga_zombie` | `defensa` de las zonas del camino |
| `pandemia` | Ninguna (se enfrenta con el hospital) |

La `exposicion_max`, el rango de `dano` y la `atenuacion` de cada tipo están en CALIBRACION.

## 6. Estado de los Medios

**[cerrado]** Un medio es una entidad con parámetros. Un monopolio es el caso de un solo medio. Se elige en el panel. Por defecto, 1 a 3 medios. **No hay medio estatal:** todos los medios son privados y el estado puede ponerles plata (palanca de financiamiento).

```json
[
  {
    "id": "medio_1",
    "nombre": "El Heraldo",
    "linea_editorial": { "afinidad_gobierno": 40, "sensacionalismo": 70 },
    "credibilidad": 65,
    "alcance_pct": 80,
    "columnistas": ["npc_31", "npc_58"],
    "finanzas": { "ingresos_propios": 30, "fondos_estado": 20, "dependencia_pct": 40 },
    "intervencion": { "financiamiento": 100, "regulacion": 20 }
  }
]
```

- `dependencia_pct` = `fondos_estado` / (`ingresos_propios` + `fondos_estado`). Con más dependencia, `afinidad_gobierno` sube sola y, si se nota, cae la credibilidad.
- Nivel 1: `ingresos_propios` es una constante por medio (valor en CALIBRACION). No hay balance ni quiebra del medio. Que dependa de alcance y credibilidad no tiene nivel asignado (HOJA_DE_RUTA §7). `columnistas` limitan cuánto puede publicar (`informacion`).
- `intervencion`: palancas vigentes del gobernador sobre este medio (nivel 1: `financiamiento` y `regulacion`; las del nivel 1.1, en GOBERNADOR §4). `fondos_estado` = presupuesto de prensa del período × `financiamiento` / 100. Más `fondos_estado` sube `alcance_pct` (con rendimientos decrecientes) y la dependencia. `regulacion` baja `sensacionalismo` y `credibilidad`, y sube la rebeldía efectiva (modificador) de quienes consumen el medio.
- **Consumo:** cada NPC elige qué medios consume según personalidad y lealtad, con tope en el alcance. Da burbujas sin relaciones entre NPCs.
- **Noticia** (dato, no solo texto):

```json
{
  "id": "n_41", "medio": "medio_1", "autor": "npc_31",
  "tema": "hambre", "tono": "alarmista", "alcance": 70,
  "titulo": "...", "texto": "...", "texto_origen": "plantilla", "origen": "estado:hambre_critica"
}
```

- El motor fija `tema`, `tono` y `alcance`. El `titulo` y el `texto` salen de **plantillas** (varias variantes por tema y tono) y, si la IA opcional está activa, de un **modelo generativo** que los escribe a partir de los datos de la noticia (tema, tono y los hechos y cifras del `origen`). El modelo no puede agregar cifras ni hechos: si el texto falla, tarda o no coincide con los datos, se usa la plantilla. `texto_origen` registra de dónde salió (`plantilla` o `generativo`). **El texto es decorativo y nunca maneja la simulación.** El efecto lo calcula el motor y se aplica como modificadores con origen `noticia:n_41`.
- Anti-bucle: efectos que decaen, dependen de alcance y credibilidad, y una noticia repetida pesa menos.

## 7. Tabla de acciones (configuración, no es estado)

**[cerrado]** Cosas que los NPCs pueden hacer, como dato.

```json
{
  "id": "cavar_pozo",
  "textos": ["{nombre} se obsesiona con cavar un pozo", "{nombre} deja todo para cavar un pozo en el patio"],
  "requisitos": { "etapa": "adulto", "rol_no_en": ["policia"] },
  "afinidad": { "rebeldia": "+", "laboriosidad": "-" },
  "efectos": [{ "id": "fuera_de_puesto" }, { "id": "anima", "intensidad": "baja" }],
  "duracion_dias": [3, 8],
  "contagio": 0.05
}
```

- `requisitos` filtra quién puede; `afinidad` pesa la probabilidad; `efectos` son del catálogo (sección 7.1), acotados y aplicados por el motor; `duracion_dias` es siempre finito; `contagio` (0 a 1) es qué tan contagiosa es la acción: cavar un pozo casi nada, predicar bastante más (sección 7.2); `textos` son las variantes de la frase que ve el jugador (el motor elige una al azar para que no se repita). Cada acción de la tabla tiene su animación en la vista (UI §9): al ser un conjunto cerrado, siempre se representa igual.
- `zona_destino` (opcional): la zona a la que van los participantes mientras dura la acción (`protesta` y `fiesta`: `centro`). Cuenta para su exposición y para el contagio.
- Ideas iniciales: cavar un pozo, predicar, acaparar comida, organizar una fiesta, abandonar el trabajo. Con la economía: protestar, hacer huelga (empleados públicos sin paga), saquear.

**Acciones de condición.** Hay dos tipos de acción: `espontanea` (por defecto: el director de caos elige entre las candidatas y cuenta contra los límites del caos) y `condicion` (consecuencia de una situación del mundo). Las de condición (huelga, protesta, saqueo) funcionan así:

- El **motor** decide si pasa y cuánto: cuando se cumple el `disparador`, abre una ventana con su intensidad (cuántos NPCs, cuáles según requisitos, `afinidad` y azar, y la duración).
- El **director de caos** decide cómo se expresa: elige entre las acciones de condición válidas para esa situación, por afinidad y azar o, si la IA opcional está activa, con el clasificador (sección 9). Nunca puede elegir que no pase nada.
- Sin IA, el motor elige por afinidad y azar. Con el clasificador activo, si no responde antes del plazo (sección 9), elige el motor. El origen queda registrado (`accion:huelga/clasificador` o `accion:huelga/motor`).
- Duración siempre finita. No cuentan contra los límites del caos (sección 9). El porcentaje que resuelve el motor con el clasificador activo sirve para evaluar si el modelo responde a tiempo.
- Disparadores: `huelga` ← impago; `protesta` ← `descontentos_pct` por encima de su umbral; `saqueo` ← `hambre_critica_pct` por encima de su umbral (umbrales en CALIBRACION).

```json
{
  "id": "huelga",
  "tipo": "condicion",
  "textos": ["{nombre} se suma a la huelga", "{nombre} deja su puesto y se une al paro"],
  "disparador": { "impago": true },
  "requisitos": { "publico": true },
  "afinidad": { "rebeldia": "+", "resiliencia": "-" },
  "efectos": [{ "id": "fuera_de_puesto" }],
  "duracion_dias": [3, 10],
  "contagio": 0.2
}
```

### 7.1 Catálogo de efectos [cerrado]

Una acción de la tabla es un **disfraz** (textos, animación, requisitos, afinidad, contagiosidad) más uno o más **efectos tomados de un catálogo chico y cerrado**. Lo que cambia las estadísticas son los efectos, no el disfraz. El balance vive en el catálogo: se pueden sumar acciones nuevas a la tabla sin tocarlo, y un efecto nuevo es una decisión de diseño.

| Efecto | Qué hace | A quién | Límite |
|---|---|---|---|
| `fuera_de_puesto` | No produce ni cobra por su trabajo (el público mantiene su salario, salvo en impago) | Participante | `max_pct_rol_fuera_de_puesto` (sección 9) |
| `anima` | Sube o baja la satisfacción mientras dura | Participante | Acotado por intensidad |
| `agita` | Sube el miedo y la rebeldía efectiva (modificadores) | NPCs de la zona | Duración de la acción |
| `acapara` | Retira comida del almacén o del mercado | Participante | Acotado por intensidad (tope propio a definir) |
| `moviliza` | Los participantes pasan a la `zona_destino` de la acción | Participante | Solo cambia la zona efectiva (sección 14) |
| `decorativa` | Sin efecto en los datos: solo texto y animación | Ninguno | Ninguno |

- El motor aplica cada efecto como modificador con `origen` (sección 8). Siempre es acotado y con la duración de la acción.
- La intensidad (`baja`, `media`, `alta`) la define el catálogo, y los valores calibrados viven en CALIBRACION y en el preset.
- Los límites del caos se enganchan al **efecto**, no a la acción (sección 9). Si el tope de `fuera_de_puesto` está lleno, ninguna acción con ese efecto puede sumar a nadie más, sea un foco o un contagio.
- Las acciones de condición (huelga, protesta, saqueo) usan el mismo catálogo.
- Ejemplo de contraste: cavar un pozo saca al NPC de su puesto y casi no se contagia. Predicar no lo saca del puesto, pero se propaga y agita a la zona.

```json
{ "id": "predicar", "efectos": [{ "id": "agita", "intensidad": "baja" }], "contagio": 0.3 }
```

### 7.2 Contagio [cerrado]

Es la misma mecánica para las acciones espontáneas y para los fenómenos con daño (sección 5): una fuente, una exposición, un freno y una tirada diaria por NPC.

| | Acción espontánea | Fenómeno con daño |
|---|---|---|
| Fuente | Una acción en curso en la zona | El fenómeno, desde su `origen` |
| Contagiosidad | `contagio` de la acción | `exposicion_max` × intensidad |
| Exposición | % de NPCs de la zona que ya la hacen | `atenuacion`^distancia |
| Freno | Orden y satisfacción de la zona (sección 14) | `defensa` de las zonas del camino (plaga zombie). La pandemia no tiene freno previo |
| Quién lo agarra | NPCs que cumplen los `requisitos`; la `afinidad` con su personalidad los hace más o menos susceptibles | NPCs vivos y no internados |
| Resultado | El NPC hace la misma acción | Un golpe de salud |

- **Se tira cada día mientras dura la acción de la fuente.** Así hay olas que crecen y se apagan, y el orden y la satisfacción pesan todo el tiempo.
- **El contagiado hace la misma acción hasta que termina la original.** Contagiar no la alarga: una ola nace de un foco y muere con él.
- **Qué cuenta contra los límites del caos:** los contagiados no cuentan contra `max_acciones_por_periodo`, pero sí contra los topes de cada efecto (sección 9). Si el tope está lleno, no se tira.
- **Origen:** el contagiado queda con origen `accion:<id>/contagio` y `causa` = el evento de la fuente (sección 8). La cadena "foco → contagio → efecto" se puede explicar.
- **Las acciones de condición** tienen su propio `contagio` y el orden y la satisfacción no las modifican (sección 14).
- **UI:** no hace falta nada nuevo. Todo se deriva del estado (la acción en curso de cada NPC) y de los eventos `accion_inicio` con origen `contagio` (sección 14).
- **Pandemia a futuro:** si pasa a contagiarse entre NPCs, usa esta misma forma.

## 8. Canal único de efectos y registro de causas (cerrado)

- Todo efecto (acción, rumor, clima, noticia, palanca) es un `modificador`: *a este conjunto de NPCs, tal variable cambia tanto, por tanto tiempo*.
- Todo modificador guarda su `origen`. Sirve para afinar y para que la prensa cuente causas reales. El registro de causas alimenta los eventos que lee la UI (sección 14).
- **Cadena de causas.** `origen` guarda la causa directa (tipo y fuente). Cada modificador y cada evento guarda además `causa`: el id del evento o modificador que lo provocó, si lo hay (un hecho raíz, como el clima o un cambio de palanca, no tiene). Para responder "¿por qué pasó esto?" (UI §8) el motor sigue `causa` hacia atrás hasta 5 pasos y entrega esa línea a la UI. Ejemplo: sequía → precio sube → hambre → protesta. Cada cambio de palanca emite el evento `palanca` (sección 14), así la cadena puede terminar en una decisión del jugador. Si un efecto viene de un estado acumulado y no de un cambio concreto, `causa` apunta al último cambio de la palanca que más influyó; si no hay uno claro, no tiene.
- Los modificadores pueden afectar variables y rasgos efectivos, nunca el rasgo base. Al vencer, el rasgo vuelve a su base.
- Un modificador también puede ser **instantáneo**: cambia una `variable` una sola vez, sin duración. Lo usan los golpes de salud y las curas (sección 12, Salud).
- Un rumor no tiene estado propio: es un modificador con origen `rumor`, que crea el motor cuando una acción o una noticia lo habilita.
- Los efectos decaen. Si el caos se detiene, la comunidad se recupera sola.

## 9. Director de caos e IA opcional

**Cómo funciona [cerrado]**

- **El juego funciona completo sin IA.** El **director de caos** es mecánico: elige las acciones de la tabla (sección 7) por requisitos, afinidad, interés y azar con semilla, y los textos salen de plantillas. Es el camino por defecto y el que se balancea. Las mismas reglas valen con o sin IA.
- **La IA es opcional** y se activa desde las opciones (UI §13). Tiene dos usos independientes, cada uno con su propio modelo:
  1. **Clasificador** (modelo de decisión, no generativo). Elige entre las candidatas que ofrece el motor y **no genera texto**. Devuelve una probabilidad por candidata y el motor **sortea con su semilla** según esas probabilidades, en vez de tomar siempre la más probable: así el motor sigue controlando la variedad y el caos. Referencia para probar: la familia d3 (2B), local y de unos 150 ms por decisión.
  2. **Generativo.** Escribe el título y el texto de las noticias a partir de los datos que arma el motor (sección 6). Es decorativo.
- Interfaz simple para cambiar de implementación: `elegirAccion(npc, candidatas)` devuelve probabilidades y `pedirTexto(noticia)` devuelve texto. Cada una tiene su versión mecánica (por defecto), local o por API. Cambiar de modelo no toca las reglas.
- **Nunca bloquea el juego.** Las consultas son asíncronas: si el resultado no llega a tiempo, el motor decide y usa la plantilla. Los plazos de espera y el descarte de un resultado atrasado están en CALIBRACION.
- **Determinismo:** sin IA, la partida es determinista dada la semilla. Con el clasificador, cada elección se guarda con su día y su origen, y la partida se reproduce sin llamar al modelo (sirve para depurar, calibrar y para las partidas grabadas de la UI, UI §11). Los textos generativos también se guardan, pero son cosméticos y no cambian el estado.
- **Memoria (tope acordado):** IA y render no pasan de 6 GB de VRAM en total (UI §12). Con la IA apagada, todo ese presupuesto va al render. Con la IA activa, el reparto lo fijan los modelos elegidos, y dos modelos juntos pueden no entrar: se decide si se carga uno solo, si corren en RAM y CPU o si van por API. Se mide con los modelos reales.
- **Pensamiento del NPC en foco:** fuera de la v1. A futuro, al seleccionar un NPC, el generativo escribe su pensamiento (con caché). Mientras tanto la ficha muestra sus datos y su acción actual.
- **Reglas de uso del clasificador:** cada candidata se describe de forma clara y distinta, y el orden de las candidatas se mezcla (en estos modelos las etiquetas de las opciones pueden pesar más que las definiciones).

**Tareas [cerrado]**

1. **Elección de acción espontánea:** el motor ofrece un conjunto acotado de candidatas (por requisitos y afinidad; la cantidad está en CALIBRACION) a unos pocos NPCs y el director elige una. Sin IA, por afinidad y azar; con el clasificador, por sorteo según sus probabilidades.
2. **Elección de acción de condición** (sección 7): el motor abre la ventana y el director elige entre las válidas. Si el clasificador falla, elige el motor.
3. **Noticias:** el motor crea la noticia (tema, tono, alcance y datos del hecho) y el texto sale de plantilla o, con la IA activa, del generativo.
4. **A futuro:** pensamiento del NPC en foco y textos personalizados por NPC (generativo).

**A quién se le ofrece:** el motor, con azar e "interés" (rasgos extremos, muy descontentos, con modificadores recientes). El clasificador nunca lee a toda la población. No se ofrecen acciones a NPCs internados.

**Límites del caos [cerrado]:** parámetros del mundo configurables. Regulan al director de caos, con o sin IA. Cambiarlos se marca como "configuración de prueba".

Los parámetros son `max_acciones_por_periodo`, `periodo_dias`, `max_pct_rol_fuera_de_puesto`, `duracion_max_dias` y `respiro_si_satisfaccion_media_menor_a`. Sus valores están en CALIBRACION.

**Qué cuenta contra cada límite:** `max_acciones_por_periodo` cuenta solo los **focos**, que son las acciones que elige el director. Los contagiados (sección 7.2) no cuentan. Los topes de efecto, como `max_pct_rol_fuera_de_puesto`, se aplican al efecto (sección 7.1), sin importar la acción ni si es un foco o un contagio. `duracion_max_dias` vale para todas.

**Fuera de los límites:** las acciones de `condicion` (sección 7) y los efectos mecánicos del impago (sección 12) no pasan por estos topes ni por el respiro, que regulan solo el caos espontáneo.

**Pruebas:** el plan de simulación y pruebas, con y sin IA, está en CALIBRACION.md.

## 10. Comunidad (derivada, no se guarda)

```json
{
  "poblacion": 100,
  "satisfaccion_media": 58,
  "apoyo_pct": 54,
  "descontentos_pct": 17,
  "hambre_critica_pct": 4,
  "sin_dinero_pct": 12,
  "hospital_ocupacion_pct": 40,
  "defensa": { "norte": 40, "este": 40, "sur": 40, "oeste": 40, "centro": 40 },
  "orden": { "norte": 60, "este": 60, "sur": 60, "oeste": 60, "centro": 60 },
  "amenaza": { "norte": 0, "este": 35, "sur": 0, "oeste": 10, "centro": 0 },
  "productividad_total": 6800,
  "roles": {
    "estudiante": 12, "agricultor": 30, "obrero": 14, "tecnico": 3, "policia": 5,
    "estatal": 4, "comerciante": 4, "docente": 4, "periodista": 3, "medico": 5,
    "ingeniero": 3, "desempleado": 3, "jubilado": 10
  }
}
```

- `apoyo_pct`: lealtad ≥ 50. `descontentos_pct`: satisfacción < 30. `hambre_critica_pct`: hambre > 80. `sin_dinero_pct`: NPCs que no pueden pagar su comida. `hospital_ocupacion_pct`: (internados + NPCs en espera de cama) / camas, con mínimo 1 cama; más de 100 es hospital saturado. `defensa`: por zona, derivada de `seguridad`, de dónde están los policías y de la `integridad` de la zona (sección 14). `orden`: por zona, derivado de los policías dedicados al orden en la zona (sección 14). `amenaza`: por zona, la amenaza percibida (sección 14); se expone para la capa de lectura del mapa (UI §6). `productividad_total`: suma de la productividad (0-100) de cada NPC.

- **Historial [cerrado]:** excepción acotada a "lo derivado no se guarda". El motor agrega cada día un punto a una serie por indicador clave (`reserva`, `inflacion`, `satisfaccion_media`, `hambre_critica_pct`, `apoyo_pct`, `poblacion`) y la UI solo la lee (UI §5). Es un registro de lectura: ninguna regla lo usa y no es estado de simulación, pero entra en el guardado para recuperarlo al cargar la partida. Rendimiento: se escribe un valor por indicador por día, sin recalcular nada. Pasado el tope `historial_max_dias` (CALIBRACION), los días más viejos se compactan por promedio semanal. El registro de hechos del historial son los eventos (sección 14), que también se guardan.

## 11. Objetivo (condición sobre los datos de arriba)

**Elecciones**
```json
{
  "victoria": { "metrica": "apoyo_pct", "op": ">=", "umbral": 50, "plazo_dia": 365 },
  "derrota": { "metrica": "hambre_critica_pct", "op": ">", "umbral": 50 }
}
```

**Zombies**
```json
{
  "victoria": { "metrica": "poblacion", "op": ">=", "umbral": 40, "plazo_dia": 180 },
  "derrota": { "metrica": "poblacion", "op": "<", "umbral": 40 }
}
```

- La derrota se evalúa en cualquier momento y termina la partida (evento `fin_partida`). La victoria se evalúa al llegar el plazo: es un hito que emite el evento `victoria` y la partida sigue. Los umbrales son parámetros del mundo.
- **Objetivo y progreso visibles [cerrado].** El jugador ve siempre la métrica de victoria con su meta y los días restantes, y la métrica de derrota con su límite. Una flecha indica la tendencia respecto del período anterior, sin proyección. El indicador de derrota cambia de color cuando recorrió un tramo de la distancia entre su valor inicial y su límite (el tramo está en CALIBRACION). El panel aclara que la victoria se evalúa al llegar el plazo y, una vez cumplida, la marca como cumplida. Son datos derivados (sección 10): no hay estado nuevo.

## 12. Reglas (borrador)

**Economía** (lo individual aplica desde `individual`; déficit, emisión e inflación desde `fiscal`)

- **Ingreso:** NPC privado = (min + `ingreso_pos` / 100 × (max − min)) × productividad. Comerciante: más una comisión sobre las ventas (sección 2). Público = `salario_publico`. Jubilado = `pension_base`.
- **Impuestos:** recaudación = Σ (ingreso del grupo × tasa del grupo). La pérdida por falta de estatales está en Servicios. Pagan todos los grupos con ingreso, incluido el público (sobre su salario); los `sin_ingreso` no pagan. El NPC cobra su **ingreso neto** = ingreso − impuesto, y su gasto diario sale del neto.
- **Nómina:** empleados públicos × `salario_publico`.
- **Pensiones:** jubilados × `pension_base`. Gasto obligatorio (desde `individual`).
- **Gasto diario del NPC:** primero comida (precio × consumo), después un gasto de vida (% del ingreso neto, menor con codicia alta). Lo que sobra va a `dinero`. El gasto de vida sale del sistema (no se modela a quién va).
- **Subsidios:** transferencia de dinero a los NPCs del grupo. Los decide el gobernador y apuntan a un grupo de roles (inyección directa). Subsidiar servicios queda para el nivel 2 (HOJA_DE_RUTA §4).
- **Disponible** = ingresos − nómina − pensiones − garantía alimentaria. Se reparte en presupuesto, subsidios y prensa. Lo no asignado va a `reserva`. Las compras de alimento (intercambio) no restan del disponible: se pagan de la `reserva`, para que importar comida no deje a los servicios sin presupuesto. Si la reserva no alcanza, la compra se reduce a lo que la reserva cubre.
- **Déficit:** disponible < 0 → se usa la `reserva`; después, solo con `fiscal`, se emite hasta el tope autorizado (sube `inflacion`); si aún falta, hay impago. Con impago, los empleados públicos pierden satisfacción y productividad por regla del motor, y se dispara la acción de condición `huelga` (sección 7), que no depende de la IA.
- **Inflación:** sube con la emisión relativa a la economía y decae sin ella. Encarece el alimento, devalúa `reserva` y `dinero`. Los ingresos no se ajustan solos: la inflación les quita poder de compra y el gobernador ajusta a mano el salario público.
- **Circulación:** el dinero que gastan los NPCs sale del sistema y lo que cobran entra desde afuera. No se modela quién le paga a quién (simplificación del nivel 1).

**Alimento**

- **`simple`:** consumo = población × `consumo_por_npc` × ración / 100, desde el almacén común. Precio fijo. Si no alcanza, reparto parejo. La ración va de 50 a 100 (100 es lo normal y no se puede subir). Con ración < 100 el hambre tiende a un valor proporcional al recorte, `k_hambre` × (1 − ración / 100), acotado a 0-100, mientras el almacén cubra esa ración: no hay umbral ni salto. El almacén tiene tope (silo, sección 4).
- **`individual`:** precio y reparto según la sección 4.
- **Garantía alimentaria:** el estado paga un % del faltante de comida de los NPCs sin dinero suficiente. Costo = faltante × precio × %. La comida de los menores la paga siempre el estado (100%).
- **Intercambio:** el estado compra o vende alimento al exterior, hasta la capacidad de los comerciantes. Precio externo = `precio_base` × (1 + inflación / 100) × factor de sequía (sube con sequía y plaga). La compra cuesta más que la venta (el diferencial está en CALIBRACION). La compra se paga de la reserva (ver Disponible); la venta es ingreso.

**Servicios**

- **Cobertura** = min(1, profesionales del rol / profesionales objetivo). El objetivo es un % de la población y es dato del escenario (valores en CALIBRACION; en zombies el de policías es mayor).
- **Inversión** = fondos asignados al área / costo base del área (proporcional a la población). Rendimientos decrecientes sobre 1.
- Indicador = indicador + (cobertura × inversión) − decaimiento.
- **Administración:** pérdida de recaudación y presupuesto = (1 − cobertura de estatales) × pérdida máxima.
- **Cobertura baja:** si la cobertura de `policia` o de `medico` cae por debajo de un umbral, suma un recargo gradual y proporcional a lo que le falta: miedo en el caso de la policía, malestar (satisfacción) en el de los médicos. Así, en un mundo sin amenazas, recortar esos cupos no es solo ahorro.
- Seguridad baja el miedo (total de la ciudad) y, repartida por zona como `defensa`, los ataques de la plaga zombie (secciones 5 y 14). Infraestructura sube la productividad y acelera la reparación de las zonas (sección 14). Salud: los médicos dan las camas del hospital y la inversión da la rapidez de cura (sección 12, Salud). Educación sube el progreso de los estudiantes.

**NPCs**

- **Producción:** productividad = laboriosidad × salud × satisfacción × clima × infraestructura × factor fiscal × modificadores. Las variables se normalizan a 0-1; clima, infraestructura y factor fiscal son multiplicadores cercanos a 1. El factor fiscal vale 1 hasta una tasa umbral y baja linealmente por encima (umbral y pendiente en CALIBRACION). Si tiene una `accion` con el efecto `fuera_de_puesto` o está internado, no produce.
- **Hambre:** sube cuando `accesoComida` < 1 (en `simple`, cuando el almacén no alcanza para la ración) y baja al comer.
- **Educación:** el estudiante suma progreso diario (más con docentes e inversión). A 100 sube de nivel.
- **Salud (individual).** Cada día, en este orden: (1) golpes de los fenómenos (sección 5); (2) daño por hambre crítica (hambre por encima de su umbral); (3) internación; (4) cura; (5) si la salud llega a 0, el NPC muere. Los golpes y las muertes se registran uno por uno con su origen (`clima:plaga_zombie`, `clima:pandemia`); el daño por hambre y las curas, agregados por día (sección 8). Un golpe no mata a un NPC sano, pero sí puede matar a uno débil.
- **Hospital.** El NPC con salud < `umbral_hospital` pide cama. Camas = médicos activos × `pacientes_por_medico`. Se interna primero a los de menor salud; el resto espera en su casa. El internado no produce ni cobra por su trabajo (el público mantiene su salario) y se cura por día `cura_base` × (0,5 + 0,5 × indicador `salud` / 100). Recibe el alta con salud ≥ `alta`. Quien no está internado se cura `cura_natural` por día si su hambre está por debajo de su umbral. Los médicos dan las camas; la inversión en salud, la rapidez de cura. El internado está en el hospital (`centro`) y no recibe ataques en el nivel 1.
- **Muerte.** El NPC sale de la población, su puesto queda vacante y, si era columnista, sale de su medio.
- **Miedo:** con la plaga zombie tiende a `intensidad` × `atenuacion`^distancia × (1 − `defensa`/100) × (1 − 0,5 × valentía/100), con la distancia y la `defensa` de su zona efectiva y el valor más alto entre los fenómenos activos. Las noticias alarmistas lo suben (modificador).
- **Satisfacción:** baja con hambre, miedo, mala salud, desempleo, poco poder adquisitivo (dinero en `individual`), impuestos (más con codicia) e inflación. Sube con subsidios. Tiene inercia (resiliencia).
- **Lealtad:** sigue a la satisfacción con retraso. La rebeldía amplifica las caídas.
- **Edad:** cada NPC suma un año cada 365 días, en su propio día (se fija al generar el mundo). A los 18 pasa a adulto y deja de estudiar, a los 65 se jubila.

## 13. Alcance del nivel 1 y a futuro

- **Módulos de economía:** `simple` (nivel 1), `individual` y `fiscal` (nivel 1.1, HOJA_DE_RUTA §3) (ver 3.1). Son lógica del núcleo. El campo `dinero`, que usa `individual`, existe desde el nivel 1 y los tres módulos comparten la misma salida (sección 3.1): sumar un módulo no cambia lo ya construido.
- **Calibración:** los valores que se ajustan probando, los criterios de arranque de un mundo y el plan de pruebas están en CALIBRACION.md. Los valores calibrados de cada escenario viven en su preset (`presets/*.json`) y el historial de rondas, en el informe de calibración.
- **Guardado [cerrado]:** un archivo por partida, en un formato independiente del lenguaje (JSON versionado y comprimido), para que cualquier implementación del motor lo lea igual (UI §11). Contiene: `version_formato`, la semilla, la configuración efectiva del mundo (con los valores del preset ya aplicados, para que un cambio futuro del preset no altere una partida guardada, y con las marcas de "configuración de prueba"), el estado completo del último día cerrado (NPCs, gobierno, clima, medios, integridad) con el estado del generador de azar, las elecciones guardadas del clasificador y los textos generativos (sección 9), el registro de eventos y el historial (sección 10). Se retoma desde esa foto y no reproduciendo la partida desde el día 1, así que cargar cuesta lo mismo en el día 10 que en el 300. La foto se toma en memoria al cierre de un día y se escribe en segundo plano: no pausa ni frena la simulación. Escritura segura: se escribe a un archivo temporal y se renombra al terminar, así un corte no deja un guardado roto. Cada partida tiene un guardado manual y un autoguardado periódico (UI §13; período en CALIBRACION). Un guardado de otra versión de formato se migra si hay migración y, si no, se rechaza con un aviso claro.
- **Edad en el nivel 1:** los NPCs envejecen sin morir por vejez ni nacer. La población baja solo por salud 0.
- **Fuera del nivel 1 y a futuro:** ver HOJA_DE_RUTA §3 a §7. Lo preparado desde el nivel 1 para no volver atrás está en HOJA_DE_RUTA §6.

## 14. Espacio: zonas y contrato con la UI

El motor conoce el espacio solo por **zonas**. Las coordenadas, el movimiento y los dibujos son de la UI. Un mundo de una sola zona, solo para pruebas y calibración (no es un mundo jugable), equivale a no tener espacio (`zona_destino` se ignora).

**Zonas** (configuración del mundo, no es estado): 4 a 6 por mundo jugable, con su vecindad. La distancia entre dos zonas es el número de pasos del camino más corto (si hay empate, el primero en el orden de la configuración).

```json
{
  "zonas": {
    "centro": { "vecinas": ["norte", "este", "sur", "oeste"] },
    "norte":  { "vecinas": ["este", "oeste", "centro"] },
    "este":   { "vecinas": ["norte", "sur", "centro"] },
    "sur":    { "vecinas": ["este", "oeste", "centro"] },
    "oeste":  { "vecinas": ["sur", "norte", "centro"] }
  }
}
```

- Cada NPC tiene una `zona` (sección 1), asignada al generar el mundo según su rol (configuración del escenario; por ejemplo, agricultores en la periferia). Su **zona efectiva** es la `zona_destino` de su acción en curso si la tiene; si está internado, el `centro`; si no, su `zona`.
- Los fenómenos con daño tienen `origen` (sección 5).
- **Mapa contiguo:** el grafo de vecindad tiene que poder dibujarse como un mapa sin cruces (grafo planar), para que dos zonas vecinas sean contiguas en la vista (UI §9). Es requisito de la configuración de cada mundo; el ejemplo de arriba lo cumple.

**Defensa por zona** (derivada, no se guarda). `defensa[zona]` = min(100, `seguridad` × (1 − c + c × n × parte)) × (1 − `k_integridad` × (1 − `integridad`/100)), con `parte` = policías en defensa de la zona / policías totales, n = cantidad de zonas y c = `movilidad_defensa` y `k_integridad`. Sin policías, `parte` = 1/n. Con los policías todos en defensa, repartidos parejos, y la integridad en 100, `defensa` = `seguridad`. `seguridad` sigue siendo el indicador total (sección 3); la defensa de cada zona sale de dónde están los policías y de la integridad de la zona (abajo).

**Integridad por zona** (estado, se guarda; 0-100, arranca en 100). Mide cuánto aguanta la zona frente a los ataques.

- **Daño:** cada golpe de un fenómeno con protección (`plaga_zombie`) resta `dano_integridad` a la integridad de la zona donde cae. La pandemia no la daña.
- **Efecto:** una integridad baja reduce la `defensa` de la zona (fórmula de arriba), así que los ataques pasan más fácil y el daño se acumula.
- **Reparación:** cada día suma a la integridad de la zona `rep_por_npc` × reparadores de esa zona × (0,5 + 0,5 × indicador `infraestructura` / 100), con tope 100. Reparadores: obreros e ingenieros de la zona que no estén internados ni con una `accion` con el efecto `fuera_de_puesto`. Reparar no reemplaza su producción.
- No agrega palancas: el gobernador la influye con el presupuesto de infraestructura y con los cupos de ingenieros.
- Se desarrolla en el nivel 2 como construcción real (HOJA_DE_RUTA §4): solo cambia de dónde sale este número.

**Reubicación.** Cada día, un % de los policías (valor en CALIBRACION) cambia de `zona` hacia la zona con más necesidad total, elegida con peso proporcional a esa necesidad. La necesidad total de una zona es su necesidad de defensa más su necesidad de orden (ver Reparto policial, abajo), sumadas tal cual **[propuesta: sin peso por escenario hasta que las corridas lo pidan]**. Si la necesidad total es 0 en todas, no se mueven. En elecciones se mueven solo por orden; en zombies, por la mezcla de las dos.

**Amenaza percibida por zona** (derivada): el mayor entre estos dos valores.

- Aviso: en la zona de `origen` de un fenómeno anunciado o activo, el mejor valor de alcance × credibilidad / 100 entre las noticias de aviso vigentes (sección 6). Sin noticia, vale 0.
- Golpes recientes: crece con la cantidad de golpes en esa zona dentro de una ventana de días reciente, con tope 100 (peso y ventana en CALIBRACION).

La ciudadanía percibe, no sabe: un aviso tardío o poco creíble deja la defensa mal ubicada. El gobernador ve el aviso y su origen exactos (GOBERNADOR §7). En el nivel 1 no puede hablarle directo a la gente: su palanca es la prensa (financiamiento y regulación).

**Reparto policial: defensa y orden** (derivado, no se guarda). Los policías de cada zona se dedican a dos usos: **defensa** contra los fenómenos con protección (solo `plaga_zombie`; la pandemia, la sequía y la plaga de cultivos no se frenan con policía) y **orden** contra el caos espontáneo. Cada día, cada zona calcula dos necesidades (0-100):

- Necesidad de defensa: su amenaza percibida (arriba).
- Necesidad de orden: min(100, % de NPCs de la zona con una acción espontánea en curso + % de descontentos de la zona).

Los policías de la zona se reparten entre los dos usos en proporción a esas necesidades. Cada uso con necesidad mayor que 0 recibe al menos `min_reparto`. Si una necesidad es 0, la otra recibe todo; si las dos son 0, todos quedan en orden. En elecciones no hay amenaza, así que toda la policía queda en orden. En zombies la amenaza atrae policías a la defensa y deja menos para el orden. La reubicación entre zonas responde a la necesidad total de cada zona, defensa más orden (Reubicación, arriba).

**Orden por zona** (derivado, no se guarda). `orden[zona]` = min(100, 100 × (policías en orden de la zona / población de la zona) / `objetivo_orden`), con `objetivo_orden` (por ejemplo, un policía cada tantos habitantes). Es el freno del contagio de las acciones espontáneas de esa zona (sección 7.2): contagio efectivo = `contagio` × (1 − `k_orden` × `orden`/100) × (1 − `k_satisfaccion` × satisfacción media de la zona/100), con `k_orden` y `k_satisfaccion` (valores en CALIBRACION). Solo afecta a las acciones espontáneas: las de condición (sección 7) no se modifican. El gobernador no fija este reparto: lo influye con los cupos y el presupuesto de seguridad. Una palanca para inclinarlo queda pendiente (GOBERNADOR §8).

**Eventos (contrato con la UI).** Cada evento del motor lleva `id`, día, zona, actores, `origen` y, si lo hay, `causa` (el id del evento o modificador que lo provocó, sección 8):

```
ataque      {zona_origen, zona_destino, resultado: repelido | golpe, npc?}
golpe       {npc, dano, origen}
muerte      {npc, causa}
internacion, alta {npc}
accion_inicio, accion_fin {accion, npcs[], zona_destino, origen}
aviso       {fenomeno, zona_origen, dias_restantes}
reubicacion {npcs[], de_zona, a_zona}
defensa     {zona, valor}   // cambio diario
integridad  {zona, valor}   // cambio diario
orden       {zona, valor}   // cambio diario
fenomeno_inicio, fenomeno_fin {fenomeno, zona_origen?}
impago      {faltante}
hospital_saturado {ocupacion_pct}
noticia     {noticia, medio, tema}
palanca     {palanca, valor_anterior, valor_nuevo}   // cuando el cambio entra en vigencia; hecho raíz
victoria    {metrica, valor}   // hito: la partida sigue
fin_partida {metrica, valor}   // solo derrota; su causa es el evento que cruzó el límite
```

Reglas de la UI sobre los eventos: UI §9 y §11.

**Fuera del nivel 1:** lo que se promueve desde las zonas cuando una regla dependa de ello (HOJA_DE_RUTA §4 a §6).

## 15. Preguntas abiertas

Las preguntas que se resuelven midiendo (calibración de salud, zonas, contagio, clasificador, plazos de la IA, textos y memoria) están en CALIBRACION.md. Acá quedan las de diseño.

1. **Roles y niveles de educación:** se dejan los 13 roles y 4 niveles y se afinan después.
2. **Modelo de salud individual:** confirmar los golpes (sección 5) y el hospital (sección 12, Salud).
3. **Zonas y defensa:** confirmar el modelo (sección 14) y quiénes reparan.
4. **Catálogo de efectos:** confirmar el conjunto inicial (`fuera_de_puesto`, `anima`, `agita`, `acapara`, `moviliza`, `decorativa`) y qué efectos nuevos pide cada escenario.