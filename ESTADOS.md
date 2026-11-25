# Estados internos (borrador v0.38)

> Lo marcado **[cerrado]** está decidido; el resto es lo acordado hasta ahora, salvo lo listado en la sección 15. Los valores que se ajustan probando (constantes, coeficientes, umbrales, topes, plazos y valores iniciales) no viven acá: están en CALIBRACION.md y en el preset de cada escenario. Los números que aparecen en los ejemplos solo ilustran la forma de los datos. Escala 0-100 salvo donde se indique. Ejemplos escalados a unos 100 NPCs. Las palancas del gobernador están en GOBERNADOR.md; acá solo sus efectos sobre los estados. La economía es modular (sección 3.1).

---

## 1. Estado del NPC (uno por habitante)

```json
{
  "id": "npc_07",
  "nombre": "Marta",
  "edad": 34,
  "cumple_dia": 212,
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
  "economia": { "ingreso_pos": 60, "dinero": 40, "despensa": 6, "propension_gasto": 45 },
  "rol": "agricultor",
  "zona": "este",
  "internado": false,
  "accion": null,
  "modificadores": [
    {
      "id": "mod_3",
      "afecta": { "miedo": 10, "rebeldia": 10 },
      "duracion_dias": 5,
      "origen": "accion:predicar/npc_12",
      "causa": "ev_88",
      "texto": "Anda alterada desde que oyó predicar a Joaquín"
    }
  ]
}
```

- `edad`: define la **etapa** (se deriva): menor (<18) solo estudia, adulto (18-64) trabaja (en el nivel 1 solo estudian los menores), jubilado (65+) no trabaja. Cada NPC cumple años en su propio día (`cumple_dia`, día del año), fijado al generar el mundo por semilla; se guarda.
- `educacion.nivel`: 0 sin estudios, 1 básico, 2 medio, 3 superior. Define a qué roles accede.
- `personalidad` es el valor **base y fijo** de cada rasgo. Las reglas usan el valor **efectivo** = base + modificadores activos (temporales, con decaimiento), acotado a 0-100. `variables` cambian. Salud 0 = muere.
- `economia` **[cerrado: cada NPC gana y gasta su dinero]**: `ingreso_pos` (0-100) es su posición fija dentro del rango de ingreso de su rol (da variedad). `dinero` es lo que tiene ahorrado. `despensa` son los días de comida que tiene en casa (sección 4). `propension_gasto` (0-100) es su propensión al gasto de vida (sección 4): se asigna al generar el mundo a partir de su personalidad y la semilla y no cambia, como `ingreso_pos` (los efectos `gasta` y `ahorra` solo la modifican con modificadores temporales). Los campos existen siempre.
- `accion`: acción de la tabla (sección 7) en curso, elegida por el director de caos (sección 9): el motor por afinidad y azar o, si la IA opcional está activa, con el clasificador. Si tiene el efecto `fuera_de_puesto` (sección 7.1), no produce ni cobra ingreso por su trabajo. Los empleados públicos mantienen su salario (propuesta), salvo en impago.
- `modificadores`: canal único de efectos (sección 8), con `origen`.
- `zona`: zona del mundo donde está el NPC (sección 14), asignada al generar el mundo según su rol. Su zona efectiva puede ser otra (acción con `zona_destino`, internación). Los policías cambian de `zona` al reubicarse. La zona efectiva es la que usan las reglas de lo que pasa en un lugar; la `zona` se usa solo para la asignación inicial y la reubicación de los policías (sección 14).
- `internado` (bool): el NPC está en el hospital (sección 12, Salud). No se deriva de la salud, porque depende de las camas y del orden de espera, así que se guarda (sección 13).

## 2. Catálogo de roles y grupos (configuración, no es estado)

```json
[
  { "id": "estudiante",  "edad_min": 0,  "edad_max": 24,   "educ_min": 0, "estudia": true, "produce": {} },
  { "id": "agricultor",  "edad_min": 18, "edad_max": 64,   "educ_min": 0, "afinidad": "laboriosidad", "produce": { "alimento": "ver CALIBRACION" } },
  { "id": "obrero",      "edad_min": 18, "edad_max": 64,   "educ_min": 0, "afinidad": "laboriosidad", "produce": {} },
  { "id": "policia",     "edad_min": 18, "edad_max": 64,   "educ_min": 1, "afinidad": "valentia",     "publico": true, "produce": { "seguridad": 1 } },
  { "id": "estatal",     "edad_min": 18, "edad_max": 64,   "educ_min": 1, "afinidad": "laboriosidad", "publico": true, "produce": { "administracion": 1 } },
  { "id": "comerciante", "edad_min": 18, "edad_max": 64,   "educ_min": 1, "afinidad": "codicia",      "produce": { "comercio": 1 } },
  { "id": "empresario",  "edad_min": 18, "edad_max": 64,   "educ_min": 2, "afinidad": "codicia",      "produce": {} },
  { "id": "tecnico",     "edad_min": 18, "edad_max": 64,   "educ_min": 2, "afinidad": "laboriosidad", "produce": { "tecnificacion": 1 } },
  { "id": "docente",     "edad_min": 18, "edad_max": 64,   "educ_min": 2, "afinidad": "laboriosidad", "publico": true, "produce": { "educacion": 1 } },
  { "id": "periodista",  "edad_min": 18, "edad_max": 64,   "educ_min": 2, "afinidad": "rebeldia",     "produce": { "informacion": 1 } },
  { "id": "medico",      "edad_min": 18, "edad_max": 64,   "educ_min": 3, "afinidad": "laboriosidad", "publico": true, "produce": { "salud": 1 } },
  { "id": "ingeniero",   "edad_min": 18, "edad_max": 64,   "educ_min": 3, "afinidad": "laboriosidad", "publico": true, "produce": { "infraestructura": 1 } },
  { "id": "desempleado", "edad_min": 18, "edad_max": 64,   "educ_min": 0, "produce": {} },
  { "id": "jubilado",    "edad_min": 65, "edad_max": null, "educ_min": 0, "produce": {} }
]
```

- `ingreso: [min, max]` por rol (valores en CALIBRACION): lo que gana por día un NPC privado empleado en ese rol, pagado por su empresa (sección 4). Real = (min + `ingreso_pos` / 100 × (max − min)) × productividad.
- `publico: true`: cobra el `salario_publico`, igual para todos: `salario_base_publico` × palanca / 100, con `salario_base_publico` (se calibra por escenario y puede quedar por debajo del ingreso privado). No tiene ingreso propio y forma parte de la nómina.
- El obrero no produce un recurso físico: su aporte es el ingreso gravable. **El técnico [decidido]** es el agrotécnico de la empresa de alimento: hasta un tope proporcional a los agricultores (`tecnicos_por_agricultor`), cada técnico sube la productividad de la empresa (`k_tecnificacion`, valores en CALIBRACION). Así la educación media tiene un efecto económico.
- **Comerciante [decidido]:** dueño de su empresa comercial (sección 4). Su ingreso es la ganancia de la empresa: el margen sobre la comida que se vende más las ventas de otros bienes (gasto de vida de los NPCs), menos los sueldos de sus obreros. Cada comerciante sostiene hasta `empleados_por_comerciante` obreros. El tope efectivo de obreros = min(`tope_privado[obrero]`, comerciantes × `empleados_por_comerciante`). Si baja el número de comerciantes, el tope efectivo baja de inmediato, pero los obreros que quedan sin puesto no pasan todos a desempleados de golpe: pasan como máximo `max_pase_desempleo_por_dia` por día (valor en CALIBRACION), elegidos al azar con semilla entre los que exceden el tope. Mientras haya exceso no se cubren vacantes de obrero. Cada pase queda con origen `estado:comercio` y `causa` = el evento que redujo a los comerciantes (muerte, acción en curso), para poder explicar la cadena. El comerciante también da la capacidad de intercambio con el exterior.
- **Empresario [decidido]:** dueño de las empresas que no son comerciales (por ahora, la de alimento). Su ingreso es la ganancia de la empresa. Es un rol privado, con `tope_privado[empresario]` = un puesto por empresa. Solo cobra la ganancia, así que una acción con `fuera_de_puesto` no le quita ese ingreso (es de propiedad, no de trabajo) **[propuesta]**: la empresa sigue operando aunque el puesto esté vacante (así la muerte de un NPC no corta la comida) y el puesto se cubre por afinidad (codicia) y vacantes, como cualquier rol privado. Pertenece al grupo `comercio`. Los medios no tienen empresario (sección 6). Las empresas están en la sección 4.
- **Sin ingreso propio:** los jubilados reciben una pensión fija (`pension_base`), gasto obligatorio del estado. La comida de los menores la paga el estado. Los desempleados dependen de la garantía alimentaria y de los subsidios.
- `policia`: rol de seguridad en el nivel 1, con dos usos: defensa y orden (sección 14). En zombies el gobernador sube el cupo y los NPCs lo cubren por afinidad (valentía), como cualquier rol. Su `zona` define dónde defiende (sección 14).
- `medico`: da camas al hospital público (sección 12, Salud). Salud, educación y seguridad son por ahora solo servicios públicos: no hay clínicas ni escuelas privadas (IDEA §10).
- `periodista`: columnista de un medio, produce `informacion`. Es un rol privado: cobra su ingreso del rango, paga impuestos (grupo `comercio`) y no depende de su medio en el nivel 1.
- `alimento` es el stock de la empresa de alimento (sección 4). `seguridad`, `salud`, `educacion` e `infraestructura` son indicadores del gobierno (sección 3). Los servicios actúan según su **cobertura** (profesionales respecto de la población). El indicador `salud` es la calidad de la atención sanitaria, no la salud de la gente: no existe una salud agregada de la comunidad. No es la `salud` del NPC.
- `administracion`: sin estatales se pierde parte de la recaudación y del presupuesto. `comercio`: capacidad de intercambio de alimento con el exterior.
- **Estatal y privado [decidido]:** son estatales la policía, la administración, las escuelas públicas, el hospital público y la obra pública (roles con `publico: true`, con cupo del gobernador). Son privados con empresa la de alimento (agricultores y técnicos, con el empresario como dueño) y las comerciales (obreros, con el comerciante como dueño). Los medios (periodistas) son privados simplificados: sin dueño NPC y con ingresos propios constantes en el nivel 1. Estudiantes, desempleados y jubilados no tienen empleador.

**Cambios de rol**

- Menor: rol forzado `estudiante`. Al cumplir 18 elige. En el nivel 1 solo estudian los menores: el estudiante egresa cuando `edad` ≥ 18 (se evalúa cada día, no por igualdad exacta) y al generar el mundo los estudiantes tienen menos de 18. `edad_max` 24 queda como dato para estudios superiores (a futuro).
- Adulto: cada cierto tiempo puede cambiar a un rol para el que cumpla edad y educación, si hay vacante. Elige por afinidad.
- Al superar el `edad_max` de su rol sin llegar a 65, pasa a `desempleado`. A los 65 pasa directo a `jubilado` y deja de trabajar.
- El gobernador fija **cupos** solo de los roles públicos. Los roles privados no tienen cupo del gobernador: se cubren por afinidad y vacantes, con un tope por escenario (`tope_privado[rol]`, parámetro del mundo en CALIBRACION, no palanca). Vacantes = tope − ocupados. Un puesto solo se cubre con NPCs que cumplan los requisitos.
- Menores, estudiantes, desempleados y jubilados consumen y no producen ni ganan por trabajo. Estar desempleado baja la satisfacción.

**Grupos** (para impuestos y subsidios). Pagan impuesto todos los grupos con ingreso, incluido el público (sobre su salario); los `sin_ingreso` no tienen ingreso gravable. Los subsidios apuntan a un grupo de roles, salvo `publico`, que no se subsidia (GOBERNADOR §4):

```json
{
  "agro": ["agricultor", "tecnico"],
  "industria": ["obrero"],
  "comercio": ["comerciante", "empresario", "periodista"],
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
  "impago": false,
  "indicadores": { "seguridad": 40, "salud": 50, "educacion": 50, "infraestructura": 50 },
  "integridad": { "centro": 100, "norte": 100, "este": 100, "sur": 100, "oeste": 100 },
  "palancas": {}
}
```

- `reserva`: stock de fondos. Lo no asignado del presupuesto va acá. También paga las compras de alimento (sección 12).
- `inflacion` **[cerrado]**: variable del gobierno, no del escenario. Sube con la emisión y decae sin ella. Solo cambia con la extensión `fiscal`; sin ella vale el valor del preset. Se expresa en % (15 = precios ×1,15).
- `finanzas`: resultado del último período (se recalcula, no se decide). `deficit` se usa también en `base` (con él se evalúa el impago, sección 12); `emision` solo se usa con `fiscal`.
- `indicadores`: se acumulan con inversión y personal, y decaen con el tiempo. `seguridad` es el total de la ciudad; la defensa de cada zona se deriva de dónde están los policías y de su `integridad`, que se guarda acá (sección 14).
- `palancas`: valores vigentes de las palancas del gobernador (estructura en GOBERNADOR.md), incluido `gasto_prensa`, que se reparte parejo entre los medios (sección 6).
- `impago` (estado, se guarda): se evalúa en cada liquidación, porque el déficit solo existe ahí (sección 3.1). Queda activo desde una liquidación con faltante hasta la primera liquidación sin faltante (evento `impago_fin`, sección 14). Reglas: sección 12.
- También son estado y se guardan, porque no se recalculan (sección 13): los **acumuladores del período fiscal** (ingresos y gastos que se liquidan cada `periodo_fiscal_dias`) y los **cambios de palanca pendientes** (los que entran en vigencia al día siguiente, GOBERNADOR §4).

### 3.1 Economía (esquema cerrado, extensión abierta)

La economía es un módulo con salidas fijas. El resto del juego (hambre, satisfacción, servicios, objetivo) solo lee esas salidas. El nivel 1 usa el módulo `base`; la extensión `fiscal` llega en el nivel 1.1. El módulo que antes se llamaba `individual` es ahora `base`; `simple` ya no es parte del juego (el prototipo puede conservarlo para pruebas). Cada escenario trae su preset (cambiar la economía se marca como "configuración de prueba").

```json
{ "economia": { "modulo": "base", "extensiones": [] } }
```

```ts
interface SalidaEconomica {
  accesoComida: Record<npcId, number>      // 0 a 1: qué parte de su consumo puede cubrir
  poderAdquisitivo: Record<npcId, number>  // 0 a 100: deriva del dinero y del ingreso neto frente al precio de la comida; entra en la satisfacción
  disponible: number                       // fondos para presupuesto
  precioAlimento: number
  inflacion: number
}
```

Se calcula una vez por día.

- **Período fiscal:** ingresos y gastos se acumulan a diario y se liquidan cada `periodo_fiscal_dias`. Presupuesto y subsidios se reparten en cada liquidación. Es independiente del período del caos (sección 9).
- **Extensión `fiscal`:** solo se activa sobre `base`. Agrega la emisión hasta el tope autorizado y la inflación dinámica (sección 12).
- **Preset inicial:** elecciones y zombies arrancan en `base`. En elecciones, sin emisión: el límite del gasto es la reserva y el impago.
- **Circuito del dinero [cerrado]:**

```
NPC ── compra comida y gasta en otros bienes ──► empresa comercial ── resto de la venta ──► empresa de alimento
empresa comercial ── sueldos ──► obreros · ganancia ──► comerciante (dueño)
empresa de alimento ── sueldos ──► agricultores y técnicos · ganancia ──► empresario (dueño)
NPC ── impuestos ──► estado ── nómina, pensiones, subsidios, garantía ──► NPC
estado ◄──► exterior (intercambio) · NPC ──► exterior (`fraccion_gasto_exterior`)
```

| Elemento | `base` (nivel 1) | Extensión `fiscal` (nivel 1.1) |
|---|---|---|
| Alimento | Empresas, mercado con precio y despensa por NPC (sección 4) | Precio afectado por la inflación |
| Recaudación | Impuestos por grupo | Igual |
| NPC | `dinero`, despensa, ingreso propio, gasto de vida | Igual |
| Subsidios | Transfieren dinero al grupo | Igual |
| Nómina | Sí | Sí |
| Pensiones | Sí | Igual |
| Déficit | Se usa la reserva y, si no alcanza, hay impago | Igual, y antes del impago se puede emitir |
| Inflación | Fija (valor del preset) | Dinámica: sube con la emisión |

## 4. Alimento y empresas

El alimento es parte de la economía y no depende directo del gobernador: lo producen y venden empresas privadas, cada NPC lo compra con su `dinero`, lo guarda en su despensa y lo consume. El gobernador lo regula de forma indirecta con impuestos, subsidios, garantía alimentaria, intercambio y `precio_maximo` (GOBERNADOR §4).

```json
{
  "empresas": {
    "alimento": { "dueno": "npc_44", "stock": 1500, "dias_stock": 15, "silo_dias": 25, "respuesta": null },
    "comerciales": [ { "id": "com_1", "dueno": "npc_12", "respuesta": null } ]
  },
  "alimento": { "consumo_por_npc": 1, "precio": 1.0 },
  "precio_base": 1.0
}
```

**Empresas** (estado, se guardan). `dueno` es el NPC dueño o `null` si el puesto está vacante.

- **Alimento** (una por mundo): emplea a los agricultores y a los técnicos. Es dueña del `stock`. Dueño: el empresario.
- **Comerciales** (una por comerciante): emplean a los obreros. Dueño: el comerciante.
- **Medios:** son privados simplificados (sección 6) y no entran en este circuito en el nivel 1.
- `respuesta` (estado, se guarda): `null` o `{ "tipo": "recortar_sueldos", "dias_restantes": 4 }` con su `origen` y `causa` (sección 8). Los acumuladores de ingresos y sueldos del período de pago (`periodo_pago_dias`) también son estado de cada empresa y se guardan.

**Producción y stock.** La producción de los agricultores, multiplicada por la tecnificación de los técnicos (sección 2), va al `stock` de la empresa de alimento. `dias_stock` y `precio` se derivan. **Silo:** el `stock` tiene un tope de `silo_dias` días de consumo y lo que excede se pierde. Sin tope, un superávit chico se acumula sin límite y las sequías no tienen efecto.

**Despensa [decidido].** Cada NPC tiene una despensa (días de comida en casa) con un tope por casa, `despensa_max_dias`. Cada día consume un día de su despensa, equivalente a `consumo_por_npc` de comida. Al generar el mundo, la despensa de cada NPC arranca en su objetivo, para que inicialmente todo encaje. Su **objetivo** de días sube con su prudencia (valentía baja) y con su miedo: objetivo = `objetivo_base_dias` × (1 + `k_prudencia` × (1 − valentía/100) + `k_miedo` × miedo/100), con tope `despensa_max_dias`. La acción `acapara` suma `acapara_extra_dias` al objetivo mientras dura (sección 7.1). Cuando la despensa baja de `umbral_recompra_dias`, el NPC recompra hasta su objetivo, con su `dinero` y si hay stock. Si el stock no alcanza para todos, el reparto es parejo. Así salen corridas de compra de forma natural: noticia alarmista, miedo, compra anticipada, mercado vacío, precio sube.

**Canal de venta [decidido para la v1].** La comida siempre se puede comprar. La venta pasa por las comerciales con un margen (`margen_comercial_pct`), repartido entre las que haya; el resto va a la empresa de alimento. Si no queda ninguna comercial, todo va a la empresa de alimento y la venta sigue igual. Más adelante se puede sumar una capacidad de venta por comerciante, con una alternativa directa limitada, sin cambiar el circuito: la v1 equivale a capacidad ilimitada.

**Precio.** `precio` = min(precio de mercado, tope), con precio de mercado = `precio_base` × escasez (según `dias_stock`) × clima × (1 + inflación / 100), y tope = `precio_base` × `precio_maximo` / 100 (palanca, GOBERNADOR §4). Sube cuando el stock baja.

**Sueldos y ganancia.** Cada empresa paga los sueldos de sus empleados (sección 12, Ingreso) y lo que le queda de las ventas es ganancia del dueño. La empresa no guarda caja: toda la ganancia pasa al dueño y solo es negativa si el dueño decide absorber una pérdida (tabla de respuestas, abajo); en cualquier otro caso los sueldos se ajustan para que la ganancia no baje de 0. El dueño solo paga impuesto sobre una ganancia positiva. Se liquida cada `periodo_pago_dias` (CALIBRACION), con los ingresos y sueldos acumulados del período, para que un día flojo no dispare nada. Con el puesto de dueño vacante la ganancia sale del sistema **[propuesta]** y no hay quien absorba pérdidas.

**Cuando una empresa no puede pagar los sueldos [decidido].** El motor lo detecta con una regla fija (ingresos del período menores a los sueldos), no es azar. Entonces sortea con su semilla una respuesta de una tabla cerrada, con pesos según la personalidad del dueño y la situación. Sin dueño en el puesto, solo se sortean las que no dependen de él. Cada respuesta dura un tiempo finito, y queda con origen `empresa:<id>/respuesta` y su `causa`, así se puede explicar. Más adelante el clasificador opcional podría elegir entre las respuestas, como en las acciones de condición (sección 7).

| Respuesta | Qué hace | Disponible si | Pesa más con |
|---|---|---|---|
| `absorber` | El dueño paga la diferencia con su `dinero` | El dueño tiene dinero | Codicia baja, resiliencia alta |
| `recortar_sueldos` | Todos cobran menos un % durante unos días, con un piso (`piso_sueldo_pct`) | Siempre | Sin sesgo |
| `despedir` | Los que sobran pasan a desempleados, al ritmo máximo `max_pase_desempleo_por_dia` | Tiene empleados | Codicia alta |
| `subir_margen` | La comercial sube su % de margen y se lo quita a la empresa de alimento; el precio que paga el NPC no cambia (así no choca con `precio_maximo`) **[propuesta]** | Solo comerciales | Codicia alta |

**Gasto de vida [decidido].** Los gastos fijos de un NPC son los impuestos y la comida. Lo que gasta de más (gasto de vida) varía por NPC: cada uno tiene su propia propensión al gasto, asignada al generar el mundo a partir de su personalidad y la semilla. Va a las empresas comerciales como ventas de otros bienes (se modela la plata, no los bienes). Una parte puede salir del sistema (importaciones) con `fraccion_gasto_exterior` (CALIBRACION, por defecto 0). Así, cuando la gente gasta menos por miedo, impuestos o inflación, las comerciales ganan menos y activan su respuesta, lo que baja aún más el gasto.

**Quién paga la comida de quien no puede.** La comida de los menores la paga siempre el estado. Los jubilados y desempleados compran con su pensión, sus subsidios y la garantía alimentaria (sección 12). El estado puede además comprar o vender alimento al exterior (intercambio, sección 12).

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

**Fenómenos con daño individual:** `pandemia` y `plaga_zombie` **atacan** a NPCs individuales. No existe una salud de la comunidad que reduzcan: cada NPC se enferma o muere por separado. Cada día, cada fenómeno activo hace una tirada de ataque por cada NPC vivo que no esté internado, con probabilidad `exposicion_max` × intensidad/100 × `atenuacion`^distancia (distancia entre el `origen` y la zona efectiva del NPC; sin `origen`, 0). En la `pandemia` la probabilidad se multiplica además por (1 + `k_saneamiento` × (1 − `infraestructura`/100)): con poca infraestructura (saneamiento) se contagia más gente **[propuesta]**. Si el tipo tiene protección, el ataque debe pasar las defensas de las zonas del camino más corto desde el `origen` hasta la zona del NPC, incluida la suya: cada zona lo repele con probabilidad `proteccion_max` × `defensa`/100, con `proteccion_max` (valor en CALIBRACION). Si alguna zona lo repele, el resultado es *repelido* en esa zona. Si pasa todas, es un **golpe**: resta a la salud un valor al azar dentro de `dano`, multiplicado por la vulnerabilidad de su edad (sección 12, Salud). Si el tipo tiene protección, el golpe también daña la integridad de la zona (sección 14). Ambos resultados son eventos (sección 14). Una horda suma ataques a los de la plaga: cada fenómeno activo tira por separado. En el nivel 1 la exposición es pareja entre los NPCs de una misma zona. Qué pasa después del golpe: sección 12, Salud.

| Tipo | Protección |
|---|---|
| `plaga_zombie` | `defensa` de las zonas del camino |
| `pandemia` | Ninguna (se enfrenta con el hospital) |

La `exposicion_max`, el rango de `dano` y la `atenuacion` de cada tipo están en CALIBRACION.

## 6. Estado de los Medios

**[cerrado]** Un medio es una entidad con parámetros. Un monopolio es el caso de un solo medio. Se elige en el panel. Por defecto, 1 a 3 medios. **No hay medio estatal:** todos los medios son privados y el estado puede ponerles plata (palanca `gasto_prensa`). En el nivel 1 son privados simplificados: no tienen dueño NPC ni entran al circuito de empresas (sección 4).

```json
[
  {
    "id": "medio_1",
    "nombre": "El Heraldo",
    "linea_editorial": { "afinidad_gobierno": 40, "sensacionalismo": 70 },
    "credibilidad": 65,
    "alcance_pct": 80,
    "columnistas": ["npc_31", "npc_58"],
    "finanzas": { "ingresos_propios": 30, "fondos_estado": 20, "dependencia_pct": 40 }
  }
]
```

- `dependencia_pct` = `fondos_estado` / (`ingresos_propios` + `fondos_estado`). Con más dependencia, `afinidad_gobierno` sube sola. Por debajo de `umbral_dependencia_pct` (CALIBRACION) no hay costo de credibilidad; por encima, la credibilidad cae. Si la dependencia vuelve bajo el umbral, la credibilidad se recupera de a poco. `afinidad_gobierno` sesga el tono de las noticias hacia el gobierno y, con él, el efecto de las noticias sobre la lealtad (el detalle va en el doc del director y la prensa).
- Nivel 1: `ingresos_propios` es una constante por medio (valor en CALIBRACION). No hay balance ni quiebra del medio. Que dependa de alcance y credibilidad no tiene nivel asignado (HOJA_DE_RUTA §7). `columnistas` limitan cuánto puede publicar (`informacion`).
- **Gasto de prensa:** `fondos_estado` = presupuesto de prensa del período (palanca `gasto_prensa`) ÷ cantidad de medios. El reparto es parejo: el gobernador no puede favorecer a un medio, y la diferencia entre medios la da su `ingresos_propios`. Más `fondos_estado` sube `alcance_pct` (con rendimientos decrecientes) y la dependencia. El alcance sale del gasto vigente y no se acumula. En el nivel 1 esta es la única palanca sobre la prensa: `financiamiento` y `regulacion` por medio quedaron fuera, y se agrega otra solo si la jugabilidad lo pide.
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
- `contexto` (opcional): condición del mundo para que la acción sea candidata (por ejemplo, `{ "fenomeno": "plaga_zombie" }` o `{ "zona_integridad_menor_a": 100 }`). El motor la evalúa por zona o para todo el mundo. Sin `contexto`, la acción es candidata siempre.
- `zona_destino` (opcional): la zona a la que van los participantes mientras dura la acción (`protesta` y `organizar_fiesta`: `centro`). Cuenta para su exposición y para el contagio.
- **Tabla inicial:** la tabla de arranque (20 acciones espontáneas y 4 de condición) está en ACCIONES.md. Se afina con las corridas.

**Acciones de condición.** Hay dos tipos de acción: `espontanea` (por defecto: el director de caos elige entre las candidatas y cuenta contra los límites del caos) y `condicion` (consecuencia de una situación del mundo). Las de condición (huelga, protesta, saqueo) funcionan así:

- El **motor** decide si pasa y cuánto: cuando se cumple el `disparador`, abre una ventana con su intensidad (cuántos NPCs, cuáles según requisitos, `afinidad` y azar, y la duración).
- El **director de caos** decide cómo se expresa: elige entre las acciones de condición válidas para esa situación, por afinidad y azar o, si la IA opcional está activa, con el clasificador (sección 9). Nunca puede elegir que no pase nada.
- Sin IA, el motor elige por afinidad y azar. Con el clasificador activo, si no responde antes del plazo (sección 9), elige el motor. El origen queda registrado (`accion:huelga/clasificador` o `accion:huelga/motor`).
- Duración siempre finita. No cuentan contra `max_acciones_por_periodo` ni las frena el respiro (sección 9). Sus participantes sí cuentan para los topes de efecto (como `max_pct_rol_fuera_de_puesto`), pero el tope no los frena (sección 7.1). El porcentaje que resuelve el motor con el clasificador activo sirve para evaluar si el modelo responde a tiempo.
- Disparadores: `huelga` ← impago (puede volver a abrirse mientras dure); `protesta` ← `descontentos_pct` por encima de su umbral; `saqueo` ← `hambre_critica_pct` por encima de su umbral; (disparador de `disturbios`: pendiente de decisión del autor). Umbrales en CALIBRACION.

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
| `fuera_de_puesto` | No produce ni cobra por su trabajo (el público mantiene su salario, salvo en impago; un dueño sigue cobrando su ganancia) | Participante | `max_pct_rol_fuera_de_puesto` (sección 9); frena solo al caos espontáneo |
| `anima` | Sube o baja la satisfacción mientras dura | Participante o zona (según la acción) | Acotado por intensidad |
| `agita` | Sube el miedo y la rebeldía efectiva (modificadores) | NPCs de la zona efectiva | Duración de la acción |
| `acapara` | Sube el objetivo de despensa del participante mientras dura la acción: compra más de lo normal (no retira stock directamente) | Participante | Tope de despensa de la casa (sección 4) |
| `moviliza` | Los participantes pasan a la `zona_destino` de la acción | Participante | Solo cambia la zona efectiva (sección 14) |
| `decorativa` | Sin efecto en los datos: solo texto y animación | Ninguno | Ninguno |
| `gasta` | Sube su propensión al gasto de vida (modificador temporal; la propensión base no cambia). Más ventas para las comerciales (sección 4) | Participante | Acotado por intensidad y por su `dinero` |
| `ahorra` | Baja su propensión al gasto de vida (modificador temporal). Menos ventas para las comerciales | Participante | Acotado por intensidad |
| `comparte` | Cede parte de su despensa a NPCs de su zona efectiva con la despensa baja. La comida se conserva: sale de uno y entra a otros | Participante y receptores | `max_pct_despensa_cedida` por día |
| `difunde` | Crea un rumor temático en la zona efectiva (modificador con origen `rumor`, sección 8): `miedo` (sube el miedo), `descontento` (baja la satisfacción) o `esperanza` (sube la satisfacción y baja el miedo) | NPCs de la zona efectiva | Intensidad y duración; decae |
| `repara` | Cuenta como reparador de su zona efectiva mientras dura (sección 14), sin ser obrero ni ingeniero | Zona | Intensidad; solo si la zona tiene daño |
| `resguarda` | Suma a los policías de su zona efectiva con peso `peso_voluntario` (menor que 1), repartidos entre defensa y orden con la misma regla (sección 14) | Zona | `max_pct_voluntarios` de los policías equivalentes de la zona efectiva |
| `cuida` | Sube la cura natural de los NPCs de su zona efectiva con salud baja y que no estén internados | NPCs de la zona efectiva | Intensidad; no reemplaza al hospital |
| `toma` | Obtiene comida del `stock` de la empresa de alimento sin pagar (suma a su despensa); la empresa pierde esa venta (sección 4) | Participante | Solo acciones de condición; tope diario por intensidad |
| `vandaliza` | Resta `dano_vandalismo` por participante y día a la integridad de su zona efectiva (sección 14) | Zona | Solo acciones de condición (opcional, desactivada por defecto) |

- El motor aplica cada efecto como modificador con `origen` (sección 8). Siempre es acotado y con la duración de la acción.
- La intensidad (`baja`, `media`, `alta`) la define el catálogo, y los valores calibrados viven en CALIBRACION y en el preset.
- Los límites del caos se enganchan al **efecto**, no a la acción (sección 9). Si el tope de `fuera_de_puesto` está lleno, el caos espontáneo con ese efecto (foco o contagio) no suma a nadie más. Las acciones de condición no se frenan por el tope, pero sus participantes cuentan para él: la consecuencia ganada pasa por delante del caos decorativo y evita que una huelga y abandonos espontáneos vacíen un rol a la vez.
- Las acciones de condición (huelga, protesta, saqueo, disturbios) usan el mismo catálogo. `toma` y `vandaliza` solo las usan ellas: el caos espontáneo nunca roba ni destruye, solo lo hace una consecuencia ganada **[propuesta]**.
- Todos los efectos son reversibles o acotados: ninguno destruye algo de forma permanente, salvo el daño a la integridad (que se repara) y la comida tomada (que la empresa deja de vender).
- Ejemplo de contraste: cavar un pozo saca al NPC de su puesto y casi no se contagia. Predicar no lo saca del puesto, pero se propaga y agita a la zona.

```json
{ "id": "predicar", "efectos": [{ "id": "agita", "intensidad": "baja" }], "contagio": 0.3 }
```

### 7.2 Contagio [cerrado]

Es la misma mecánica para las acciones espontáneas y para los fenómenos con daño (sección 5): una fuente, una exposición, un freno y una tirada diaria por NPC.

| | Acción espontánea | Fenómeno con daño |
|---|---|---|
| Fuente | Una acción en curso en la zona efectiva | El fenómeno, desde su `origen` |
| Contagiosidad | `contagio` de la acción | `exposicion_max` × intensidad |
| Exposición | % de NPCs de la zona efectiva que ya la hacen | `atenuacion`^distancia |
| Freno | Orden y satisfacción de la zona efectiva (sección 14) | `defensa` de las zonas del camino (plaga zombie). La pandemia no tiene freno previo |
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
- Todo modificador guarda su `origen`, con la forma `tipo:id[/detalle]` (por ejemplo `accion:predicar/npc_12`, `accion:huelga/clasificador`, `accion:<id>/contagio`, `clima:plaga_zombie`, `noticia:n_41`, `estado:comercio`, `empresa:<id>/respuesta`). Sirve para afinar y para que la prensa cuente causas reales. El registro de causas alimenta los eventos que lee la UI (sección 14).
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

**Fuera de los límites:** las acciones de `condicion` (sección 7) y los efectos mecánicos del impago (sección 12) no se frenan por estos topes ni por el respiro, que regulan solo el caos espontáneo. Sus participantes sí cuentan para los topes de efecto, así que el caos espontáneo con ese efecto se frena antes (sección 7.1).

**Pruebas:** el plan de simulación y pruebas, con y sin IA, está en CALIBRACION.md.

## 10. Comunidad (derivada, no se guarda)

```json
{
  "poblacion": 100,
  "poblacion_pct": 100,
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
    "ingeniero": 3, "empresario": 1, "desempleado": 2, "jubilado": 10
  }
}
```

- `apoyo_pct`: % de electores con lealtad ≥ 50. `descontentos_pct`: satisfacción < 30. `hambre_critica_pct`: hambre > 80. `sin_dinero_pct`: % de electores que no pueden pagar su comida. `poblacion_pct`: NPCs vivos ÷ población inicial × 100 (la población inicial se fija al generar el mundo y se guarda, sección 13). **Denominadores [cerrado]:** `descontentos_pct`, `hambre_critica_pct` y el resto de los porcentajes se calculan sobre los NPCs vivos; `apoyo_pct` y `sin_dinero_pct`, sobre los **electores**: los NPCs vivos de 18 años o más, jubilados incluidos (los menores no votan y su comida la paga el estado). Si no hay electores, `apoyo_pct` vale 0. "Elector" no es lo mismo que "adulto" (18-64, sección 1). `hospital_ocupacion_pct`: (internados + NPCs en espera de cama) / camas, con mínimo 1 cama; más de 100 es hospital saturado. `defensa`: por zona, derivada de `seguridad`, de dónde están los policías y de la `integridad` de la zona (sección 14). `orden`: por zona, derivado de los policías dedicados al orden en la zona (sección 14). `amenaza`: por zona, la amenaza percibida (sección 14); se expone para la capa de lectura del mapa (UI §6). `productividad_total`: suma de la productividad (0-100) de cada NPC. Para el gobernador también se resume el estado de las empresas: ganancia y respuesta vigente (sección 4).

- **Historial [cerrado]:** excepción acotada a "lo derivado no se guarda". El motor agrega cada día un punto a una serie por indicador clave (`reserva`, `inflacion`, `satisfaccion_media`, `hambre_critica_pct`, `apoyo_pct`, `poblacion_pct`) y la UI solo la lee (UI §5). Es un registro de lectura: ninguna regla lo usa y no es estado de simulación, pero entra en el guardado para recuperarlo al cargar la partida. Rendimiento: se escribe un valor por indicador por día, sin recalcular nada. Pasado el tope `historial_max_dias` (CALIBRACION), los días más viejos se compactan por promedio semanal. El registro de hechos del historial son los eventos (sección 14), que también se guardan.

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
  "victoria": { "metrica": "poblacion_pct", "op": ">=", "umbral": 40, "plazo_dia": 180 },
  "derrota": { "metrica": "poblacion_pct", "op": "<", "umbral": 40 }
}
```

- La derrota se evalúa en cualquier momento y termina la partida (evento `fin_partida`). La victoria se evalúa una sola vez, al llegar el plazo: si se cumple, emite el evento `victoria`; si no, emite `objetivo_perdido {metrica, valor}`. En los dos casos la partida sigue: **solo la derrota termina la partida [cerrado]**. El resultado del plazo es definitivo y no se reevalúa. Perder el objetivo no es una derrota. Los umbrales son parámetros del mundo.
- **Objetivo y progreso visibles [cerrado].** El jugador ve siempre la métrica de victoria con su meta y los días restantes, y la métrica de derrota con su límite. Una flecha indica la tendencia respecto del período anterior, sin proyección. El indicador de derrota cambia de color cuando recorrió un tramo de la distancia entre su valor inicial y su límite (el tramo está en CALIBRACION). El panel aclara que la victoria se evalúa al llegar el plazo y, una vez resuelto, muestra el objetivo como cumplido o perdido (tres estados: pendiente, cumplido, perdido). Son datos derivados (sección 10) y del registro de eventos (`victoria` u `objetivo_perdido`): no hay estado nuevo.

## 12. Reglas (borrador)

**Economía** (la extensión `fiscal` agrega emisión e inflación dinámica)

- **Ingreso:** NPC privado empleado = sueldo = (min + `ingreso_pos` / 100 × (max − min)) × productividad, que paga su empresa (sección 4). Dueño (empresario o comerciante) = la ganancia de su empresa. Periodista = su rango (los medios son simplificados, sección 6). Público = `salario_publico`. Jubilado = `pension_base`.
- **Impuestos:** recaudación = Σ (ingreso del grupo × tasa del grupo). Pagan todos los grupos con ingreso, incluido el público (sobre su salario) y los dueños (sobre su ganancia); los `sin_ingreso` no pagan. Las empresas no pagan impuesto propio. La pérdida por falta de estatales está en Servicios. El NPC cobra su **ingreso neto** = ingreso − impuesto, y su gasto diario sale del neto.
- **Nómina:** empleados públicos × `salario_publico`.
- **Pensiones:** jubilados × `pension_base`. Gasto obligatorio.
- **Gasto diario del NPC:** primero la comida (recompra de despensa, sección 4), después un gasto de vida (% del ingreso neto propio de cada NPC, menor con codicia alta). Lo que sobra va a `dinero`. El gasto de vida va a las empresas comerciales (sección 4).
- **Subsidios:** transferencia de dinero a los NPCs del grupo. Los decide el gobernador y apuntan a un grupo de roles (inyección directa), salvo el público, que no se subsidia (GOBERNADOR §4). Subsidiar servicios queda para el nivel 2 (HOJA_DE_RUTA §4).
- **Disponible** = ingresos − nómina − pensiones − garantía alimentaria. Se reparte en presupuesto, subsidios y prensa. Lo no asignado va a `reserva`. Las compras de alimento (intercambio) no restan del disponible: se pagan de la `reserva`, para que importar comida no deje a los servicios sin presupuesto. Si la reserva no alcanza, la compra se reduce a lo que la reserva cubre.
- **Déficit:** disponible < 0 → se usa la `reserva`; después, solo con la extensión `fiscal`, se emite hasta el tope autorizado (sube `inflacion`); si aún falta, hay impago. Con impago, los empleados públicos pierden satisfacción y productividad por regla del motor, y se dispara la acción de condición `huelga` (sección 7), que no depende de la IA.
- **Impago: momento y fin [decidido].** El déficit solo existe en la liquidación (sección 3.1), así que el impago se evalúa en cada liquidación. Con faltante se emite `impago {faltante}` y queda activo hasta la primera liquidación sin faltante, cuando se emite `impago_fin`. La huelga puede volver a abrirse mientras dure.
- **Qué se deja de pagar primero [decidido].** El faltante lo absorbe primero la nómina, prorrateada entre los empleados públicos. Si aún falta, se prorratean las pensiones y la garantía alimentaria. Así el hambre queda para una crisis mayor.
- **Inflación:** sube con la emisión relativa a la economía y decae sin ella. Encarece el alimento, devalúa `reserva` y `dinero`. Los ingresos no se ajustan solos: la inflación les quita poder de compra y el gobernador ajusta a mano el salario público.
- **Circulación:** el dinero circula en un circuito cerrado (sección 3.1): los NPCs pagan a las empresas, las empresas pagan sueldos y ganancias, los NPCs pagan impuestos y el estado devuelve nómina, pensiones, subsidios y garantía. Sale del sistema lo que se importa (`fraccion_gasto_exterior` y las compras de intercambio), los fondos de prensa que el estado da a los medios y la ganancia de una empresa sin dueño. Entra por las ventas de intercambio, por los `ingresos_propios` de los medios (que pagan a los periodistas, simplificación del nivel 1 **[propuesta]**) y, con `fiscal`, por la emisión. Si el total deriva (deflación o acumulación), se corrige calibrando, no con una regla nueva.

**Alimento**

- **Consumo y hambre:** cada NPC consume `consumo_por_npc` por día de su despensa (sección 4). Si la despensa llega a 0 y no pudo comprar, el hambre sube.
- **Precio:** sección 4, incluido el tope de `precio_maximo`.
- **Garantía alimentaria:** el estado paga un % del faltante de comida de los NPCs sin dinero suficiente. El faltante es lo que le falta pagar al NPC para comprar la recompra de su despensa. Costo = faltante × %. La comida de los menores la paga siempre el estado (100%).
- **Intercambio:** el estado compra o vende alimento al exterior, hasta la capacidad de intercambio (comerciantes × `intercambio_por_comerciante`, CALIBRACION). La palanca `intercambio`, de -100 a 100, es el % de esa capacidad que se usa: 100 compra toda la capacidad y -100 vende toda. Precio externo = `precio_base` × (1 + inflación / 100) × factor de sequía (sube con sequía y plaga). La compra cuesta más que la venta (el diferencial está en CALIBRACION). La compra se paga de la reserva (ver Disponible); la venta es ingreso. **Venta al exterior [propuesta]:** el estado compra el excedente a la empresa de alimento al precio interno vigente (de la `reserva`) y lo vende al exterior, así la empresa cobra lo que entrega y no se expropia stock. Sirve para sostener el precio con superávit. **Comida importada [decidido]:** lo que el estado compra al exterior se suma al `stock` de la empresa de alimento y entra al mercado como cualquier otra comida. Se compra al precio externo, sin tope. El `precio_maximo` solo limita el precio al que se vende en el mercado interno, así que importar con el tope por debajo del precio externo no genera pérdida oculta: el costo de la compra sale de la `reserva` y el faltante lo ve el gobernador. La venta al exterior es ingreso del estado (como antes).

**Servicios**

- **Cobertura** = min(1, profesionales del rol / profesionales objetivo). El objetivo es un % de la población y es dato del escenario (valores en CALIBRACION; en zombies el de policías es mayor).
- **Inversión** = fondos asignados al área / costo base del área (proporcional a la población). Rendimientos decrecientes sobre 1.
- Indicador = indicador + (cobertura × inversión) − decaimiento.
- **Administración:** pérdida de recaudación y presupuesto = (1 − cobertura de estatales) × pérdida máxima.
- **Cobertura baja:** si la cobertura de `policia` o de `medico` cae por debajo de un umbral, suma un recargo gradual y proporcional a lo que le falta: miedo en el caso de la policía, malestar (satisfacción) en el de los médicos. Así, en un mundo sin amenazas, recortar esos cupos no es solo ahorro.
- Seguridad baja el miedo (total de la ciudad) y, repartida por zona como `defensa`, los ataques de la plaga zombie (secciones 5 y 14). Infraestructura sube la productividad y acelera la reparación de las zonas (sección 14). Salud: los médicos dan las camas del hospital y la inversión da la rapidez de cura (sección 12, Salud). Educación sube el progreso de los estudiantes.

**NPCs**

- **Producción:** productividad = laboriosidad × salud × satisfacción × clima × infraestructura × factor fiscal × modificadores. Las variables se normalizan a 0-1; clima, infraestructura y factor fiscal son multiplicadores cercanos a 1. El factor fiscal vale 1 hasta una tasa umbral y baja linealmente por encima (umbral y pendiente en CALIBRACION). Si tiene una `accion` con el efecto `fuera_de_puesto` o está internado, no produce.
- **Hambre:** sube cuando el NPC se queda sin comida en la despensa (`accesoComida` < 1) y baja al comer.
- **Educación:** el estudiante suma progreso diario (más con docentes e inversión). A 100 sube de nivel.
- **Qué resta salud [decidido]:** hay solo tres causas, y cada una tiene una palanca que la combate. (1) Los **golpes** de la plaga zombie y la pandemia (sección 5): se combaten con seguridad y policía (zombies), con infraestructura (pandemia) y con el hospital. (2) El **hambre crítica**: daño diario mientras el hambre pasa su umbral; se combate con las palancas de comida. (3) La **vulnerabilidad por edad**: los menores y los mayores de 65 reciben más daño por golpe (`k_vulnerabilidad`, CALIBRACION) y los jubilados arrancan con menos salud **[propuesta]**. No hay otras causas en el nivel 1: sin vejez, accidentes ni estrés (la satisfacción baja la productividad, no la salud). Cuando el hospital se satura, los que esperan en su casa solo tienen la cura natural, y por eso los golpes pesan más.
- **Salud (individual).** Cada día, en este orden: (1) golpes de los fenómenos (sección 5); (2) daño por hambre crítica (hambre por encima de su umbral); (3) internación; (4) cura; (5) si la salud llega a 0, el NPC muere. Los golpes y las muertes se registran uno por uno con su origen (`clima:plaga_zombie`, `clima:pandemia`); el daño por hambre y las curas, agregados por día (sección 8). Un golpe no mata a un NPC sano, pero sí puede matar a uno débil.
- **Hospital.** El NPC con salud < `umbral_hospital` pide cama. Camas = médicos activos × `pacientes_por_medico`. Se interna primero a los de menor salud; el resto espera en su casa. El internado no produce ni cobra por su trabajo (el público mantiene su salario) y se cura por día `cura_base` × (0,5 + 0,5 × indicador `salud` / 100). Recibe el alta con salud ≥ `alta`. Quien no está internado se cura `cura_natural` por día si su hambre está por debajo de su umbral. Los médicos dan las camas; la inversión en salud, la rapidez de cura. El internado está en el hospital (`centro`) y no recibe ataques en el nivel 1.
- **Muerte.** El NPC sale de la población, su puesto queda vacante y, si era columnista, sale de su medio.
- **Miedo:** con la plaga zombie tiende a `intensidad` × `atenuacion`^distancia × (1 − `defensa`/100) × (1 − 0,5 × valentía/100), con la distancia y la `defensa` de su zona efectiva y el valor más alto entre los fenómenos activos. Las noticias alarmistas lo suben (modificador).
- **Satisfacción:** baja con hambre, miedo, mala salud, desempleo, poco poder adquisitivo (dinero), impuestos (más con codicia) e inflación. Sube con subsidios. Tiene inercia (resiliencia).
- **Lealtad:** sigue a la satisfacción con retraso. La rebeldía amplifica las caídas.
- **Edad:** cada NPC suma un año cada 365 días, en su propio día (se fija al generar el mundo). A los 18 pasa a adulto y deja de estudiar, a los 65 se jubila.

## 13. Alcance del nivel 1 y a futuro

- **Economía:** el módulo `base` es el del nivel 1 y la extensión `fiscal` llega en el nivel 1.1 (HOJA_DE_RUTA §3) (ver 3.1). Son lógica del núcleo. Los dos comparten la misma salida (sección 3.1): sumar la extensión no cambia lo ya construido.
- **Calibración:** los valores que se ajustan probando, los criterios de arranque de un mundo y el plan de pruebas están en CALIBRACION.md. Los valores calibrados de cada escenario viven en su preset (`presets/*.json`) y el historial de rondas, en el informe de calibración.
- **Guardado [cerrado]:** un archivo por partida, en un formato independiente del lenguaje (JSON versionado y comprimido), para que cualquier implementación del motor lo lea igual (UI §11). Contiene: `version_formato`, la semilla, la población inicial (base de `poblacion_pct`), la configuración efectiva del mundo (con los valores del preset ya aplicados, para que un cambio futuro del preset no altere una partida guardada, y con las marcas de "configuración de prueba"), el estado completo del último día cerrado, es decir, todo lo que es estado y no se recalcula: NPCs (incluidos `internado`, `propension_gasto` y `cumple_dia`), gobierno (con el estado de impago, los acumuladores del período fiscal y los cambios de palanca pendientes), clima, medios, integridad y empresas (con su respuesta vigente, los días que le quedan y los acumuladores del período de pago), con el estado del generador de azar, las elecciones guardadas del clasificador y los textos generativos (sección 9), el registro de eventos y el historial (sección 10). El resultado del objetivo (`victoria` u `objetivo_perdido`) sale del registro de eventos y no se guarda aparte. Se retoma desde esa foto y no reproduciendo la partida desde el día 1, así que cargar cuesta lo mismo en el día 10 que en el 300. La foto se toma en memoria al cierre de un día y se escribe en segundo plano: no pausa ni frena la simulación. Escritura segura: se escribe a un archivo temporal y se renombra al terminar, así un corte no deja un guardado roto. Cada partida tiene un guardado manual y un autoguardado periódico (UI §13; período en CALIBRACION). Un guardado de otra versión de formato se migra si hay migración y, si no, se rechaza con un aviso claro.
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
- **Qué zona usa cada regla [decidido]:** todo lo que pasa en un lugar usa la zona efectiva: el contagio, el % de NPCs con acción espontánea y de descontentos para el orden, la población para el orden, y los efectos `repara`, `cuida`, `resguarda` y `vandaliza`. Así una protesta en el `centro` baja el orden del `centro`, y los disturbios dañan donde están los manifestantes. La `zona` se usa solo para la asignación inicial y la reubicación de los policías.
- **Mapa contiguo:** el grafo de vecindad tiene que poder dibujarse como un mapa sin cruces (grafo planar), para que dos zonas vecinas sean contiguas en la vista (UI §9). Es requisito de la configuración de cada mundo; el ejemplo de arriba lo cumple.

**Defensa por zona** (derivada, no se guarda). `defensa[zona]` = min(100, `seguridad` × (1 − c + c × n × parte)) × (1 − `k_integridad` × (1 − `integridad`/100)), con `parte` = policías en defensa de la zona / policías totales, n = cantidad de zonas, c = `movilidad_defensa` (una constante) y `k_integridad` (otra constante distinta). Sin policías, `parte` = 1/n. Con los policías todos en defensa, repartidos parejos, y la integridad en 100, `defensa` = `seguridad`. `seguridad` sigue siendo el indicador total (sección 3); la defensa de cada zona sale de dónde están los policías y de la integridad de la zona (abajo).

**Integridad por zona** (estado, se guarda; 0-100, arranca en 100). Mide cuánto aguanta la zona frente a los ataques.

- **Daño:** cada golpe de un fenómeno con protección (`plaga_zombie`) resta `dano_integridad` a la integridad de la zona donde cae. La pandemia no la daña.
- **Efecto:** una integridad baja reduce la `defensa` de la zona (fórmula de arriba), así que los ataques pasan más fácil y el daño se acumula.
- **Reparación:** cada día suma a la integridad de la zona `rep_por_npc` × reparadores de esa zona × (0,5 + 0,5 × indicador `infraestructura` / 100), con tope 100. Reparadores: obreros e ingenieros cuya zona efectiva es esa y que no estén internados ni con una `accion` con el efecto `fuera_de_puesto`. Reparar no reemplaza su producción.
- No agrega palancas: el gobernador la influye con el presupuesto de infraestructura y con los cupos de ingenieros.
- Se desarrolla en el nivel 2 como construcción real (HOJA_DE_RUTA §4): solo cambia de dónde sale este número.

**Reubicación.** Cada día, un % de los policías (valor en CALIBRACION) cambia de `zona` hacia una zona sorteada con peso proporcional a su necesidad total. No va siempre la de mayor necesidad: con el máximo, toda la policía iría a un solo lugar. La necesidad total de una zona es su necesidad de defensa más su necesidad de orden (ver Reparto policial, abajo), sumadas tal cual **[propuesta: sin peso por escenario hasta que las corridas lo pidan]**. Si la necesidad total es 0 en todas, no se mueven. En elecciones se mueven solo por orden; en zombies, por la mezcla de las dos.

**Amenaza percibida por zona** (derivada): el mayor entre estos dos valores.

- Aviso: en la zona de `origen` de un fenómeno anunciado o activo, el mejor valor de alcance × credibilidad / 100 entre las noticias de aviso vigentes (sección 6). Sin noticia, vale 0.
- Golpes recientes: crece con la cantidad de golpes en esa zona dentro de una ventana de días reciente, con tope 100 (peso y ventana en CALIBRACION).

La ciudadanía percibe, no sabe: un aviso tardío o poco creíble deja la defensa mal ubicada. El gobernador ve el aviso y su origen exactos (GOBERNADOR §7). En el nivel 1 no puede hablarle directo a la gente: su palanca es la prensa (el gasto de prensa).

**Reparto policial: defensa y orden** (derivado, no se guarda). Los policías de cada zona se dedican a dos usos: **defensa** contra los fenómenos con protección (solo `plaga_zombie`; la pandemia, la sequía y la plaga de cultivos no se frenan con policía) y **orden** contra el caos espontáneo. Cada día, cada zona calcula dos necesidades (0-100):

- Necesidad de defensa: su amenaza percibida (arriba).
- Necesidad de orden: min(100, % de NPCs de la zona efectiva con una acción espontánea en curso + % de descontentos de la zona efectiva).

Los policías de la zona se reparten entre los dos usos en proporción a esas necesidades. Cada uso con necesidad mayor que 0 recibe al menos `min_reparto`. Si una necesidad es 0, la otra recibe todo; si las dos son 0, todos quedan en orden. En elecciones no hay amenaza, así que toda la policía queda en orden. En zombies la amenaza atrae policías a la defensa y deja menos para el orden. La reubicación entre zonas responde a la necesidad total de cada zona, defensa más orden (Reubicación, arriba).

**Orden por zona** (derivado, no se guarda). `orden[zona]` = min(100, 100 × (policías en orden de la zona / población de la zona) / `objetivo_orden`), con `objetivo_orden` (por ejemplo, un policía cada tantos habitantes); la población de la zona cuenta por zona efectiva. Es el freno del contagio de las acciones espontáneas de esa zona (sección 7.2): contagio efectivo = `contagio` × (1 − `k_orden` × `orden`/100) × (1 − `k_satisfaccion` × satisfacción media de la zona/100), con `k_orden` y `k_satisfaccion` (valores en CALIBRACION). Solo afecta a las acciones espontáneas: las de condición (sección 7) no se modifican. El gobernador no fija este reparto: lo influye con los cupos y el presupuesto de seguridad. Una palanca para inclinarlo queda pendiente (GOBERNADOR §8).

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
impago_fin  {}   // primera liquidación sin faltante
hospital_saturado {ocupacion_pct}
noticia     {noticia, medio, tema}
empresa_respuesta {empresa, respuesta}   // una empresa que no puede pagar responde; lleva origen y causa
palanca     {palanca, valor_anterior, valor_nuevo}   // cuando el cambio entra en vigencia; hecho raíz
victoria    {metrica, valor}   // hito: la partida sigue
objetivo_perdido {metrica, valor}   // hito: la partida sigue (perder el objetivo no es derrota)
fin_partida {metrica, valor}   // solo derrota; su causa es el evento que cruzó el límite
```

Reglas de la UI sobre los eventos: UI §9 y §11.

**Fuera del nivel 1:** lo que se promueve desde las zonas cuando una regla dependa de ello (HOJA_DE_RUTA §4 a §6).

## 15. Preguntas abiertas

Las preguntas que se resuelven midiendo (calibración de salud, zonas, contagio, clasificador, plazos de la IA, textos y memoria) están en CALIBRACION.md. Acá quedan las de diseño.

No quedan preguntas abiertas de diseño en el nivel 1. Confirmados: los 14 roles y los 4 niveles de educación (se suman roles cuando el juego esté más pulido), el modelo de salud (sección 12), el modelo de zonas y defensa (sección 14) y el catálogo base de 15 efectos con las 24 acciones iniciales (ACCIONES.md). Se afinan con la simulación.