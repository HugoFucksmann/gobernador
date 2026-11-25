# UI del juego: estructura (BORRADOR v0.16)

> Solo la estructura de la interfaz final en Godot (nivel 2, HOJA_DE_RUTA). La UI de depuración del motor (nivel 1) es del prototipo y no se define acá. Los detalles (colores, tooltips, leyendas, estilo de ventanas) se definen después. Palancas: GOBERNADOR.md. Estados y reglas: ESTADOS.md. Idea general: IDEA_JUEGO.md. **[decidido]** lo fijó el autor; **[propuesta]** es base para pulir.

---

## 1. Decisiones de partida

- **[decidido]** Steam, UI final en Godot, 3D low-poly, cámara libre (orbitar, inclinar, zoom, desplazar).
- **[decidido]** Referencias de UI: RollerCoaster Tycoon (gestión con ventanas) y Project Zomboid (ficha centrada en el personaje y atmósfera).
- **[decidido]** El rendimiento es la prioridad, y debe adaptarse a la PC del usuario.
- **[decidido]** El motor va antes que el arte: se construye y prueba en TypeScript con su propia UI de depuración. Dónde vive el motor del juego final queda por decidir (IDEA §11).
- **[decidido]** Esta UI cubre todo lo que tiene el motor al llegar al nivel 2 (niveles 1 y 1.1). El contrato con el motor (sección 11) no cambia entre niveles.

## 2. Principios

- La simulación (datos) está separada de lo que se dibuja, y la UI nunca la frena (IDEA §9).
- El jugador responde a la comunidad, no a la IA: la UI muestra noticias y hechos, nunca "la IA hizo X" (IDEA §12).
- Todo hecho importante puede explicarse: desde una noticia, alerta o NPC se llega a su causa (`origen` y `causa`, ESTADOS §8).
- La información se distingue en tres niveles de confianza: exacta, resumida y con sesgo (GOBERNADOR §7).
- Lo que no aplica a la economía activa se oculta (GOBERNADOR §4).

## 3. Flujo de pantallas

1. Menú principal.
2. Selección de escenario y panel de configuración del mundo (IDEA §5, sección 15).
3. Partida.
4. Fin de partida, solo por derrota: un resumen con el resultado, la línea de tiempo de los hechos principales y la cadena de causas de lo que decidió el final (evento `fin_partida`, ESTADOS §14). Al llegar el plazo del objetivo no termina la partida, se cumpla o no: sale un aviso (objetivo cumplido u objetivo perdido) con un resumen corto y se puede seguir en el mundo.

## 4. Estructura de la pantalla de partida

Cuatro capas, de atrás hacia adelante:

1. **Mundo 3D** con los NPCs y el clima visibles.
2. **HUD fijo:**
   - Barra superior: datos siempre exactos (reserva, ingresos, gastos, saldo, inflación, días de stock y avisos de fenómenos con su zona de origen), el objetivo con su progreso siempre visible (ESTADOS §11), reloj, pausa y velocidad.
   - Barra inferior: accesos a ventanas y selector de capas de lectura del mapa.
   - Zona de alertas.
3. **Panel lateral:** alterna entre noticias y ficha del NPC. Es la vista rápida: la ventana correspondiente es la misma vista, desprendible (sección 5).
4. **Ventanas flotantes** de gestión.

## 5. Sistema de ventanas

- **[propuesta]** Un gestor central abre, cierra, mueve y apila ventanas. Recuerda posición y estado, y permite varias abiertas a la vez.
- **[decidido]** Ventanas:
  - Palancas (las 10 de GOBERNADOR §3) en tres grupos: finanzas (impuesto, salario público, ayuda social, prensa), servicios (seguridad, salud, obras, con su nivel de 0 a 5) y alimento (garantía, precio máximo, comercio exterior). Las del nivel 1.1 (`tope_emision`, `presion` y `acceso`, GOBERNADOR §9) se suman a estos grupos; su ubicación se define al cerrarlas.
  - Economía: las empresas (ganancia, sueldos y respuesta vigente, ESTADOS §4), el precio de la comida y las despensas en resumen.
  - Gobierno y finanzas.
  - Comunidad (resumen derivado).
  - Ficha del NPC (la misma vista del panel lateral, desprendible).
  - Prensa: noticias (la misma vista del panel lateral, desprendible) y estado de los medios (alcance, credibilidad, dependencia).
  - Historial: gráficos de línea de las 6 series del motor (reserva, inflación, satisfacción media, hambre crítica, apoyo y población) y registro de hechos con filtro. Las series las guarda el motor y la ventana solo las lee (ESTADOS §10).
  - Clima.
  - Objetivo, con progreso claro y condición de derrota (el HUD lo muestra siempre en resumen). Al llegar el plazo queda marcado como cumplido o perdido (pendiente, cumplido, perdido).
- Toda palanca muestra su valor, sus opciones (nivel, modo o escalón), sus efectos y su costo por período antes de confirmar, y los días que faltan para la próxima liquidación (GOBERNADOR §4, §5 y §7).

## 6. Interacción con el mundo

- **[decidido]** Cámara libre con límites: la altura va entre "ver una persona" y "ver todo el mundo", sin pasar por debajo del terreno ni salir del borde del mundo. La inclinación también es acotada. Los valores exactos están en CALIBRACION.md.
- Selección de NPC o zona con un clic. La selección abre su ficha o resumen.
- Los resúmenes y las capas de lectura a distancia se agrupan por zona.
- Capas de lectura sobre el mapa para ver estados de la comunidad. **[decidido]** Capas: variables del NPC, roles, acciones activas, defensa por zona, orden por zona, integridad por zona, amenaza percibida por zona y hospital (ocupación, ESTADOS §10). El hospital está en el `centro`, así que esa capa muestra un solo valor y no un reparto por zona. **[propuesta]** Una a la vez, apagadas por defecto.
- Las alertas pueden centrar la cámara en el hecho.
- Lista filtrable de NPCs fuera del mapa, para llegar a uno sin buscarlo.

## 7. Control del tiempo

- Velocidades y escala de tiempo: ESTADOS §5. Acelerar acelera la simulación, no la IA (IDEA §9).
- **[decidido]** El motor es dueño del reloj: la UI pide pausar, reanudar y cambiar la velocidad, e interpola entre sus ticks (ESTADOS §5, sección 11).
- **[decidido]** Nada pausa el juego salvo el usuario. Ninguna alerta ni evento frena la simulación.
- **[decidido]** Se puede mirar y operar palancas en pausa. Cuándo rige un cambio de palanca: GOBERNADOR §4.

## 8. Flujo de información

- **Alertas:** avisos de hechos del motor, siempre exactos. Con aceleración se agrupan. Cada una permite ir al hecho y ver su causa. Nunca pausan el juego.
- **Noticias:** la voz de la prensa, con sesgo, separada de las alertas: las alertas son hechos del motor y las noticias su versión, que puede llegar después. Cada noticia llega con medio, autor, tema, tono y alcance (ESTADOS §6). El texto puede ser de plantilla o generado (si la IA opcional está activa) y la UI los muestra igual.
- **Capas del mapa:** lectura espacial de la comunidad.
- **"¿Por qué pasó esto?" [decidido]:** desde cualquier alerta, noticia o NPC se abre una línea de hasta 5 pasos clicables. La arma el motor siguiendo `causa` hacia atrás (ESTADOS §8), y la UI solo la muestra. Ejemplo: sequía → precio sube → más gente sin plata → hambre → protesta. Si el origen fue una decisión del jugador, la cadena termina en el cambio de palanca (evento `palanca`). Cada paso abre su detalle.
- **Eventos colectivos** (ej. protesta): el motor decide quiénes participan, desde cuándo actúa el efecto y la zona de destino (ESTADOS §7). El movimiento de los NPCs hacia esa zona solo lo muestra la vista, sin cambiar el resultado. Los que se suman por contagio llegan como `accion_inicio` con origen `contagio` (ESTADOS §7.2) y la vista los anima como un grupo que se suma.

## 9. El mundo vivo

Cómo se ven los ataques zombie, las obras y la destrucción. El motor conoce el espacio solo por zonas (ESTADOS §14). Las coordenadas, el movimiento y los dibujos son de la vista.

- **[decidido]** Visualización derivada: el motor entrega cantidades, indicadores y eventos (con día, zona, actores y causa), y la vista decide cómo se ven.
- **Estado persistente** (edificios, defensas, daños): la vista lo reconcilia con el estado, así que funciona igual al cargar una partida o acelerar el tiempo.
- **Eventos transitorios** (ataque, derrumbe, protesta): la vista los anima. Si se pierden (cámara lejos, tiempo acelerado), el estado final se corrige igual.
- **[decidido] El mapa está dividido en las zonas del mundo** (4 a 6) y respeta su vecindad: dos zonas vecinas son físicamente contiguas. El grafo de cada mundo tiene que poder dibujarse sin cruces (ESTADOS §14). Un mundo de una sola zona (solo de pruebas) no muestra división.
- **Qué decide el motor:** la zona de cada NPC, de dónde viene una amenaza y dónde está la defensa.
- **Qué decide la vista:** coordenadas, rutas y posiciones dentro de la zona (con semilla fija) y el aspecto de todo.
- **[decidido] Reglas:**
  1. La vista es solo de lectura: es función del estado del motor, la semilla del mundo, el día y los eventos.
  2. Slots ordenados por semilla dentro de cada zona: la estructura n siempre ocupa el slot n. Si un indicador sube, se agrega una y las anteriores no se mueven.
  3. La vista no inventa eventos con efecto. Toda muerte visible corresponde a un evento de muerte.
  4. Todo evento del motor tiene representación: en el mundo o, si no se puede ver (cámara lejos, aceleración), en el registro de hechos y en el estado final.
  5. La zona sí importa: las defensas, los avisos con su zona de origen y los ataques se muestran en su zona y desde su zona de origen. Lo que el motor no ubica en una zona (como la infraestructura general) se coloca sin sugerir que importa dónde está.
  6. El contrato es el indicador (`seguridad`, `infraestructura` y la `integridad` de cada zona: más daño, estructuras más rotas). Si algo pasa a entidad del motor, solo cambia de dónde sale ese número.
  7. Promoción por necesidad: zombis como agentes, estructuras con vida propia, coordenadas y combate se promueven desde las zonas cuando una regla dependa de ellos (HOJA_DE_RUTA §4 a §6).

## 10. Retroalimentación

- **[decidido]** La UI da estímulos visuales y sonoros para que gobernar sea entretenido: lo que anda bien o mal se siente, no solo se lee.
- Tres canales que se refuerzan: los datos exactos (barra superior, historial, alertas), el mundo (lo que se ve y se oye) y la prensa (la versión con sesgo, que da la temperatura social y reacciona a las decisiones del gobernador).
- **[decidido]** Reglas: todo estímulo está respaldado por un estado o evento del motor (sección 9, regla 3), es proporcional al hecho y nunca bloquea ni pausa el juego.
- El diseño concreto de los estímulos se define y ajusta viendo la UI construida.

## 11. Frontera entre UI y motor

- **[propuesta]** El motor no depende de ninguna escena ni de la UI.
- La UI solo **lee** el estado del motor (incluidas las series del historial, ESTADOS §10) y le **envía comandos**. No contiene lógica de juego. Los comandos son:
  - Palancas.
  - NPC en foco (el que el jugador selecciona). Queda reservado para el pensamiento generado a futuro (ESTADOS §9); en la v1 solo abre su ficha.
  - Pausar, reanudar y velocidad. El motor es dueño del reloj.
  - Partida nueva (preset, configuración y semilla).
  - Guardar y cargar.
  - Opciones de IA.
  - Depuración, solo en modo desarrollador (sección 16).
- El estado cambia por día de juego (ESTADOS §5). La vista interpola entre actualizaciones para que no haya saltos.
- **[decidido]** Este contrato (estado de lectura, eventos de ESTADOS §14, los comandos de arriba) es una interfaz independiente del lenguaje. Cualquier implementación del motor lo cumple igual, así que cambiar dónde vive el motor no cambia la UI.
- **[propuesta]** Mientras el motor existe solo en TypeScript, la UI de Godot se desarrolla reproduciendo partidas grabadas: el motor exporta el estado de cada día y los eventos, y Godot los reproduce. Así se construye y se prueba la UI (incluido el rendimiento con 1.000 NPCs) sin depender de dónde viva el motor final.
- El mundo 3D, las ventanas y el HUD leen la misma fuente de datos, así que todos muestran lo mismo.

## 12. Rendimiento y escala

- La simulación es barata. El cuello de botella es dibujar y mover NPCs.
- **[decidido]** Escala: arranque en 100 NPCs y techo de 1.000. Más escala se prueba después con mediciones reales.
- **[decidido]** Tope de recursos: entre la IA y el render no se pasa de 6 GB de VRAM en total. Se usan topes fijos, no control dinámico de la carga. La IA es opcional: apagada, el render usa todo el presupuesto; activa, el reparto lo fijan los modelos elegidos (ESTADOS §9).
- **[decidido]** Tres perfiles de calidad (bajo, medio, alto) con detección automática al primer arranque. Cada perfil fija solo tres cosas: cuántos NPCs se dibujan con modelo completo, la distancia a la que cambia el nivel de detalle y la calidad del clima. El usuario elige el perfil y no ve los valores internos. La detección solo elige el perfil gráfico: no sugiere ni activa la IA, que viene apagada y solo el usuario la prende desde las opciones (sección 13).
- **[propuesta]** No se muestran todos los NPCs con el mismo detalle:
  - Nivel de detalle por distancia a la cámara.
  - Solo se dibuja lo que entra en cámara.
  - Detalle completo solo para los NPCs "interesantes" (en foco, con una acción en curso, muy descontentos, periodistas).
  - A distancia, la comunidad se ve agregada por zona.
  - NPCs genéricos con instancias agrupadas, sin un nodo con script por NPC.
  - Los NPCs fuera de cámara no calculan caminos.

## 13. Opciones y guardado

- **[decidido]** Opciones: calidad gráfica (perfiles), controles de cámara, volumen e IA opcional: activarla y elegir los modelos (IDEA §11).
- **[decidido]** La IA viene apagada por defecto en el primer arranque (IDEA §11).
- **[decidido]** Con la IA activada, un indicador discreto en la barra superior muestra su estado: activa, lenta o sin respuesta (decide el motor y se usan plantillas). Con la IA apagada no se muestra.
- **[decidido]** Guardado: un guardado manual por partida y un autoguardado periódico. Se cargan desde el menú principal. El formato y la técnica están en ESTADOS §13: una foto completa del último día en un archivo versionado, escrita en segundo plano sin pausar el juego.

## 14. Entrada

- **[decidido]** Solo mouse y teclado. Gamepad y Steam Deck quedan para el nivel 3 (HOJA_DE_RUTA §5).
- Esto define el tamaño de los controles y el manejo de la cámara.

## 15. Panel de configuración del mundo

- **[decidido]** Se muestra antes de la partida, sobre un escenario preconfigurado (IDEA §5).
- **[decidido]** Cuatro grupos de opciones: prensa (un medio o varios), economía (base o con la extensión `fiscal`, cuando exista), límites del caos y escenario (elegir el preset; los umbrales del objetivo no se editan por ahora).
- **[decidido]** Todo valor distinto del preset se marca como "configuración de prueba".
- **[decidido]** La cantidad de NPCs la fija el preset (100) y no está en el panel del jugador: cambiarla desajusta el balance y el rendimiento. Solo se cambia en modo desarrollador (sección 16).

## 16. Herramientas de depuración

- **[decidido]** Modo desarrollador que se activa aparte y no aparece en el juego normal.
- **[decidido]** Incluye: contador de FPS y tiempos de simulación, velocidad muy alta, forzar fenómenos del clima y cambiar la cantidad de NPCs.
- Sirve para medir el rendimiento y evaluar los modelos de la IA opcional.

## 17. Fuera de esta UI

Idiomas adicionales, tutorial, gamepad y Steam Deck (nivel 3, HOJA_DE_RUTA §5) y accesibilidad, incluida una paleta alternativa (sin nivel asignado, HOJA_DE_RUTA §7).

## 18. Preguntas abiertas

Ninguna por ahora.

## 19. Detalle para más adelante

Niveles y estilo de las alertas, capas de lectura (colores, escala, leyendas), tooltips, estilo visual de ventanas, íconos, ambiente visual y sonoro, animaciones de la interfaz, cierre de período fiscal, presentación de la prensa (portada, credibilidad), sonido, atajos de teclado.