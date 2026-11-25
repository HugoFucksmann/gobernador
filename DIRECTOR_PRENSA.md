# Director de caos y prensa (BORRADOR v0.1)

> Cómo elige el director qué hacen los NPCs, cómo nace y se escribe cada noticia, qué efecto tiene, y los contratos con la IA opcional. Estados y reglas: ESTADOS.md (§6 medios, §7 acciones, §8 causas, §9 director). Tabla de acciones: ACCIONES.md. Valores: CALIBRACION.md. **[decidido]** viene de otro doc; **[propuesta]** es base para pulir.

---

## 1. Principios

- **[decidido]** El juego funciona completo sin IA. Todo lo de este doc tiene versión mecánica, y es la que se balancea.
- **[decidido]** El motor decide qué pasa y cuánto; el director y la prensa deciden cómo se cuenta. El texto nunca cambia la simulación.
- **[propuesta]** La prensa cuenta hechos reales del motor, elegidos y teñidos por cada medio. Nunca inventa un hecho.
- **[propuesta]** Todo número que aparece en una noticia sale de los datos del hecho.

## 2. Director de caos

### 2.1 Ritmo

- **[propuesta]** Cada día, el director ofrece acciones a `ofertas_por_dia` NPCs, mientras queden focos disponibles en el período del caos (`max_acciones_por_periodo`, ESTADOS §9) y no haya respiro.
- **[decidido]** No se ofrecen acciones a NPCs internados ni a los que ya tienen una en curso.

### 2.2 A quién se le ofrece

**[propuesta]** Sorteo con semilla, con peso por **interés**:

interés = 1 + `k_extremo` × rasgos extremos (rasgos efectivos < 20 o > 80) + `k_descontento` × (satisfacción < 30) + `k_reciente` × (tiene un modificador nuevo en los últimos días)

Así el caos le pasa más a los personajes con historia, sin excluir a nadie.

### 2.3 Candidatas y elección

1. **Candidatas:** las acciones espontáneas cuyo `requisitos` y `contexto` cumple el NPC (ESTADOS §7). Se ofrecen como máximo `candidatas_max`, sorteadas por peso.
2. **Peso de afinidad [propuesta]:** para cada rasgo de la `afinidad` de la acción, multiplica por (1 + `k_afinidad` × (rasgo efectivo − 50) / 50), con el signo de la afinidad (`+` o `−`). Un NPC muy rebelde pesa casi el doble para predicar; uno sumiso, casi nada.
3. **Elección mecánica:** sorteo con semilla según el peso.
4. **Con el clasificador:** el clasificador devuelve una probabilidad por candidata y el motor sortea con ella (sección 5).
5. **Duración:** sorteada dentro de `duracion_dias` de la acción, con tope `duracion_max_dias`.

### 2.4 Acciones de condición

**[decidido]** El motor abre la ventana y decide cuántos participan (ESTADOS §7). El director solo elige entre las acciones de condición válidas para esa situación, con el mismo peso de afinidad. En la v1 casi siempre hay una sola válida (huelga, protesta o saqueo), así que la elección es directa.

### 2.5 Textos de las acciones

- **[propuesta]** Cada acción tiene al menos 3 variantes de texto, en tercera persona y en presente, sin cifras.
- Variables disponibles: `{nombre}`, `{rol}`, `{zona}`.
- El motor elige una variante al azar con semilla y no repite la última usada por esa acción.
- Las variantes completas de las 22 acciones se escriben en ACCIONES.md, columna nueva "Variantes".

## 3. Prensa: de un hecho a una noticia

### 3.1 Qué hechos son noticia

**[propuesta]** Cada evento del motor (ESTADOS §14) tiene una **relevancia** fija según su tipo. Los que superan `relevancia_min` entran a la **cola de hechos** del día.

| Tema | Eventos que lo disparan | Relevancia | Valencia |
|---|---|---|---|
| `aviso` | `aviso` (fenómeno anunciado) | Obligatoria | Mala |
| `clima` | `fenomeno_inicio`, `fenomeno_fin` | Alta | Mala o buena |
| `ataque` | Golpes y muertes de la plaga zombie, agregados por día y zona | Alta | Mala |
| `salud` | `hospital_saturado`, muertes por pandemia | Alta | Mala |
| `hambre` | Suba de `hambre_critica_pct` sobre un umbral | Alta | Mala |
| `precio` | Cambio fuerte del precio de la comida | Media | Mala o buena |
| `impago` | `impago`, `impago_fin` | Alta | Mala o buena |
| `conflicto` | Inicio de huelga, protesta o saqueo | Alta | Mala |
| `empresas` | `empresa_despido`, `empresa_recorte`, `empresa_aumento` | Media | Mala o buena |
| `gobierno` | `palanca` (cambios que entraron en vigencia) | Media | Según el cambio |
| `vecinos` | Inicio de una acción espontánea con 3 o más participantes, o una rareza | Baja | Neutra |
| `objetivo` | `victoria`, `objetivo_perdido` | Obligatoria | Buena o mala |

- **Obligatoria:** la publican todos los medios. El aviso es lo que mueve la amenaza percibida (ESTADOS §14).
- **Valencia:** si el hecho es bueno o malo para la comunidad. Para `palanca` la fija una tabla por palanca y dirección (por ejemplo, subir `impuesto` es mala; subir `ayuda_social` es buena).
- **Culpa del gobierno:** el hecho "es del gobierno" si su cadena de causas (ESTADOS §8) llega a un evento `palanca`. Es lo que permite a un medio crítico culpar con razón.

### 3.2 Qué publica cada medio

- **[propuesta]** Capacidad diaria = columnistas vivos × `noticias_por_columnista`. Sin columnistas, el medio no publica.
- Cada medio elige de la cola por relevancia × su interés en el tema. El sensacionalismo sube el peso de `ataque`, `conflicto`, `hambre` y `vecinos`.
- Una noticia repetida (mismo tema y misma zona en `ventana_repeticion_dias`) pesa menos para elegir y para su efecto (ESTADOS §6, anti-bucle).
- El autor es uno de sus columnistas, sorteado.

### 3.3 Tono

**[propuesta]** Cuatro tonos: `favorable` (al gobierno), `neutral`, `critico` (con el gobierno) y `alarmista` (miedo). Se sortea con semilla con estos pesos:

| Tono | Pesa más cuando |
|---|---|
| `alarmista` | Sensacionalismo alto y valencia mala |
| `critico` | Afinidad con el gobierno baja, valencia mala y el hecho es del gobierno |
| `favorable` | Afinidad con el gobierno alta, o valencia buena y el hecho es del gobierno |
| `neutral` | Siempre tiene un peso base; es el tono de un medio creíble y moderado |

Un medio muy dependiente del estado (afinidad alta) tiende a contar bien las decisiones del gobierno y a suavizar las malas noticias: es justamente lo que le hace perder credibilidad (ESTADOS §6).

### 3.4 Efecto sobre los NPCs

- **[decidido]** Solo la reciben los NPCs que consumen ese medio (ESTADOS §6). El efecto es un modificador con origen `noticia:<id>`.
- **[propuesta]** Magnitud = base del tono × alcance de la noticia / 100 × credibilidad / 100 × factor de repetición.

| Tono | Efecto en el lector |
|---|---|
| `alarmista` | Miedo + |
| `critico` | Lealtad − |
| `favorable` | Lealtad + |
| `neutral` | Ninguno (salvo el aviso, que cuenta para la amenaza percibida) |

- Los efectos duran `duracion_efecto_noticia` días y decaen. Un NPC no suma más de `max_efecto_noticias_dia` por día.
- La **amenaza percibida** usa las noticias de aviso de cualquier tono (ESTADOS §14).

## 4. Plantillas

**[propuesta]** Una plantilla es un título y un texto con variables, por tema y tono. Mínimo 2 variantes por combinación. Solo usan variables que existen en los datos del hecho:

- `{medio}`, `{autor}`, `{zona}`, `{fenomeno}`, `{dias}`.
- `{cifra}`: el número principal del hecho (porcentaje, cantidad o precio), ya formateado por el motor.
- `{empresa}`, `{palanca}`, `{valor_anterior}`, `{valor_nuevo}`.

```json
{
  "tema": "precio",
  "tono": "alarmista",
  "variantes": [
    { "titulo": "¡La comida se dispara! Ya cuesta {cifra}", "texto": "Los vecinos de {zona} no pueden creer lo que pagan..." },
    { "titulo": "Precios por las nubes: {cifra} y subiendo", "texto": "..." }
  ]
}
```

Volumen de la v1: 12 temas × 4 tonos × 2 variantes = 96 plantillas. Las combinaciones que no tienen sentido (un aviso favorable) se omiten y caen al tono neutral.

## 5. Contrato del clasificador (opcional)

**Entrada** **[propuesta]:**

```json
{
  "npc": { "rasgos": { "rebeldia": 80, "valentia": 30 }, "variables": { "miedo": 60, "satisfaccion": 25 }, "rol": "obrero", "zona": "este" },
  "situacion": ["plaga zombie activa", "despidos recientes en su empresa"],
  "candidatas": [
    { "id": "c1", "descripcion": "Difundir un rumor alarmista entre los vecinos" },
    { "id": "c2", "descripcion": "Llenar la despensa por si acaso" }
  ]
}
```

- Las candidatas llevan ids neutros (`c1`, `c2`...) y una descripción clara y distinta. El orden se mezcla en cada consulta (ESTADOS §9).
- La `situacion` son hechos cortos que arma el motor, sin cifras.

**Salida:** `{ "c1": 0.7, "c2": 0.3 }`.

**Validación:** ids válidos, valores entre 0 y 1. Se normaliza para que sumen 1. Si falla la validación o no llega a tiempo (`plazo_clasificador_ms`), elige el motor. Toda elección se guarda con su día y origen (ESTADOS §9).

## 6. Contrato del generativo (opcional)

**Entrada** **[propuesta]:** el tema, el tono, el medio (nombre y línea editorial), el autor, los datos del hecho con sus cifras exactas, la plantilla elegida (como guía de estilo) y el largo máximo del título y del texto.

**Salida:** `{ "titulo": "...", "texto": "..." }`.

**Validación** (si falla, se usa la plantilla):

- El título y el texto no pasan el largo máximo.
- Todo número del texto está en los datos del hecho.
- Todo nombre propio está en los datos (NPCs, zonas, medio, empresas).
- Llegó antes de `plazo_generativo_ms`.

El texto aceptado se guarda (`texto_origen: generativo`) y no se pide de nuevo.

## 7. Plan de pruebas (agente de prototipo)

**Sin IA:**

- Cada acción de la tabla aparece en una partida larga; ninguna pasa de `max_pct_accion` de todos los focos.
- El caos respeta los límites (ESTADOS §9) y la comunidad se recupera sola si el caos se detiene.
- La prensa: distribución de tonos por medio según su línea; el efecto de las noticias en la lealtad queda acotado y no entra en bucle.
- Un medio dependiente pierde credibilidad y su efecto baja.
- El aviso llega a tiempo con un medio creíble y tarde o débil con uno desacreditado, y la defensa se ubica en consecuencia.

**Con IA:**

- Latencia y % de elecciones resueltas por el motor por plazo.
- % de salidas del clasificador rechazadas por validación.
- Diversidad de las elecciones frente al mecánico (que no colapse siempre a la misma acción).
- % de textos generativos rechazados y por qué motivo.
- Memoria (VRAM) de cada combinación de modelos (UI §12).

## 8. Parámetros para CALIBRACION

`ofertas_por_dia`, `k_extremo`, `k_descontento`, `k_reciente`, `candidatas_max`, `k_afinidad`, `relevancia_min`, la relevancia de cada tema, `noticias_por_columnista`, `ventana_repeticion_dias`, los pesos de tono, la base de efecto de cada tono, `duracion_efecto_noticia`, `max_efecto_noticias_dia`, `plazo_clasificador_ms`, `plazo_generativo_ms`, `max_pct_accion`.

## 9. Decisiones y pendientes

- **[decidido] La prensa no se adelanta a los hechos:** solo cuenta lo que ya pasó, salvo el aviso del clima. Es lo que sostiene el principio de que nunca inventa un hecho (sección 1) y evita noticias sin causa en la cadena (ESTADOS §8).
- **[pendiente de prueba] ¿Las noticias mueven también la satisfacción?** La base solo mueve lealtad y miedo. El agente de prototipo prueba las dos variantes (con un interruptor `noticias_mueven_satisfaccion`) y se decide con los resultados: si sin él la prensa no se siente, se activa; si con él duplica el efecto del hambre o el precio, se deja apagado.
