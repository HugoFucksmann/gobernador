# Caos y prensa (v1.0)

> Qué hacen los NPCs por su cuenta (director de caos), cómo se cuenta lo que pasa (prensa) y los contratos con la IA opcional. Tabla de acciones: ACCIONES.md. Modificadores y causas: MUNDO §9. Valores: CALIBRACION.md.

---

## 1. Principios

- El juego funciona completo sin IA. Todo tiene versión mecánica, y es la que se balancea.
- El motor decide qué pasa y cuánto; el director y la prensa deciden cómo se expresa y se cuenta. El texto nunca cambia la simulación.
- Una acción es un **disfraz** (textos, animación, requisitos, afinidad, contagio) más **efectos** de un catálogo cerrado (sección 5). Las estadísticas solo las mueven los efectos.
- La prensa cuenta hechos ya ocurridos (salvo el aviso del clima) y todo número de una noticia sale de los datos del hecho.

## 2. Acciones

```json
{
  "id": "cavar_pozo",
  "textos": ["{nombre} se obsesiona con cavar un pozo", "{nombre} deja todo para cavar un pozo en el patio"],
  "requisitos": { "etapa": "adulto", "rol_no_en": ["policia"] },
  "contexto": null,
  "afinidad": { "rebeldia": "+", "laboriosidad": "-" },
  "efectos": [{ "id": "fuera_de_puesto" }, { "id": "anima", "intensidad": "baja" }],
  "duracion_dias": [3, 8],
  "contagio": 0.05,
  "zona_destino": null
}
```

- `requisitos`: quién puede. `contexto`: condición del mundo para ser candidata (por ejemplo `{ "fenomeno": "plaga_zombie" }`); sin contexto, siempre.
- `afinidad`: rasgos que la hacen más (`+`) o menos (`-`) probable. `contagio`: 0 a 1 (sección 4).
- `duracion_dias`: siempre finita. `zona_destino`: a dónde van los participantes mientras dura.
- `textos`: al menos 3 variantes, en tercera persona y presente, sin cifras, con `{nombre}`, `{rol}` y `{zona}`. No se repite la última usada. Cada acción tiene su animación en la vista.

## 3. Acciones de condición

Consecuencias de una situación del mundo, no caos. El **motor** decide si pasan y cuánto: cuando se cumple el disparador abre una ventana y elige participantes (requisitos, afinidad, azar) y duración. El **director** solo elige entre las acciones válidas para esa situación; nunca puede elegir que no pase nada.

| Acción | Disparador |
|---|---|
| `huelga` | Impago que alcanza la nómina (puede reabrirse mientras dure) |
| `protesta` | `descontentos_pct` sobre su umbral |
| `saqueo` | `hambre_critica_pct` sobre su umbral |

- No cuentan contra `max_acciones_por_periodo` ni las frena el respiro. Sus participantes sí ocupan los topes de efecto, aunque el tope no los frena.
- Su contagio no se modifica por orden ni satisfacción.
- El origen registra quién eligió: `accion:huelga/motor` o `accion:huelga/clasificador`.

## 4. Contagio

Misma mecánica que los fenómenos con daño (MUNDO §5): una fuente, una exposición, un freno y una tirada diaria por NPC.

- **Fuente:** una acción en curso en la zona efectiva. **Exposición:** % de la zona que ya la hace.
- **Contagio efectivo** (espontáneas) = `contagio` × (1 − `k_orden` × orden/100) × (1 − `k_satisfaccion` × satisfacción media de la zona/100).
- Pueden contagiarse los NPCs que cumplen los requisitos; la afinidad pesa. El contagiado hace la misma acción hasta que termina la original: una ola nace de un foco y muere con él.
- Los contagiados no cuentan contra `max_acciones_por_periodo`, pero sí contra los topes de efecto: con el tope lleno no se tira.
- Origen `accion:<id>/contagio`, con causa en el evento de la fuente.

## 5. Catálogo de efectos

| Efecto | Qué hace | A quién | Límite |
|---|---|---|---|
| `fuera_de_puesto` | No produce ni cobra por su trabajo (el público cobra salvo impago; el dueño cobra su ganancia) | Participante | `max_pct_rol_fuera_de_puesto`; frena solo al caos espontáneo |
| `anima` | Sube o baja la satisfacción | Participante o zona | Intensidad |
| `agita` | Sube el miedo y la rebeldía efectiva | Zona efectiva | Duración |
| `acapara` | Sube su objetivo de despensa | Participante | Tope de despensa |
| `moviliza` | Pasa a la `zona_destino` | Participante | Solo la zona efectiva |
| `decorativa` | Nada en los datos | — | — |
| `gasta` | Sube su propensión al gasto | Participante | Intensidad y su `dinero` |
| `ahorra` | Baja su propensión al gasto | Participante | Intensidad |
| `comparte` | Cede despensa a vecinos con la despensa baja (la comida se conserva) | Participante y receptores | `max_pct_despensa_cedida` por día |
| `difunde` | Rumor en la zona: `miedo`, `descontento` o `esperanza` | Zona efectiva | Intensidad; decae |
| `repara` | Cuenta como reparador de su zona | Zona | Solo si la zona tiene daño |
| `cuida` | Sube la cura natural de vecinos con salud baja no internados | Zona efectiva | No reemplaza al hospital |
| `toma` | Saca comida del stock sin pagar | Participante | Solo acciones de condición; tope diario |

- Intensidades `baja`, `media` y `alta`, con valores en CALIBRACION. Todos los efectos son acotados y reversibles, salvo la comida tomada.
- Los límites del caos se enganchan al efecto, no a la acción. El caos espontáneo nunca roba.
- Fuera del nivel 1: `resguarda` (voluntarios que suman a la policía), `vandaliza` y la acción `disturbios` (daño a la zona por una protesta sin orden).

## 6. Director de caos

**Ritmo.** Cada día ofrece acciones a `ofertas_por_dia` NPCs, mientras queden focos en el período del caos y no haya respiro. Nunca a internados ni a quien ya tiene una acción.

**A quién** **[propuesta]:** sorteo con peso por interés = 1 + `k_extremo` × rasgos extremos (< 20 o > 80) + `k_descontento` × (satisfacción < 30) + `k_reciente` × (modificador nuevo). El caos le pasa más a los personajes con historia.

**Qué elige:**

1. Candidatas: las espontáneas cuyos requisitos y contexto cumple, hasta `candidatas_max`, sorteadas por peso.
2. Peso de afinidad **[propuesta]**: por cada rasgo de la afinidad, × (1 + `k_afinidad` × (rasgo efectivo − 50)/50), con su signo.
3. Sorteo con semilla por peso o, con el clasificador, por sus probabilidades (sección 9).
4. Duración sorteada dentro de la de la acción, con tope `duracion_max_dias`.

**Límites del caos** (parámetros del mundo; cambiarlos es configuración de prueba):

| Límite | Qué cuenta |
|---|---|
| `max_acciones_por_periodo` (en `periodo_dias_caos`) | Solo los focos que elige el director |
| `max_pct_rol_fuera_de_puesto` | Todos los que tienen el efecto, sea foco, contagio o condición |
| `duracion_max_dias` | Las espontáneas |
| `respiro_si_satisfaccion_media_menor_a` | Frena el caos espontáneo cuando la comunidad está al borde |

## 7. Medios

Uno a tres medios privados (uno = monopolio). Sin dueño NPC.

```json
{ "id": "medio_1", "nombre": "El Heraldo",
  "linea_editorial": { "afinidad_gobierno": 40, "sensacionalismo": 70 },
  "credibilidad": 65, "alcance_pct": 80, "columnistas": ["npc_31", "npc_58"],
  "finanzas": { "ingresos_propios": 30, "fondos_estado": 20, "dependencia_pct": 40 } }
```

- **Fondos del estado:** el control de prensa ÷ cantidad de medios (reparto parejo). Suben el alcance (rendimientos decrecientes, no se acumula) y la dependencia.
- **Dependencia** = fondos del estado ÷ (ingresos propios + fondos). Con más dependencia, la afinidad con el gobierno sube sola. Sobre `umbral_dependencia_pct` la credibilidad cae; bajo él, se recupera de a poco.
- **Consumo:** cada NPC elige qué medios lee según personalidad y lealtad, con tope en el alcance. Da burbujas sin relaciones entre NPCs.
- **Campaña** (medida de actor, ACTORES.md): por unos días, el medio publica con un tono fijo sobre un tema, aunque no sea el que le tocaría.

## 8. Noticias

**Qué es noticia.** Cada evento del motor tiene una relevancia según su tema; los que superan `relevancia_min` entran a la cola del día.

| Tema | Eventos | Relevancia | Valencia |
|---|---|---|---|
| `aviso` | `aviso` | Obligatoria | Mala |
| `clima` | `fenomeno_inicio`, `fenomeno_fin` | Alta | Mala o buena |
| `ataque` | Golpes y muertes zombie, por día y zona | Alta | Mala |
| `salud` | `hospital_saturado`, muertes por pandemia | Alta | Mala |
| `hambre` | `hambre_critica_pct` sobre un umbral | Alta | Mala |
| `precio` | Cambio fuerte del precio de la comida | Media | Mala o buena |
| `impago` | `impago`, `impago_fin` | Alta | Mala o buena |
| `conflicto` | Inicio de huelga, protesta o saqueo | Alta | Mala |
| `empresas` | `empresa_despido`, `empresa_recorte`, `empresa_aumento` | Media | Mala o buena |
| `gobierno` | `control` (cambio en vigencia) | Media | Según el control (CONTROLES §2) |
| `obras` | `obra_fin` (edificio inaugurado), local o campo privado nuevo | Media | Buena |
| `presiones` | `demanda_rechazada` y la medida que sigue | Alta | Mala |
| `vecinos` | Acción espontánea con 3 o más participantes, o una rareza | Baja | Neutra |
| `objetivo` | `victoria`, `objetivo_perdido` | Obligatoria | Buena o mala |

- **Obligatoria:** la publican todos los medios.
- **Culpa del gobierno:** el hecho es del gobierno si su cadena de causas llega a un evento `control`.

**Qué publica cada medio.** Capacidad diaria = columnistas vivos × `noticias_por_columnista`. Elige por relevancia × su interés (el sensacionalismo pesa `ataque`, `conflicto`, `hambre` y `vecinos`). Una noticia repetida (tema y zona dentro de `ventana_repeticion_dias`) pesa menos. Autor: un columnista al azar.

**Tono** (sorteado con semilla):

| Tono | Pesa más cuando | Efecto en el lector |
|---|---|---|
| `alarmista` | Sensacionalismo alto y valencia mala | Miedo + |
| `critico` | Afinidad baja, valencia mala y hecho del gobierno | Lealtad − |
| `favorable` | Afinidad alta, o valencia buena y hecho del gobierno | Lealtad + |
| `neutral` | Siempre tiene un peso base | Ninguno |

**Efecto.** Solo sobre quienes leen ese medio, como modificador con origen `noticia:<id>`. Magnitud = base del tono × alcance/100 × credibilidad/100 × factor de repetición. Dura `duracion_efecto_noticia` días y decae, con tope `max_efecto_noticias_dia` por NPC. Las noticias de aviso, de cualquier tono, alimentan la amenaza percibida (MUNDO §8).

```json
{ "id": "n_41", "medio": "medio_1", "autor": "npc_31", "tema": "hambre", "tono": "alarmista", "alcance": 70,
  "titulo": "...", "texto": "...", "texto_origen": "plantilla", "origen": "estado:hambre_critica", "datos": {} }
```

**Plantillas.** Título y texto por tema y tono, con al menos 2 variantes, usando solo variables de los datos: `{medio}`, `{autor}`, `{zona}`, `{fenomeno}`, `{dias}`, `{cifra}` (formateada por el motor), `{empresa}`, `{control}`, `{valor_anterior}`, `{valor_nuevo}`. Las combinaciones sin sentido caen al tono neutral. Las escribe el agente de prototipo.

## 9. IA opcional

Dos usos independientes, cada uno con su modelo local o por API. Interfaz: `elegirAccion(npc, candidatas)` → probabilidades y `pedirTexto(noticia)` → texto. Infraestructura (asíncrono, plazos, memoria): MOTOR §4.

**Clasificador.** Entrada: rasgos y variables del NPC, rol, zona, una lista corta de hechos de su situación (sin cifras) y las candidatas con ids neutros (`c1`, `c2`) y descripciones claras y distintas, en orden mezclado. Salida: `{ "c1": 0.7, "c2": 0.3 }`. Se validan ids y rangos y se normaliza; si falla o no llega a tiempo, elige el motor. El motor siempre sortea con su semilla según las probabilidades.

**Generativo.** Entrada: tema, tono, medio, autor, datos del hecho con sus cifras exactas, la plantilla como guía y el largo máximo. Salida: `{ "titulo", "texto" }`. Se rechaza si pasa el largo, si trae un número o un nombre propio que no está en los datos, o si llega tarde: entonces se usa la plantilla. El texto aceptado se guarda (`texto_origen: generativo`).

## 10. Pruebas (agente de prototipo)

- **Sin IA:** cada acción aparece y ninguna pasa `max_pct_accion` de los focos; el caos respeta sus límites y la comunidad se recupera sola; los tonos siguen la línea de cada medio; el efecto de las noticias queda acotado y sin bucles; un medio dependiente pierde credibilidad; el aviso llega bien con un medio creíble y mal con uno desacreditado.
- **Con IA:** latencia y % resuelto por el motor, % de salidas rechazadas, diversidad frente al mecánico, memoria por combinación de modelos.
- **[pendiente de prueba]** Interruptor `noticias_mueven_satisfaccion`: se activa si la prensa no se siente; se apaga si duplica el efecto del hambre o del precio.
