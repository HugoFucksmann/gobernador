# Juego de gobernador con comunidad de NPCs (título provisorio) (BORRADOR v0.6)

> Estado del documento: idea en definición. El detalle del gobernador está en GOBERNADOR.md. El detalle técnico (estados, tabla de acciones, medios) vive en ESTADOS.md. La interfaz final está en UI.md y los niveles del juego en HOJA_DE_RUTA.md.

---

## 1. Pitch

Una simulación de comunidad donde cada habitante es un NPC independiente con personalidad propia. El jugador es el **gobernador**: gestiona las condiciones de la comunidad, no a las personas directamente. Un **director de caos** altera lo que los NPCs hacen, eligiendo entre una gran tabla de acciones predefinidas, para que hagan cosas diversas, raras y divertidas, y la **prensa** cuenta lo que pasa. **El juego funciona completo sin IA.** Opcionalmente, una IA local mejora las decisiones (un modelo clasificador) y el texto de las noticias (un modelo generativo).

## 2. Corazón del juego

La tensión entre **el orden que intenta imponer el gobernador** y **el caos creativo de la propia comunidad**. No se trata de optimizar una colonia, sino de gobernar gente impredecible.

## 3. Pilares

1. **Simulación mecánica y barata.** Cada NPC tiene un estado propio (personalidad, rasgos únicos). La comunidad no tiene un estado propio: se deriva de los NPCs. El día a día corre con reglas, sin IA.
2. **Caos mecánico, IA opcional.** Un director de caos elige qué hacen los NPCs entre una gran tabla de acciones predefinidas, acotadas y animables, y los textos salen de plantillas. La IA es opcional y de dos tipos: un modelo clasificador (no generativo) que elige entre las candidatas que el juego le ofrece, y un modelo generativo que escribe el texto de las noticias, que es decorativo. El modelo aporta elección y texto; las reglas, la magnitud de los efectos y cuánto caos entra los controla el juego. Con o sin IA las reglas son las mismas, y un modelo mejor mejora lo que se ve, no cambia las reglas.
3. **Gobernador que interviene.** Influye sobre la comunidad y sus estadísticas sin mandar directamente a cada NPC. El jugador responde a la comunidad: el director de caos la altera.
4. **Sucesos generales.** Dependen del mundo. Por ejemplo, los fenómenos naturales (sequías, plagas, pandemias) alteran los recursos y a los NPCs, y afectan a la comunidad y a sus estadísticas, condicionando la gestión del gobernador.
5. **Economía de la comunidad.** Los NPCs trabajan, ganan y gastan. Cada grupo vive distinto y la desigualdad genera descontento. El alimento lo producen y comercian los habitantes, y el estado tiene que garantizar que todos coman.
6. **Prensa.** Los medios cuentan lo que pasa en la comunidad, influyen en el humor social y en lo que los NPCs saben. Es la forma en que el jugador ve lo que hace la comunidad, y una herramienta más con la que el gobernador tiene que lidiar. Cada noticia nace de datos del motor; el texto sale de plantillas o, si la IA opcional está activa, de un modelo generativo.
7. **Todo relacionado con todo.** Una acción de un NPC, el clima, una noticia o una decisión del gobernador pueden afectarse entre sí. Las consecuencias pueden encadenarse, y el jugador debe poder entender por qué pasó lo que pasó.
8. **Mundos intercambiables.** Se empieza con mundos chicos para experimentar; los mundos se pueden cambiar.

## 4. Modelo de estado

Estados que sabemos que existen:

- **Estado del gobierno.**
- **Estado del clima.** Los fenómenos naturales (sequías, plagas, pandemias) alteran recursos y NPCs.
- **Estado de los medios.** Cada medio de prensa tiene su propia identidad y alcance.
- **Estado de cada NPC:** personalidad y rasgos únicos de cada personaje.

Además:

- **La comunidad no tiene estado propio:** se deriva de los NPCs.
- **El espacio es por zonas:** el motor conoce 4 a 6 zonas por mundo (con vecindad) y cada NPC tiene una. Las coordenadas y el movimiento son de la UI (ESTADOS §14).
- **La economía la mueven los NPCs:** cada uno gana y gasta su propio dinero. El gobierno recauda impuestos y administra los fondos. El alimento lo produce y comercia la sociedad, y el estado lo regula. La economía es modular, de simple a compleja (ESTADOS §3.1).

El diseño detallado de los estados está en ESTADOS.md (en borrador).

## 5. Escenarios y panel de configuración

Antes de arrancar una partida hay un **panel de configuración del mundo**, donde se le asigna una **historia** y un **objetivo**.

- **Primera versión:** cada escenario viene **pre-configurado** (historia, objetivo y mundo ya armados), y el panel permite **modificar varias cosas**. Más adelante se podrán sumar más opciones de configuración.
- **Configurable desde el panel (decidido):**
  - El **escenario** (elegir el preset).
  - La **prensa**: un único medio (monopolio) o varios.
  - Los **límites del caos**. Los valores por defecto son los de balance, y cualquier cambio queda marcado como "configuración de prueba".
  - El **módulo de economía** (de simple a más compleja).
- **Mundos iniciales (2):**
  - *Elecciones:* el objetivo es gobernar y ganar elecciones, manteniendo a la comunidad a gusto. En el nivel 1 el dilema es dar subsidios contra cuidar la reserva. Si la reserva se agota hay impago: los empleados públicos se declaran en huelga y los servicios caen.
  - *Apocalipsis zombie:* el objetivo es que la comunidad sobreviva. Hay que administrar más seguridad (policía), con el riesgo de quedarse sin recursos para comida. Los NPCs pueden sumarse a la policía. Los policías se reubican hacia la zona por donde vienen los zombies, según lo que la ciudadanía se entere por la prensa. Los zombis dañan la integridad de las zonas y los NPCs la reparan.
- **Orden de implementación:** primero *elecciones*, después *zombies*.
- **Escala:** mundos de **alrededor de 100 NPCs** para empezar. La cantidad es un parámetro del mundo; el techo del nivel 1 es 1.000 (UI §12). Se eligió 100 porque con más gente los roles y los porcentajes se vuelven más estables y significativos.

### Escalabilidad

La primera versión es simple, pero se diseña desde el inicio para escalar a más mundos y objetivos.

### Alcance del nivel 1

- Cada escenario tiene **un objetivo y una condición de derrota**. Más de un objetivo queda para después.
- La **victoria** es un hito que se evalúa al llegar el plazo (ej. elecciones): avisa y la partida sigue. Solo la **derrota** (ej. perder por una amenaza, colapso) termina la partida y se evalúa en cualquier momento.
- **El objetivo y su progreso son visibles para el jugador** (decidido; detalle en ESTADOS §11).
- **Al generar el mundo, todo debe encajar para que inicialmente funcione, y después se desajusta.** Lo que lo desajusta es el clima (la plaga zombie cuenta como clima) y el director de caos, que altera a los NPCs.
- La **historia de cada escenario se escribe a mano** (son presets).
- **Economía por módulos:** se construye de lo simple a lo complejo y se elige en el panel. El nivel 1 usa el módulo `simple`; `individual` y `fiscal` entran en el nivel 1.1 (HOJA_DE_RUTA §3).
- **Sin objetivo (solo historia):** no es un modo del nivel 1. Queda como prueba posterior.
- **Oposición de la comunidad:** en el nivel 1 no hay rebelión ni golpe como mecánica explícita. El descontento se expresa a través del objetivo (por ejemplo votos en elecciones, bajas y colapso en zombies).

## 6. Núcleo común a todos los escenarios

El juego es gobernar, sin importar el mundo. Todos los escenarios comparten las mismas palancas, el mismo modelo de estados, la misma economía (con su módulo elegido), el mismo director de caos (con la IA opcional) y los mismos límites del caos.

Un escenario solo cambia datos: historia, objetivo y condición de derrota, fenómenos del clima, valores iniciales (población, roles, reserva, stock), módulo de economía y límites del caos. La palanca crítica sale de la situación, no de una mecánica propia del mundo.

Los mundos no agregan mecánicas ni palancas exclusivas. Si un escenario necesita algo nuevo, o se expresa con los datos existentes (clima, roles, acciones, objetivo) o se incorpora al núcleo para todos.

Decisión: cerrado.

## 7. El gobernador (referencia)

> El detalle está en **GOBERNADOR.md**. Acá queda solo la idea.

- El gobernador actúa como un **gobernador real**: administra el estado, redistribuye recursos y evalúa complejidad.
- En la primera versión hay **un único gobernante, el usuario, sin división de poderes**.
- **La comunidad genera la riqueza** (los NPCs trabajan y ganan) y **el gobierno recauda y administra los fondos.**
- **La mecánica del juego son las palancas que el gobernador tiene** (áreas y palancas concretas: GOBERNADOR §3 y §4). Cada palanca tiene consecuencias y trade-offs. Ejemplos rápidos:
  - Zombies: invertir más en seguridad/policía, pero te podés quedar sin recursos para comida.
  - Elecciones: dar subsidios, pero la reserva se agota y llega el impago. Con el módulo `fiscal` (nivel 1.1), además, se puede emitir dinero y sube la inflación.
- **Prensa como palanca (decidido):** el gobernador actúa sobre la prensa solo de forma **indirecta** (financiar y regular en el nivel 1; presionar y dar o quitar acceso en el nivel 1.1). Nunca escribe la noticia. Cada opción tiene costos (presupuesto, descontento por censura, pérdida de credibilidad si se nota la propaganda).
- **Sancionar leyes:** queda como **idea a futuro** (ver sección 10).

## 8. Estados internos del juego

El detalle está en ESTADOS.md. Toda consecuencia (de una acción de un NPC, un rumor, el clima, una noticia o una palanca) se expresa de la misma forma y deja registrado su origen, para poder entender y afinar el juego.

## 9. Tiempo y visualización

- **Tiempo real**, con reloj **del juego** (no el reloj real). La regla está en ESTADOS §5 y la escala y las velocidades, en CALIBRACION.md.
- **Aceleración (decidido):** si se acelera, acelera la simulación. La IA opcional sigue a su propio ritmo y sus resultados se incorporan cuando están listos; si no llegan, el motor decide y usa plantillas. Nada frena el juego. Las velocidades siguen bajas por ahora (ESTADOS §5) y se revisan.
- **Duración de la partida:** no tiene un largo fijo, solo termina por derrota (IDEA §5, ESTADOS §11). Con la escala inicial de CALIBRACION.md, a x1 el plazo de elecciones (365 días) son unas 2 horas reales y el de zombies (180 días), una hora.
- **Mapa con NPCs visibles:** la UI muestra a los NPCs y todo lo que pasa. Dibuja lo que el motor decidió (qué, cuándo y en qué zona) y coreografía el cómo; no inventa eventos con efecto. Como las acciones salen de una tabla cerrada, cada una tiene su animación. El contrato está en ESTADOS §14 y UI §9.
- **Plataforma y estilo:** Steam, UI final en Godot, 3D low-poly con cámara libre (UI.md, nivel 2). El prototipo del nivel 1 usa su propia UI de depuración.

## 10. Ideas a futuro

Los niveles de cada idea están en HOJA_DE_RUTA (niveles 1.1 a 3 y "sin nivel asignado"). Notas que solo viven acá:

- **Leyes:** una ley es una regla nueva que cambia algo, y algunos NPCs podrían desobedecerla. Se considera muy complejo para la primera versión. Va junto con la **división de poderes**.
- **Comunicado oficial:** que el gobernador hable directamente a la comunidad, probablemente a través de un medio (por definir: no hay medio estatal).
- **Que la IA pueda proponer a quién se le ofrecen las acciones** (hoy lo decide el juego), como opción para modelos más capaces.
- **Subsidios a servicios**, por ejemplo alimento a precio reducido.
- **Decisiones puntuales del gobernador** (cuarentena, toque de queda, obra pública), a evaluar.
- **Pensamiento del NPC en foco:** al seleccionar un NPC, el modelo generativo escribe lo que piensa (con caché). Fuera de la v1.
- **Textos de acciones personalizados por NPC**, generados por el modelo generativo. Fuera de la v1.

## 11. Pendiente para después

- Primero se hace un prototipo en TypeScript para validar la idea. El motor final queda por decidir. La UI final es en Godot y el contrato entre UI y motor es independiente del lenguaje (UI §11), así que decidir dónde vive el motor no cambia la UI.
- **IA opcional (decidido):** el juego funciona completo sin IA. Si el usuario la activa, elige los modelos (clasificador y generativo, locales o por API). El juego se diseña y se balancea sin IA, con el director mecánico, y la IA se prueba como mejora. Si el modelo falla o tarda, el juego sigue con el motor y las plantillas. Queda por definir si la IA viene activada o apagada por defecto.
- Otras decisiones técnicas (arquitectura, costos, latencia, memoria de NPCs, implementación del tiempo real y la aceleración, guardado y reanudación de partidas largas).

## 12. Cómo se alteran los NPCs (decidido a nivel idea)

- El caos funciona **de forma continua, sin IA y sin bloquear nunca el juego.**
- **Cuenta lo que pasa:** la prensa escribe las columnas, a cargo de NPCs con rol de periodista. El motor arma la noticia a partir de datos (tema, tono, alcance y hechos). El texto sale de plantillas o, si la IA opcional está activa, de un modelo generativo. El texto es decorativo y nunca maneja la simulación.
- **Altera lo que hacen los NPCs:** el director de caos elige acciones de una gran tabla predefinida (cavar un pozo, predicar, acaparar comida, abandonar el trabajo, organizar una fiesta). El juego le ofrece un conjunto acotado de candidatas válidas para cada NPC y el director elige una por afinidad y azar o, si la IA opcional está activa, con un modelo clasificador que da probabilidades y de las que el motor sortea. Cada acción es un disfraz (texto y animación) más efectos con sentido tomados de un catálogo cerrado: lo que cambia las estadísticas son los efectos, no el disfraz. Las acciones pueden contagiarse a NPCs de la misma zona con la misma mecánica que las plagas (ESTADOS §7.2).
- **El caos puede golpear la producción.** Un NPC que abandona su puesto deja de producir, y su acción puede tener efectos sociales. Todo está relacionado con todo.
- **Límites:** el juego controla cuánto caos entra (cantidad por período, duraciones finitas, tope de gente fuera de su puesto, respiro cuando la comunidad está al borde del colapso). Si el caos se detiene, la comunidad se recupera sola.
- **Consecuencias del gobernador, fuera del caos:** impago, hambre y miseria tienen efectos mecánicos que no dependen de la IA. Las acciones que los expresan (huelga, protesta, saqueo): el motor decide si pasan y cuánto, y elige cómo se expresan (el clasificador opcional puede elegirlo). Duración finita y fuera de los límites del caos. Así el jugador responde a la comunidad (pilar 3) y ningún modelo puede anular una consecuencia ganada.
- **Lo que ve el jugador:** noticias y hechos de la comunidad, no "la IA hizo X".
- **Se afina probando.** Los valores de balance se ajustan con partidas de prueba, con y sin IA.

## 13. Documentos

Ya escritos: **ESTADOS.md** (estados y reglas), **GOBERNADOR.md** (palancas), **UI.md** (interfaz final en Godot), **HOJA_DE_RUTA.md** (niveles del juego) y **CALIBRACION.md** (valores, criterios de arranque y plan de pruebas; lo maneja el agente de prototipo), más el informe de calibración de cada escenario.

Próximos:

1. **Doc del director y la prensa:** variantes de texto de las acciones, plantillas de noticias, contrato del clasificador y del generativo, y plan de pruebas con y sin IA. La tabla de acciones, los medios y el director ya están en ESTADOS §6, §7 y §9.