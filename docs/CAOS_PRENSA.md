# Caos y prensa

> Qué hacen las personas por su cuenta (director de caos), cómo se cuenta lo que pasa (prensa) y los contratos con la IA opcional. Tabla de acciones: ACCIONES.md. Modificadores y causas: MUNDO §10. Los medios son firmas (ECONOMIA §4). Los valores son parámetros con nombre del preset. Lo marcado **[propuesta]** se pule.

---

## 1. Principios

- El juego funciona completo sin IA. Todo tiene versión mecánica, y es la que se balancea.
- El motor decide qué pasa y cuánto; el director y la prensa deciden cómo se expresa y se cuenta. El texto nunca cambia la simulación.
- Una acción es un **disfraz** (textos, animación, requisitos, afinidad, contagio) más **efectos** de un catálogo cerrado (§5). Las estadísticas solo las mueven los efectos.
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

- `requisitos`: quién puede. `contexto`: condición del mundo para ser candidata (por ejemplo `{ "fenomeno": "plaga_zombie" }`); sin contexto, siempre. Algunos requisitos miran el hogar (con ahorro, con casa, con jubilado).
- `afinidad`: rasgos que la hacen más (`+`) o menos (`-`) probable. `contagio`: 0 a 1 (§4).
- `duracion_dias`: siempre finita. `zona_destino`: a dónde van los participantes mientras dura.
- `textos`: al menos 3 variantes, en tercera persona y presente, sin cifras, con `{nombre}`, `{rol}` y `{zona}` (y `{firma}` si nombra una firma). No se repite la última usada. Cada acción tiene su animación en la vista.
- Los efectos sobre dinero y comida actúan sobre el **hogar** de la persona. Catálogo de acciones: ACCIONES.md.
- **Dónde y cuándo ocurre:** una acción con `fuera_de_puesto` o `moviliza` **reemplaza** la rutina de la persona (en vez de su turno, o en su `zona_destino`; MOTOR §7). Una acción sin esos efectos (las rarezas, un rumor, cuidar) ocurre en su **tiempo libre**, cerca de su casa o su zona, y no toca su turno ni su producción. Así el mundo se ve vivo sin frenar la economía.
- **Rarezas:** acciones de color cuyos únicos efectos son `decorativa` o `anima` baja (`cavar_pozo`, `ver_nubes`, `coleccionar_piedras`, `hablar_con_gallinas`, `cantar_en_plaza`, `mudarse_a_otro_barrio`). Sirven para dar vida y para contar historias, no para mover números. Tienen su propio tope (`max_rarezas_por_periodo`): **no cuentan contra `max_acciones_por_periodo` ni las frena el respiro**, para que el color no le quite lugar al caos que importa ni desaparezca cuando la comunidad está mal.

## 3. Acciones de condición

Consecuencias de una situación del mundo, no caos. El **motor** decide si pasan y cuánto: cuando se cumple el disparador abre una ventana y elige participantes (requisitos, afinidad, azar) y duración. El **director** solo elige entre las acciones válidas para esa situación; nunca puede elegir que no pase nada.

| Acción | Disparador |
|---|---|
| `huelga` | Impago del estado que alcanza la nómina (puede reabrirse mientras dure) |
| `paro_firma` | `empresa_recorte` o `empresa_despido` de una firma, sobre su umbral de recorte |
| `protesta` | `descontentos_pct` sobre su umbral |
| `saqueo` | `hambre_critica_pct` sobre su umbral |
| `ocupacion` | `calle_pct` sobre su umbral y casas vacías disponibles |
| `boicot` | `cuota_zona` de una firma sobre `umbral_poder_precio` y precio de la comida sobre su umbral |

- **Umbrales:** cada acción de condición tiene su umbral propio (`umbral_protesta`, `umbral_saqueo`, `umbral_ocupacion`, `umbral_boicot`, `umbral_recorte_paro`) y cada tema de noticia el suyo (`umbral_noticia_<tema>`). Son parámetros distintos aunque arranquen con el mismo valor. `hambre_critica_pct` usa `umbral_hambre_critica` (MUNDO §11), el mismo con el que la hambre daña la salud (MUNDO §6).
- No cuentan contra `max_acciones_por_periodo` ni las frena el respiro. Sus participantes sí ocupan los topes de efecto, aunque el tope no los frena.
- Su contagio no se modifica por orden ni satisfacción.
- El origen registra quién eligió: `accion:huelga/motor` o `accion:huelga/clasificador`.

## 4. Contagio

Una ola nace de un **foco** y muere con él. Misma mecánica que los fenómenos con daño (MUNDO §9): una fuente, una exposición, un freno y una tirada diaria por persona.

- **Foco:** la acción que eligió el director o abrió una condición (§3). Es la **única fuente**: los contagiados no contagian a nadie. Si no, una protesta se encadenaría sola sin límite.
- **Exposición** de una zona = % de sus personas que hoy hacen esa acción (foco más contagiados). Sin foco en la zona efectiva, no hay tirada.
- **Probabilidad diaria** de contagiarse una persona de la zona = `contagio` de la acción × exposición × (1 − `k_orden` × orden/100) × (1 − `k_satisfaccion` × satisfacción media de la zona/100) × `k_contagio_global` × factor de afinidad (mismo peso que en §6). El freno de orden y satisfacción vale solo para las espontáneas; las de condición ignoran ambos frenos (§3).
- **Quiénes:** pueden contagiarse las personas de la zona que cumplen los requisitos y no están internadas ni ya en otra acción. Cada acción contagia solo a su propia zona efectiva, no salta de zona.
- **Cuánto dura:** el contagiado hace la misma acción hasta que termina el foco original; la duración de cada uno no pasa `duracion_max_dias`.
- **Topes:** los contagiados no cuentan contra `max_acciones_por_periodo`, pero sí contra los topes de efecto (por ejemplo `max_pct_rol_fuera_de_puesto`): con el tope lleno no se tira. Así una ola nunca paraliza un rol entero.
- **Costo:** solo se tira en zonas con foco activo, no en las 5.000 personas cada día.
- **Efectos de hogar:** el contagio es por zona, no por hogar; los efectos sobre dinero y comida actúan sobre el hogar de cada contagiado.
- **`k_contagio_global`** es un parámetro del mundo: escala todo el contagio y es una de las perillas de estabilidad (MUNDO §14). Valor 0 lo apaga.
- Origen `accion:<id>/contagio`, con causa en el evento del foco.

## 5. Catálogo de efectos

| Efecto | Qué hace | A quién | Límite |
|---|---|---|---|
| `fuera_de_puesto` | No produce ni cobra por su trabajo (el público cobra salvo impago; el dueño cobra su ganancia) | Participante | `max_pct_rol_fuera_de_puesto`; frena solo al caos espontáneo |
| `anima` | Sube o baja la satisfacción | Participante, hogar o zona | Intensidad |
| `agita` | Sube el miedo y la rebeldía efectiva | Zona efectiva | Duración |
| `acapara` | Sube el objetivo de despensa de su hogar | Participante | Tope de despensa |
| `moviliza` | Pasa a la `zona_destino` | Participante | Solo la zona efectiva |
| `decorativa` | Nada en los datos | — | — |
| `gasta` | Sube su propensión al gasto | Participante | Intensidad y el `dinero` del hogar |
| `ahorra` | Baja su propensión al gasto | Participante | Intensidad |
| `comparte` | Cede despensa a vecinos con la despensa baja (la comida se conserva) | Participante y receptores | `max_pct_despensa_cedida` por día |
| `difunde` | Rumor en la zona: `miedo`, `descontento` o `esperanza` | Zona efectiva | Intensidad; decae |
| `repara` | Cuenta como reparador de su zona, o repara el `estado` de su casa propia | Zona o casa | Solo si hay daño |
| `cuida` | Sube la cura natural de vecinos con salud baja no internados | Zona efectiva | No reemplaza al hospital |
| `toma` | Saca comida del stock sin pagar | Participante | Solo acciones de condición; tope diario |
| `ocupa` | Ocupa una casa vacía sin pagar alquiler mientras dure | Hogar del participante | Solo acciones de condición; `max_ocupaciones_por_periodo` |
| `boicotea` | Desvía sus compras lejos de una firma | Hogar del participante | `max_pct_hogares_boicot`; solo acciones de condición |
| `emprendedor` | Sube su probabilidad de emprender el próximo período | Participante | Intensidad; decae |

- Intensidades `baja`, `media` y `alta`, con valores en el preset. Todos los efectos son acotados y reversibles, salvo la comida tomada.
- Los límites del caos se enganchan al efecto, no a la acción. El caos espontáneo nunca roba ni ocupa.
- Fuera del mundo base: `resguarda` (voluntarios que suman a la policía), `vandaliza` y la acción `disturbios` (daño a la zona por una protesta sin orden).

## 6. Director de caos

**Ritmo.** Cada día ofrece acciones a `ofertas_por_dia` personas, mientras queden focos en el período del caos y no haya respiro. Nunca a internados ni a quien ya tiene una acción.

**A quién** **[propuesta]:** sorteo con peso por interés = 1 + `k_extremo` × rasgos extremos (< 20 o > 80) + `k_descontento` × (satisfacción < 30) + `k_reciente` × (modificador nuevo, **incluidos hechos de familia o de bienes**: nacimiento, muerte de un familiar, desalojo, quiebra de su firma, herencia, compra de una firma). El caos le pasa más a quien tiene historia.

**Qué elige:**

1. Candidatas: las espontáneas cuyos requisitos, contexto y **estado del hogar** cumple (por ejemplo, `compras_compulsivas` pide dinero en el hogar), hasta `candidatas_max`, sorteadas por peso.
2. Peso de afinidad **[propuesta]**: por cada rasgo de la afinidad, × (1 + `k_afinidad` × (rasgo efectivo − 50)/50), con su signo.
3. Sorteo con semilla por peso o, con el clasificador, por sus probabilidades (§9).
4. Duración sorteada dentro de la de la acción, con tope `duracion_max_dias`.

**Equilibrio entre caos y orden.** El director empuja y el mundo se defiende: de un lado el director, el contagio, las acciones de condición y las crisis de clima y mercado; del otro la policía (`orden`), la satisfacción y la resiliencia, el respiro, los topes y la recuperación espontánea. Cuánto pesa cada lado es configurable al empezar el mundo y decide si el mundo se sostiene, oscila o colapsa (MUNDO §14).

**Límites del caos** (parámetros del mundo; cambiarlos es configuración de prueba):

| Límite | Qué cuenta |
|---|---|
| `max_acciones_por_periodo` (en `periodo_dias_caos`) | Solo los focos que elige el director, sin las rarezas |
| `max_pct_rol_fuera_de_puesto` | Todos los que tienen el efecto, sea foco, contagio o condición |
| `duracion_max_dias` | Las espontáneas |
| `respiro_si_satisfaccion_media_menor_a` | Frena el caos espontáneo cuando la comunidad está al borde (no a las rarezas) |
| `max_rarezas_por_periodo` | Solo las rarezas (§2) |

## 7. Medios

Los medios son **firmas de rubro `medio`** (ECONOMIA §4). Hay de 0 a muchos; la cantidad evoluciona con el mundo.

```json
{ "id": "f_21", "rubro": "medio", "nombre": "El Heraldo",
  "partes": [{ "npc": "npc_31", "pct": 100 }],
  "linea_editorial": { "afinidad_gobierno": 40, "sensacionalismo": 70 },
  "credibilidad": 65, "alcance_pct": 80, "columnistas": ["npc_58", "npc_62"],
  "ingresos": { "publicidad": 30, "fondos_estado": 20, "dependencia_pct": 40 }, "caja": 15 }
```

- **Dueño notable:** el dueño mayoritario de un medio es un actor del gobernador (ACTORES §1) y puede presionar o extorsionar con campañas.
- **Dueños y línea editorial [propuesta]:** la línea inicial sale de los dueños (su lealtad media da la afinidad con el gobierno; su rebeldía, codicia y valentía dan el sensacionalismo). Al cambiar los dueños, la línea se mueve de a poco hacia la nueva (`k_linea` por período).
- **Ingresos:** `publicidad` (las firmas la pagan, ECONOMIA §5, repartida por alcance × credibilidad) y `fondos_estado` (el control `fondos_prensa`, repartido parejo entre los medios, CONTROLES §2). Con los ingresos se pagan sueldos de columnistas; el resto va a dueños o caja.
- **Alcance:** crece con los ingresos propios (rendimientos decrecientes, no se acumula) y con los fondos del estado.
- **Consumo:** cada persona elige qué medios lee según personalidad, lealtad y el alcance de cada uno. Da burbujas sin relaciones entre personas.
- **Dependencia** = fondos del estado ÷ (publicidad + fondos). Con más dependencia, la afinidad con el gobierno sube sola; sobre `umbral_dependencia_pct` la credibilidad cae y bajo él se recupera de a poco.
- **Fundar, comprar y quebrar:** una persona o firma puede fundar un medio, comprarlo a sus dueños (ECONOMIA §9) o fusionarlo con otro. Un medio con caja negativa `periodos_para_quebrar` períodos **cierra** y sus columnistas quedan desempleados.
- **Monopolio de medios:** con un solo medio o una cuota alta, la información de la ciudad pasa por una línea; sin alternativa la credibilidad cae despacio si el sensacionalismo es alto **[propuesta]**. Con cero medios nadie se entera del aviso del clima: la policía queda mal ubicada.
- **Campaña** (medida de actor, ACTORES.md): por unos días el medio publica con un tono fijo sobre un tema, aunque no sea el que le tocaría.

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
| `conflicto` | Inicio de huelga, paro, protesta, saqueo, ocupación o boicot | Alta | Mala |
| `empresas` | `empresa_despido`, `empresa_recorte`, `empresa_aumento` | Media | Mala o buena |
| `gobierno` | `control` (cambio en vigencia) | Media | Según el control (CONTROLES §2) |
| `obras` | `obra_fin` (edificio inaugurado), `via_fin`, `zona_abierta`, local o campo privado nuevo | Media | Buena |
| `presiones` | `demanda_rechazada`, `demanda_incumplida`, `extorsion`, la medida que sigue y un cedido por extorsión | Alta | Mala |
| `vecinos` | Acción espontánea con 3 o más participantes, o una rareza | Baja | Neutra |
| `objetivo` | `victoria`, `objetivo_perdido` | Obligatoria | Buena o mala |
| `vivienda` | `calle_pct` sobre su umbral, `desalojo` en masa, casa nueva | Alta | Mala o buena |
| `firmas` | `firma_fundada`, `firma_compra`, `firma_quiebra`, `monopolio` | Media a alta | Mala o buena |
| `demografia` | Nacimiento o muerte relevante, hito de población, ola de muertes | Baja a alta | Neutra o mala |
| `familia` | Herencia grande, pareja o nacimiento destacado | Baja | Neutra |

- **Obligatoria:** la publican todos los medios.
- **Culpa del gobierno:** el hecho es del gobierno si su cadena de causas llega a un evento `control`. Los hechos de firmas y familias no lo son salvo que la cadena llegue a un control.

**Qué publica cada medio.** Capacidad diaria = columnistas vivos × `noticias_por_columnista`. Elige por relevancia × su interés (el sensacionalismo pesa `ataque`, `conflicto`, `hambre`, `vecinos` y `vivienda`). Una noticia repetida (tema y zona dentro de `ventana_repeticion_dias`) pesa menos. Autor: un columnista al azar.

**Tono** (sorteado con semilla):

| Tono | Pesa más cuando | Efecto en el lector |
|---|---|---|
| `alarmista` | Sensacionalismo alto y valencia mala | Miedo + |
| `critico` | Afinidad baja, valencia mala y hecho del gobierno | Lealtad − |
| `favorable` | Afinidad alta, o valencia buena y hecho del gobierno | Lealtad + |
| `neutral` | Siempre tiene un peso base | Ninguno |

**Efecto.** Solo sobre quienes leen ese medio, como modificador con origen `noticia:<id>`. Magnitud = base del tono × alcance/100 × credibilidad/100 × factor de repetición. Dura `duracion_efecto_noticia` días y decae, con tope `max_efecto_noticias_dia` por persona. Las noticias de aviso, de cualquier tono, alimentan la amenaza percibida (MUNDO §9).

```json
{ "id": "n_41", "medio": "f_21", "autor": "npc_31", "tema": "hambre", "tono": "alarmista", "alcance": 70,
  "titulo": "...", "texto": "...", "texto_origen": "plantilla", "origen": "estado:hambre_critica", "datos": {} }
```

**Plantillas.** Título y texto por tema y tono, con al menos 2 variantes, usando solo variables de los datos: `{medio}`, `{autor}`, `{zona}`, `{fenomeno}`, `{dias}`, `{cifra}` (formateada por el motor), `{firma}`, `{dueno}`, `{hogar}`, `{familia}`, `{control}`, `{valor_anterior}`, `{valor_nuevo}`. Las combinaciones sin sentido caen al tono neutral. Las escribe el agente de prototipo.

## 9. IA opcional

Dos usos independientes, cada uno con su modelo local o por API. Interfaz: `elegirAccion(persona, candidatas)` → probabilidades y `pedirTexto(noticia)` → texto. Infraestructura (asíncrono, plazos, memoria): MOTOR §4.

**Clasificador.** Entrada: rasgos y variables de la persona, rol, zona, una lista corta de hechos de su situación y de su hogar (sin cifras) y las candidatas con ids neutros (`c1`, `c2`) y descripciones claras y distintas, en orden mezclado. Salida: `{ "c1": 0.7, "c2": 0.3 }`. Se validan ids y rangos y se normaliza; si falla o no llega a tiempo, elige el motor. El motor siempre sortea con su semilla según las probabilidades.

**Generativo.** Entrada: tema, tono, medio, autor, datos del hecho con sus cifras exactas, la plantilla como guía y el largo máximo. Salida: `{ "titulo", "texto" }`. Se rechaza si pasa el largo, si trae un número o un nombre propio que no está en los datos, o si llega tarde: entonces se usa la plantilla. El texto aceptado se guarda (`texto_origen: generativo`).

## 10. Pruebas (agente de prototipo)

- **Sin IA:** cada acción aparece y ninguna pasa `max_pct_accion` de los focos; el caos respeta sus límites y la comunidad se recupera sola; los tonos siguen la línea de cada medio; el efecto de las noticias queda acotado y sin bucles; el aviso llega bien con un medio creíble y mal con uno desacreditado.
- **Acciones de condición:** cada una aparece al forzar su disparador; `ocupacion` y `boicot` no pasan sus topes.
- **Medios:** un medio dependiente pierde credibilidad; un medio sin ingresos cierra; con cero medios, el aviso llega mal; un cambio de dueños mueve la línea editorial de a poco, sin saltos.
- **Noticias:** las de vivienda y firmas aparecen cuando hay calle o fusiones, sin bucles entre noticias y efectos.
- **Con IA:** latencia y % resuelto por el motor, % de salidas rechazadas, diversidad frente al mecánico, memoria por combinación de modelos.
- **[pendiente de prueba]** Interruptor `noticias_mueven_satisfaccion`: se activa si la prensa no se siente; se apaga si duplica el efecto del hambre o del precio.
