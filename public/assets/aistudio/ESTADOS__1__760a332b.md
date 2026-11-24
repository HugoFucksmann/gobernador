# Estados internos (borrador v0.8)

> Lo marcado **[cerrado]** está decidido; el resto es lo acordado hasta ahora, salvo lo listado en la sección 14. Valores de ejemplo (placeholders). Escala 0-100 salvo donde se indique. Ejemplos escalados a unos 100 NPCs. Las palancas del gobernador están en GOBERNADOR.md; acá solo sus efectos sobre los estados. La economía es modular (sección 3.1).

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
  "mapa": { "x": 12, "y": 8, "destino": { "x": 14, "y": 9 }, "accion": "trabajando" },
  "accion_ia": null,
  "modificadores": [
    {
      "id": "mod_3",
      "afecta": { "laboriosidad": -30 },
      "duracion_dias": 5,
      "origen": "accion:predicar/npc_12",
      "texto": "Anda desanimada desde la discusión del pozo"
    }
  ]
}
```

- `edad`: define la **etapa** (se deriva): menor (<18) solo estudia, adulto (18-64) trabaja o estudia, jubilado (65+) no trabaja.
- `educacion.nivel`: 0 sin estudios, 1 básico, 2 medio, 3 superior. Define a qué roles accede.
- `personalidad` es el valor **base y fijo** de cada rasgo. Las reglas usan el valor **efectivo** = base + modificadores activos (temporales, con decaimiento), acotado a 0-100. `variables` cambian. Salud 0 = muere.
- `economia` **[cerrado: cada NPC gana y gasta su dinero]**: `ingreso_pos` (0-100) es su posición fija dentro del rango de ingreso de su rol (da variedad). `dinero` es lo que tiene ahorrado. Los campos existen siempre; el módulo `simple` no los usa.
- `accion_ia`: acción de la tabla (sección 7) en curso. Si reemplaza el trabajo, no produce ni cobra ingreso por su trabajo. Los empleados públicos mantienen su salario (propuesta), salvo en impago.
- `modificadores`: canal único de efectos (sección 8), con `origen`.

## 2. Catálogo de roles y grupos (configuración, no es estado)

```json
[
  { "id": "estudiante",  "edad_min": 0,  "edad_max": 24,   "educ_min": 0, "estudia": true, "produce": {} },
  { "id": "agricultor",  "edad_min": 18, "edad_max": 64,   "educ_min": 0, "afinidad": "laboriosidad", "produce": { "alimento": 3 }, "ingreso": [8, 14] },
  { "id": "obrero",      "edad_min": 18, "edad_max": 64,   "educ_min": 0, "afinidad": "laboriosidad", "produce": {}, "ingreso": [12, 20] },
  { "id": "policia",     "edad_min": 18, "edad_max": 64,   "educ_min": 1, "afinidad": "valentia",     "publico": true, "produce": { "seguridad": 1 } },
  { "id": "estatal",     "edad_min": 18, "edad_max": 64,   "educ_min": 1, "afinidad": "laboriosidad", "publico": true, "produce": { "administracion": 1 } },
  { "id": "comerciante", "edad_min": 18, "edad_max": 64,   "educ_min": 1, "afinidad": "codicia",      "produce": { "comercio": 1 }, "ingreso": [14, 30] },
  { "id": "tecnico",     "edad_min": 18, "edad_max": 64,   "educ_min": 2, "afinidad": "laboriosidad", "produce": {}, "ingreso": [20, 32] },
  { "id": "docente",     "edad_min": 18, "edad_max": 64,   "educ_min": 2, "afinidad": "laboriosidad", "publico": true, "produce": { "educacion": 1 } },
  { "id": "periodista",  "edad_min": 18, "edad_max": 64,   "educ_min": 2, "afinidad": "rebeldia",     "produce": { "informacion": 1 }, "ingreso": [10, 20] },
  { "id": "medico",      "edad_min": 18, "edad_max": 64,   "educ_min": 3, "afinidad": "laboriosidad", "publico": true, "produce": { "salud": 1 } },
  { "id": "ingeniero",   "edad_min": 18, "edad_max": 64,   "educ_min": 3, "afinidad": "laboriosidad", "publico": true, "produce": { "infraestructura": 1 } },
  { "id": "desempleado", "edad_min": 18, "edad_max": 64,   "educ_min": 0, "produce": {} },
  { "id": "jubilado",    "edad_min": 65, "edad_max": null, "educ_min": 0, "produce": {} }
]
```

- `ingreso: [min, max]`: lo que gana por día un NPC privado en ese rol. Real = (min + `ingreso_pos` × (max − min)) × productividad. Valores placeholder. En `simple` solo sirve para calcular la recaudación.
- `publico: true`: cobra el `salario_publico`, igual para todos: `salario_base_publico` × palanca / 100, con `salario_base_publico` = 12 (placeholder). No tiene ingreso propio y forma parte de la nómina.
- Obrero y técnico no producen un recurso físico: su aporte es el ingreso gravable.
- **Comerciante (propuesta a confirmar):** gana su ingreso base (el rango de `ingreso`) más una comisión sobre lo que se vende en el período. Ventas = gasto de la población en comida + volumen de intercambio con el exterior, repartidas entre los comerciantes. Es un valor derivado: no se traza quién le paga a quién (ver Circulación en la sección 12). Tiene empleados: cada comerciante sostiene hasta `empleados_por_comerciante` obreros (placeholder 4). El tope efectivo de obreros = min(`tope_privado[obrero]`, comerciantes × `empleados_por_comerciante`). Si baja el número de comerciantes, los obreros que quedan sin puesto pasan a desempleados.
- **Sin ingreso propio (desde `individual`):** los jubilados reciben una pensión fija (`pension_base`, placeholder 8), gasto obligatorio del estado. La comida de los menores la paga el estado. Los desempleados dependen de la garantía alimentaria y de los subsidios.
- `policia`: rol simple de seguridad en la v1. En zombies el gobernador sube el cupo y los NPCs lo cubren por afinidad (valentía), como cualquier rol.
- `periodista`: columnista de un medio, produce `informacion`. Es un rol privado: cobra su ingreso del rango, paga impuestos (grupo `comercio`) y no depende de su medio en la v1.
- `alimento` es un stock del mercado (sección 4). `seguridad`, `salud`, `educacion` e `infraestructura` son indicadores del gobierno (sección 3). Los servicios actúan según su **cobertura** (profesionales respecto de la población).
- `administracion`: sin estatales se pierde parte de la recaudación y del presupuesto. `comercio`: capacidad de intercambio de alimento con el exterior.

**Cambios de rol**

- Menor: rol forzado `estudiante`. Al cumplir 18 elige.
- Adulto: cada cierto tiempo puede cambiar a un rol para el que cumpla edad y educación, si hay vacante. Elige por afinidad.
- Al superar `edad_max` pasa a `desempleado`; a los 65, `jubilado`.
- El gobernador fija **cupos** solo de los roles públicos. Los roles privados no tienen cupo del gobernador: se cubren por afinidad y vacantes, con un tope por escenario (`tope_privado[rol]`, parámetro del mundo, no palanca; ejemplo: agricultor 30, obrero 14, técnico 3, comerciante 4, periodista 3). Vacantes = tope − ocupados. Un puesto solo se cubre con NPCs que cumplan los requisitos.
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
  "reserva": 600,
  "inflacion": 15,
  "finanzas": { "ingresos": 0, "nomina": 0, "pensiones": 0, "garantia_alimentaria": 0, "deficit": 0, "emision": 0 },
  "indicadores": { "seguridad": 40, "salud": 50, "educacion": 50, "infraestructura": 50 },
  "palancas": {}
}
```

- `reserva`: stock de fondos. Lo no asignado del presupuesto va acá.
- `inflacion` **[cerrado]**: variable del gobierno, no del escenario. Sube con la emisión y decae sin ella. Solo cambia desde el módulo `fiscal`.
- `finanzas`: resultado del último período (se recalcula, no se decide). `deficit` y `emision` se usan desde `fiscal`.
- `indicadores`: se acumulan con inversión y personal, y decaen con el tiempo.
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

- **Período fiscal:** ingresos y gastos se acumulan a diario y se liquidan cada `periodo_fiscal_dias` (placeholder 7). Presupuesto y subsidios se reparten en cada liquidación. Es independiente del período del caos (sección 9).
- **Combinación:** `individual` reemplaza a `simple`. `fiscal` solo se activa sobre `individual`.
- **Preset inicial:** elecciones y zombies arrancan en `simple`. En elecciones, sin emisión: el límite del gasto es la reserva y el impago. La emisión y la inflación dinámica llegan con `fiscal` (etapa 3).
- **Fórmulas de `simple`:** un coeficiente por efecto, a calibrar. `poderAdquisitivo` = 50 + `coef_subsidio` × subsidio por habitante del grupo (con rendimientos decrecientes) − `coef_impuesto` × tasa del grupo (más con codicia), acotado a 0-100. Entra en la satisfacción igual que en los otros módulos.

| Elemento | `simple` (etapa 1) | `individual` (etapa 2) | `fiscal` (etapa 3) |
|---|---|---|---|
| Alimento | Almacén común del estado y ración global. Precio fijo | Mercado con precio, garantía alimentaria e importación | Precio afectado por la inflación |
| Recaudación | Un impuesto único sobre el ingreso de todos los roles con ingreso | Impuestos por grupo | Igual |
| NPC | Sin `dinero` en uso | `dinero`, gasto de vida, ingreso propio | Igual |
| Subsidios | Suben la satisfacción del grupo directamente | Transfieren dinero al grupo | Igual |
| Nómina | Sí | Sí | Sí |
| Pensiones | No (los jubilados comen de la ración) | Sí | Igual |
| Déficit | Se usa la reserva y, si no alcanza, hay impago | Igual | Igual, y antes del impago se puede emitir |
| Inflación | Fija (valor del preset) | Fija | Dinámica: sube con la emisión |

## 4. Alimento: stock y mercado

Módulo `individual`: el alimento es un stock de mercado (estado de la economía, sin empresas como entidad) y el estado lo regula. Lo que pagan los NPCs sale del sistema; los comerciantes ganan según las ventas (sección 2, valor derivado). En `simple`, el mismo stock es el almacén común del estado, con ración global y precio fijo.

```json
{
  "alimento": { "stock": 1700, "consumo_por_npc": 1, "dias_stock": 17, "precio": 1.0 },
  "precio_base": 1.0
}
```

- Producción de los agricultores → `stock`. Consumo diario = población × `consumo_por_npc`. `dias_stock` y `precio` se derivan.
- `precio` = `precio_base` × escasez (según `dias_stock`) × clima × (1 + inflación). Sube cuando el stock baja.
- Cada NPC paga su comida con su `dinero`. El faltante lo cubre en parte el estado (garantía alimentaria).
- Si el stock no alcanza para todos, el reparto es parejo y sube el hambre general. El dinero no crea comida: el estado puede importar (intercambio).

## 5. Estado del Clima

```json
{
  "reloj": { "tick": 18340, "dia": 153, "anio": 1 },
  "fenomenos": [
    { "tipo": "sequia", "intensidad": 60, "inicio_dia": 140, "duracion_dias": 30 }
  ]
}
```

| Tipo | Efecto |
|---|---|
| `sequia` | Baja la producción de alimento y sube su precio |
| `plaga` | Baja la producción de alimento y sube su precio |
| `pandemia` | Baja salud y productividad de los NPCs |
| `plaga_zombie` | Sube el miedo, daña la salud; las bajas dependen de `seguridad`. Su intensidad crece con el tiempo |

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
- v1: `ingresos_propios` es una constante por medio (placeholder). No hay balance ni quiebra del medio. Que dependa de alcance y credibilidad queda para v2. `columnistas` limitan cuánto puede publicar (`informacion`).
- `intervencion`: palancas vigentes del gobernador sobre este medio (v1: `financiamiento` y `regulacion`; `presion` y `acceso` quedan para la v1.1). `fondos_estado` = presupuesto de prensa del período × `financiamiento` / 100. Más `fondos_estado` sube `alcance_pct` (con rendimientos decrecientes) y la dependencia. `regulacion` baja `sensacionalismo` y `credibilidad`, y sube la rebeldía efectiva (modificador) de quienes consumen el medio.
- **Consumo:** cada NPC elige qué medios consume según personalidad y lealtad, con tope en el alcance. Da burbujas sin relaciones entre NPCs.
- **Noticia** (dato, no solo texto):

```json
{
  "id": "n_41", "medio": "medio_1", "autor": "npc_31",
  "tema": "hambre", "tono": "alarmista", "alcance": 70,
  "titulo": "...", "texto": "...", "origen": "estado:hambre_critica"
}
```

- El motor fija `tema`, `tono` y `alcance`; la IA escribe `titulo` y `texto`. **El texto nunca maneja la simulación.** El efecto lo calcula el motor y se aplica como modificadores con origen `noticia:n_41`.
- Anti-bucle: efectos que decaen, dependen de alcance y credibilidad, y una noticia repetida pesa menos.

## 7. Tabla de acciones (configuración, no es estado)

**[cerrado]** Cosas que los NPCs pueden hacer, como dato.

```json
{
  "id": "cavar_pozo",
  "texto_base": "{nombre} se obsesiona con cavar un pozo",
  "requisitos": { "etapa": "adulto", "rol_no_en": ["policia"] },
  "afinidad": { "rebeldia": "+", "laboriosidad": "-" },
  "efecto": { "reemplaza_trabajo": true, "variables": { "satisfaccion": 5 } },
  "duracion_dias": [3, 8],
  "contagio": 0.1
}
```

- `requisitos` filtra quién puede; `afinidad` pesa la probabilidad; `efecto` es acotado y lo aplica el motor; `duracion_dias` es siempre finito; `contagio` pasa la acción a NPCs cercanos; `texto_base` es la plantilla de respaldo.
- Ideas iniciales: cavar un pozo, predicar, acaparar comida, organizar una fiesta, abandonar el trabajo. Con la economía: protestar, hacer huelga (empleados públicos sin paga), saquear.

**Acciones de condición.** Hay dos tipos de acción: `espontanea` (por defecto: la IA elige entre las candidatas y cuenta contra los límites del caos) y `condicion` (consecuencia de una situación del mundo). Las de condición (huelga, protesta, saqueo) funcionan así:

- El **motor** decide si pasa y cuánto: cuando se cumple el `disparador`, abre una ventana con su intensidad (cuántos NPCs, cuáles según requisitos, `afinidad` y azar, y la duración).
- La **IA** decide cómo se expresa: elige entre las acciones de condición válidas para esa situación y escribe el texto. Nunca puede elegir que no pase nada.
- Si la IA no responde antes del plazo (placeholder: 1 día de juego), el motor elige por afinidad y azar y usa `texto_base`. El origen queda registrado (`accion:huelga/ia` o `accion:huelga/respaldo`).
- Duración siempre finita. No cuentan contra los límites del caos (sección 9). El porcentaje resuelto por respaldo sirve para evaluar qué modelo chico alcanza.
- Disparadores (placeholders): `huelga` ← impago; `protesta` ← `descontentos_pct` > 30; `saqueo` ← `hambre_critica_pct` > 20.

```json
{
  "id": "huelga",
  "tipo": "condicion",
  "texto_base": "{nombre} se suma a la huelga",
  "disparador": { "impago": true },
  "requisitos": { "publico": true },
  "afinidad": { "rebeldia": "+", "resiliencia": "-" },
  "efecto": { "reemplaza_trabajo": true },
  "duracion_dias": [3, 10],
  "contagio": 0.2
}
```

## 8. Canal único de efectos y registro de causas (cerrado)

- Todo efecto (acción, rumor, clima, noticia, palanca) es un `modificador`: *a este conjunto de NPCs, tal variable cambia tanto, por tanto tiempo*.
- Todo modificador guarda su `origen`. Sirve para afinar y para que la prensa cuente causas reales.
- Los modificadores pueden afectar variables y rasgos efectivos, nunca el rasgo base. Al vencer, el rasgo vuelve a su base.
- Un rumor no tiene estado propio: es un modificador con origen `rumor`, que crea el motor cuando una acción o una noticia lo habilita.
- Los efectos decaen. Si el caos se detiene, la comunidad se recupera sola.

## 9. Director de IA

**Cómo funciona [cerrado]**

- Un modelo local chico trabaja de forma continua y asíncrona: deja resultados en una cola y la simulación los consume cuando están listos. Nunca bloquea el juego.
- Interfaz simple (`pedirTexto()`, `elegirAccion()`) para cambiar entre local, API o plantillas.
- Modelo local mínimo requerido. Se balancea para el más chico que funcione (referencia: Qwen 4B piso, 9B normal). Uno mejor mejora texto y elección, no las reglas.
- Plantillas como último recurso (`texto_base`, titulares genéricos).

**Tareas [cerrado]**

1. Columnas de prensa, escritas por los columnistas. El motor fija tema, tono y alcance.
2. Pensamiento del NPC en foco, generado al seleccionarlo y guardado en caché.
3. Elección de acción: el motor ofrece de 8 a 12 candidatas (por requisitos y afinidad) a unos pocos NPCs y la IA elige un id y escribe el texto. La IA solo reacciona a lo que el motor ofrece.
4. Elección de acción de condición (sección 7): el motor abre la ventana y la IA elige entre las válidas y escribe el texto. Si falla, el motor cubre.

**A quién se le ofrece:** el motor, con azar e "interés" (rasgos extremos, muy descontentos, con modificadores recientes). La IA nunca lee a toda la población.

**Límites del caos [cerrado]:** parámetros del mundo configurables. Cambiarlos se marca como "configuración de prueba".

```json
{
  "caos": {
    "max_acciones_por_periodo": 3,
    "periodo_dias": 5,
    "max_pct_rol_fuera_de_puesto": 20,
    "duracion_max_dias": 10,
    "respiro_si_satisfaccion_media_menor_a": 35
  }
}
```

**Fuera de los límites:** las acciones de `condicion` (sección 7) y los efectos mecánicos del impago (sección 12) no pasan por estos topes ni por el respiro, que regulan solo el caos espontáneo.

**Prueba sin IA:** director falso al azar, alta velocidad, muchas partidas, resumen de derrotas y acciones dañinas.

## 10. Comunidad (derivada, no se guarda)

```json
{
  "poblacion": 100,
  "satisfaccion_media": 58,
  "apoyo_pct": 54,
  "descontentos_pct": 17,
  "hambre_critica_pct": 4,
  "sin_dinero_pct": 12,
  "productividad_total": 6800,
  "roles": {
    "estudiante": 12, "agricultor": 30, "obrero": 14, "tecnico": 3, "policia": 5,
    "estatal": 4, "comerciante": 4, "docente": 4, "periodista": 3, "medico": 5,
    "ingeniero": 3, "desempleado": 3, "jubilado": 10
  }
}
```

- `apoyo_pct`: lealtad ≥ 50. `descontentos_pct`: satisfacción < 30. `hambre_critica_pct`: hambre > 80. `sin_dinero_pct`: NPCs que no pueden pagar su comida.

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

- La derrota se evalúa en cualquier momento. La victoria, al llegar el plazo. Los umbrales son parámetros del mundo.

## 12. Reglas (borrador)

**Economía** (lo individual aplica desde `individual`; déficit, emisión e inflación desde `fiscal`)

- **Ingreso:** NPC privado = (min + `ingreso_pos` × (max − min)) × productividad. Comerciante: más una comisión sobre las ventas (sección 2). Público = `salario_publico`. Jubilado = `pension_base`.
- **Impuestos:** recaudación = Σ (ingreso del grupo × tasa del grupo). La pérdida por falta de estatales está en Servicios. Pagan todos los grupos con ingreso, incluido el público (sobre su salario); los `sin_ingreso` no pagan. El NPC cobra su **ingreso neto** = ingreso − impuesto, y su gasto diario sale del neto.
- **Nómina:** empleados públicos × `salario_publico`.
- **Pensiones:** jubilados × `pension_base`. Gasto obligatorio (desde `individual`).
- **Gasto diario del NPC:** primero comida (precio × consumo), después un gasto de vida (% del ingreso neto, menor con codicia alta). Lo que sobra va a `dinero`. El gasto de vida sale del sistema (no se modela a quién va).
- **Subsidios:** transferencia de dinero a los NPCs del grupo. Los decide el gobernador y apuntan a un grupo de roles (inyección directa). Subsidiar servicios queda para v2.
- **Disponible** = ingresos − nómina − pensiones − garantía alimentaria − compras de alimento. Se reparte en presupuesto, subsidios y prensa. Lo no asignado va a `reserva`.
- **Déficit:** disponible < 0 → se usa la `reserva`; después, solo con `fiscal`, se emite hasta el tope autorizado (sube `inflacion`); si aún falta, hay impago. Con impago, los empleados públicos pierden satisfacción y productividad por regla del motor, y se dispara la acción de condición `huelga` (sección 7), que no depende de la IA.
- **Inflación:** sube con la emisión relativa a la economía y decae sin ella. Encarece el alimento, devalúa `reserva` y `dinero`. Los ingresos no se ajustan solos: la inflación les quita poder de compra y el gobernador ajusta a mano el salario público.
- **Circulación:** el dinero que gastan los NPCs sale del sistema y lo que cobran entra desde afuera. No se modela quién le paga a quién (simplificación de la v1).

**Alimento**

- **`simple`:** consumo = población × `consumo_por_npc` × ración / 100, desde el almacén común. Precio fijo. Si no alcanza, reparto parejo.
- **`individual`:** precio y reparto según la sección 4.
- **Garantía alimentaria:** el estado paga un % del faltante de comida de los NPCs sin dinero suficiente. Costo = faltante × precio × %. La comida de los menores la paga siempre el estado (100%).
- **Intercambio:** el estado compra o vende alimento al exterior, hasta la capacidad de los comerciantes. Precio externo (placeholder) = `precio_base` × (1 + inflación) × factor de sequía (sube con sequía y plaga). La compra cuesta 30% más que la venta. La compra es gasto obligatorio; la venta es ingreso.

**Servicios**

- **Cobertura** = min(1, profesionales del rol / profesionales objetivo). El objetivo es un % de la población (placeholder: médicos 5%, policías 5%, docentes 4%, estatales 4%, ingenieros 3%).
- **Inversión** = fondos asignados al área / costo base del área (proporcional a la población). Rendimientos decrecientes sobre 1.
- Indicador = indicador + (cobertura × inversión) − decaimiento.
- **Administración:** pérdida de recaudación y presupuesto = (1 − cobertura de estatales) × pérdida máxima (placeholder 30%).
- Seguridad baja el miedo y, en zombies, las bajas. Infraestructura sube la productividad. Salud y educación actúan sobre los NPCs.

**NPCs**

- **Producción:** productividad = laboriosidad × salud × satisfacción × clima × infraestructura × factor fiscal × modificadores. Las variables se normalizan a 0-1; clima, infraestructura y factor fiscal son multiplicadores cercanos a 1. El factor fiscal vale 1 hasta una tasa de 40% y baja linealmente por encima (placeholder: 1 − 0,01 × (tasa − 40)). Si tiene una `accion_ia` que reemplaza el trabajo, no produce.
- **Hambre:** sube cuando `accesoComida` < 1 (en `simple`, cuando el almacén no alcanza para la ración) y baja al comer.
- **Educación:** el estudiante suma progreso diario (más con docentes e inversión). A 100 sube de nivel.
- **Salud:** baja con hambre alta, pandemia y plaga zombie; sube con médicos e inversión. En 0 muere.
- **Miedo:** sube con la plaga zombie y noticias alarmistas, baja con seguridad. La valentía lo reduce.
- **Satisfacción:** baja con hambre, miedo, mala salud, desempleo, poco poder adquisitivo (dinero en `individual`), impuestos (más con codicia) e inflación. Sube con subsidios. Tiene inercia (resiliencia).
- **Lealtad:** sigue a la satisfacción con retraso. La rebeldía amplifica las caídas.
- **Edad:** suma un año cada 365 días. A los 18 pasa a adulto, a los 65 se jubila.

## 13. Alcance de la v1 y a futuro

- **Etapas de economía:** 1 `simple`, 2 `individual`, 3 `fiscal` (ver 3.1).
- **Calibración pendiente:** los valores de ejemplo no están calibrados (con los actuales, la nómina supera la recaudación y la producción de alimento no cubre el consumo). Criterio: el mundo arranca en equilibrio (producción ≥ consumo, ingresos ≥ obligatorios) y se desajusta por clima e IA (IDEA §5). Regla de partida: el ingreso crece con la educación y el salario público base queda cerca del medio de los roles privados de nivel parecido.
- **Edad en la v1:** los NPCs envejecen sin morir por vejez ni nacer. La población baja solo por salud 0.
- **A futuro:** muerte por vejez y nacimientos (juntos), reserva estratégica de alimento, precio máximo, flujos de dinero entre NPCs. Subsidios a servicios e ingresos propios de los medios según alcance y credibilidad.
- **Fuera de la v1:** relaciones entre NPCs, inventarios de objetos por NPC, estado propio del director de IA, leyes, comunicado oficial.

## 14. Preguntas abiertas

1. **Roles y niveles de educación:** se dejan los 13 roles y 4 niveles y se afinan después.
2. **Comerciantes y empleados:** confirmar que los empleados son los obreros y el valor de `empleados_por_comerciante`.
3. **Calibración inicial** de ingresos, nómina y producción de alimento (sección 13).
