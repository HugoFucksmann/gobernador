# Juego de gobernador con comunidad de NPCs con IA (título provisorio)

> Estado del documento: idea en definición. El detalle del gobernador está en GOBERNADOR.md. El detalle técnico (estados, tabla de acciones, medios) vive en ESTADOS.md.

---

## 1. Pitch

Una simulación de comunidad donde cada habitante es un NPC independiente con personalidad propia. El jugador es el **gobernador**: gestiona las condiciones de la comunidad, no a las personas directamente. Una **IA trabaja todo el tiempo** dando voz a la comunidad (a través de la prensa y de los propios NPCs) y alterando lo que los NPCs hacen, para que hagan cosas diversas, raras y divertidas.

## 2. Corazón del juego

La tensión entre **el orden que intenta imponer el gobernador** y **el caos creativo que introduce la IA**. No se trata de optimizar una colonia, sino de gobernar gente impredecible.

## 3. Pilares

1. **Simulación mecánica y barata.** Cada NPC tiene un estado propio (personalidad, rasgos únicos). La comunidad no tiene un estado propio: se deriva de los NPCs. El día a día corre con reglas, sin IA, para optimizar su uso.
2. **IA siempre trabajando, con límites.** Un modelo local, en una sola instancia, produce de forma continua texto y decisiones pequeñas: escribe lo que dicen los NPCs y la prensa, y elige qué hacen los NPCs entre un conjunto acotado de acciones. El modelo aporta texto y elección; las reglas, la magnitud de los efectos y cuánto caos entra los controla el juego. Un modelo mejor mejora lo que se ve, no cambia las reglas.
3. **Gobernador que interviene.** Influye sobre la comunidad y sus estadísticas sin mandar directamente a cada NPC. El jugador no responde a lo que hace la IA, responde a la comunidad: la IA altera la comunidad.
4. **Sucesos generales.** Dependen del mundo. Por ejemplo, los fenómenos naturales (sequías, plagas, pandemias) alteran los recursos y a los NPCs, y afectan a la comunidad y a sus estadísticas, condicionando la gestión del gobernador.
5. **Economía de la comunidad.** Los NPCs trabajan, ganan y gastan. Cada grupo vive distinto y la desigualdad genera descontento. El alimento lo producen y comercian los habitantes, y el estado tiene que garantizar que todos coman.
6. **Prensa.** Los medios cuentan lo que pasa en la comunidad, influyen en el humor social y en lo que los NPCs saben. Es la forma en que el jugador ve lo que la IA y la comunidad hacen, y una herramienta más con la que el gobernador tiene que lidiar.
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
- **La economía la mueven los NPCs:** cada uno gana y gasta su propio dinero. El gobierno recauda impuestos y administra los fondos. El alimento lo produce y comercia la sociedad, y el estado lo regula (en la capa más simple, el alimento es un almacén común del estado; desde la capa individual es un stock de mercado y los comerciantes ganan según lo que se vende).

El diseño detallado de los estados está en ESTADOS.md (en borrador).

## 5. Escenarios y panel de configuración

Antes de arrancar una partida hay un **panel de configuración del mundo**, donde se le asigna una **historia** y un **objetivo**.

- **Primera versión:** cada escenario viene **pre-configurado** (historia, objetivo y mundo ya armados), y el panel permite **modificar varias cosas**. Más adelante se podrán sumar más opciones de configuración.
- **Configurable desde el panel (decidido):**
  - La **prensa**: un único medio (monopolio) o varios.
  - Los **límites del caos** de la IA. Los valores por defecto son los de balance, y cualquier cambio queda marcado como "configuración de prueba".
  - El **módulo de economía** (de simple a más compleja).
  - Otras opciones a definir.
- **Mundos iniciales (2):**
  - *Elecciones:* el objetivo es gobernar y ganar elecciones, manteniendo a la comunidad a gusto. En la v1 (capa simple) el dilema es dar subsidios contra cuidar la reserva, con el impago como límite. Más adelante, con la capa fiscal (etapa 3), si no hay fondos se puede emitir dinero y sube la inflación.
  - *Apocalipsis zombie:* el objetivo es que la comunidad sobreviva. Hay que administrar más seguridad (policía), con el riesgo de quedarse sin recursos para comida. Los NPCs pueden sumarse a la policía. La ciudadanía refuerza la defensa de la zona por donde vienen los zombies, si se entera a tiempo.
- **Orden de implementación:** primero *elecciones*, después *zombies*.
- **Escala:** mundos de **alrededor de 100 NPCs** para empezar. La cantidad es un parámetro del mundo. (Antes se pensaba en 20 a 30; se subió porque la simulación es barata y con más gente los roles y los porcentajes se vuelven más estables y significativos.)

### Escalabilidad

La primera versión es simple, pero se diseña desde el inicio para escalar a más mundos y objetivos.

### Alcance de la primera versión

- Cada escenario tiene **un objetivo y una condición de derrota**. Más de un objetivo queda para después.
- El objetivo debe soportar **ambos tipos de evaluación**: al final de un plazo (ej. elecciones) y en cualquier momento de la partida (ej. perder por una amenaza).
- **El objetivo y su progreso son visibles para el jugador** (decidido; detalle en ESTADOS §11).
- **Al generar el mundo, todo debe encajar para que inicialmente funcione, y después se desajusta.** Lo que lo desajusta es el clima (la plaga zombie cuenta como clima) y la IA, que altera a los NPCs.
- La **historia de cada escenario se escribe a mano** (son presets).
- **Economía por capas:** se construye de lo simple a lo complejo (recursos comunes del estado, después ingresos individuales, después déficit e inflación) y se elige en el panel. La primera versión empieza por la capa más simple.
- **Sin objetivo (solo historia):** no es un modo de la v1. Queda como prueba posterior.
- **Oposición de la comunidad:** en la v1 no hay rebelión ni golpe como mecánica explícita. El descontento se expresa a través del objetivo (por ejemplo votos en elecciones, bajas y colapso en zombies).

## 6. Núcleo común a todos los escenarios

El juego es gobernar, sin importar el mundo. Todos los escenarios comparten las mismas palancas, el mismo modelo de estados, la misma economía (con su módulo elegido), la misma IA y los mismos límites del caos.

Un escenario solo cambia datos: historia, objetivo y condición de derrota, fenómenos del clima, valores iniciales (población, roles, reserva, stock), módulo de economía y límites del caos. La palanca crítica sale de la situación, no de una mecánica propia del mundo.

Los mundos no agregan mecánicas ni palancas exclusivas. Si un escenario necesita algo nuevo, o se expresa con los datos existentes (clima, roles, acciones, objetivo) o se incorpora al núcleo para todos.

Decisión: cerrado.

## 7. El gobernador (referencia)

> El detalle está en **GOBERNADOR.md**. Acá queda solo la idea.

- El gobernador actúa como un **gobernador real**: administra el estado, redistribuye recursos y evalúa complejidad.
- En la primera versión hay **un único gobernante, el usuario, sin división de poderes**.
- **La comunidad genera la riqueza** (los NPCs trabajan y ganan) y **el gobierno recauda y administra los fondos.**
- **La mecánica del juego son las palancas que el gobernador tiene.** Cada palanca tiene consecuencias y trade-offs. Ejemplos rápidos:
  - Zombies: invertir más en seguridad/policía, pero te podés quedar sin recursos para comida.
  - Elecciones: dar subsidios, pero la reserva se agota y llega el impago (v1, capa simple). Desde la capa fiscal (etapa 3), además, se puede emitir dinero y sube la inflación.
- **Áreas de acción (idea):** recaudación (impuestos distintos por sector), gasto (presupuesto de salud, seguridad, infraestructura y educación; empleados públicos con el mismo salario y cupos por rol), subsidios a grupos de roles, garantía alimentaria y comercio exterior de alimento, finanzas (déficit y emisión, con inflación) y prensa. Las palancas concretas están en GOBERNADOR.md.
- **Prensa como palanca (decidido):** el gobernador actúa sobre la prensa solo de forma **indirecta** (en la v1, financiar y regular; presionar y dar o quitar acceso, en la v1.1). Nunca escribe la noticia. Cada opción tiene costos (presupuesto, descontento por censura, pérdida de credibilidad si se nota la propaganda).
- **Detalle en GOBERNADOR.md (borrador):** qué palancas tiene, qué recursos puede administrar, cómo los administra y cuáles son las consecuencias.
- **Sancionar leyes:** queda como **idea a futuro** (ver sección 10).

## 8. Estados internos del juego

El detalle está en ESTADOS.md. Toda consecuencia (de una acción de un NPC, un rumor, el clima, una noticia o una palanca) se expresa de la misma forma y deja registrado su origen, para poder entender y afinar el juego.

## 9. Tiempo y visualización

- **Tiempo real**, con reloj **del juego** (no el reloj real). Escala base: 1 día de juego = 20 s reales (parámetro, se afina con pruebas).
- Hay **pausa** y **aceleración baja** por ahora (x1 y x2): a más velocidad la IA no alcanza a producir contenido.
- **Aceleración (decidido):** si se acelera, acelera la simulación; la IA sigue a su propio ritmo y sus resultados se incorporan cuando están listos. La IA nunca frena el juego.
- **Duración de la partida:** no tiene un largo fijo. Puede durar horas o días reales según cómo se gobierne, o terminar enseguida por derrota (se evalúa en cualquier momento) o por límites de configuración altos. El plazo del objetivo es un dato del escenario, en días de juego.
- **Mapa con NPCs visibles:** la UI muestra a los NPCs y todo lo que pasa. Dibuja lo que el motor decidió (qué, cuándo y en qué zona) y coreografía el cómo; no inventa eventos con efecto. El contrato está en ESTADOS §14.
- El cómo se implementa todo esto se discute más adelante.

## 10. Ideas a futuro

- **Leyes:** una ley es una regla nueva que cambia algo, y algunos NPCs podrían desobedecerla. Se considera muy complejo para la primera versión.
- **División de poderes.**
- Modo sin objetivo (solo historia) como prueba posterior.
- Escenarios con más de un objetivo.
- Más opciones de configuración en el panel de mundos.
- Mundos más grandes (más de 100 NPCs).
- **Comunicado oficial:** que el gobernador hable directamente a la comunidad, probablemente a través de un medio (por definir: no hay medio estatal).
- **Que la IA pueda proponer a quién se le ofrecen las acciones** (hoy lo decide el juego), como opción para modelos más capaces.
- Más voces de NPCs y más medios activos a la vez cuando el modelo lo permita.
- Acciones y contenido ampliables por la comunidad (mods).
- Nacimientos y muerte por vejez.
- Reserva estratégica de alimento del estado y control de precios.
- Decisiones puntuales del gobernador (cuarentena, toque de queda, obra pública), a evaluar.
- Flujos de dinero entre NPCs (quién le paga a quién).
- Subsidios a servicios (por ejemplo, alimento a precio reducido).
- Zombis como agentes y estructuras con vida propia (promovidos desde las zonas).

## 11. Pendiente para después

- Primero se hace un prototipo en TypeScript para validar la idea. El motor final queda por decidir.
- **Modelo local como requisito mínimo (decidido):** el juego exige un modelo local mínimo para funcionar. El usuario después puede elegir el modelo que quiera, incluso uno de frontera. El juego se diseña y se balancea para el más chico que funcione, y se define con pruebas. Si el modelo falla o tarda, el juego sigue con textos de plantilla y el motor cubre las decisiones.
- Otras decisiones técnicas (arquitectura, costos, latencia, memoria de NPCs, implementación del tiempo real y la aceleración, guardado y reanudación de partidas largas).

## 12. Cómo altera la IA a los NPCs (decidido a nivel idea)

- La IA trabaja **de forma continua**, sin bloquear nunca el juego.
- **Cuenta lo que pasa:** escribe las columnas de la prensa, que están a cargo de NPCs con rol de periodista (el mismo hecho se cuenta distinto según la personalidad de quien escribe), y genera pensamientos o frases del NPC que el jugador está mirando.
- **Altera lo que hacen los NPCs:** elige acciones de una gran tabla (cavar un pozo, predicar, acaparar comida, abandonar el trabajo, organizar una fiesta). El juego le ofrece un conjunto acotado de candidatas válidas para cada NPC y la IA elige una y la cuenta. Las acciones pueden contagiarse a NPCs de la misma zona.
- **El caos puede golpear la producción.** Un NPC que abandona su puesto deja de producir, y su acción puede tener efectos sociales. Todo está relacionado con todo.
- **Límites:** el juego controla cuánto caos entra (cantidad por período, duraciones finitas, tope de gente fuera de su puesto, respiro cuando la comunidad está al borde del colapso). Si el caos se detiene, la comunidad se recupera sola.
- **Consecuencias del gobernador, fuera del caos:** impago, hambre y miseria tienen efectos mecánicos que no dependen de la IA. Las acciones que los expresan (huelga, protesta, saqueo): el motor decide si pasan y cuánto, la IA elige cómo se expresan y las cuenta, y si falla el motor las cubre. Duración finita y fuera de los límites del caos. Así el jugador responde a la comunidad (pilar 3) y un modelo chico no puede anular una consecuencia ganada.
- **Lo que ve el jugador:** noticias y hechos de la comunidad, no "la IA hizo X".
- **Se afina probando.** Los valores de balance se ajustan con partidas de prueba.

## 13. Próximos documentos

1. **Doc del gobernador** (GOBERNADOR.md, en borrador): palancas y consecuencias, incluidas las de prensa.
2. **Doc de la IA y la prensa:** prompts y plan de pruebas con modelos chicos. Las tareas del modelo, la tabla de acciones y los medios ya están en ESTADOS §6, §7 y §9.
