# UI final (v2.0)

> La interfaz final en Godot, en 3D. Incluye todo lo de la UI 2D del prototipo (UI_PROTOTIPO.md) y le suma el mundo en 3D. Lo que se puede leer y mover: CONTROLES.md. Qué ve el jugador: GOBERNADOR §5. Todo lo marcado **[propuesta]** se ajusta viendo la UI construida.

---

## 1. Base

- Steam, Godot 4 con C#, 3D low-poly, cámara libre. Mouse y teclado.
- Referencias: RollerCoaster Tycoon (gestión con ventanas), Project Zomboid (atmósfera y ficha del personaje), Frostpunk (medidores claros y presión que se siente).
- El rendimiento es la prioridad y se adapta a la PC del usuario.
- La UI nunca frena la simulación ni contiene lógica de juego. Muestra hechos y noticias, nunca "la IA hizo X".
- **El mapa es la interfaz principal:** la simulación se entiende de un vistazo y casi todo se hace con un clic en el mundo. Las ventanas son para el detalle.
- **Pocos botones, un solo panel de selección, paleta corta y poco texto.**

## 2. Pantallas

1. Menú principal (nueva partida, cargar, opciones).
2. Escenario y panel de configuración (ESCENARIOS §1).
3. Partida.
4. Fin de partida, solo por derrota: resultado, línea de tiempo de los hechos principales y cadena de causas del final. Al llegar el plazo del objetivo sale un aviso (cumplido o perdido) con un resumen y se sigue jugando.

## 3. Pantalla de partida

De atrás hacia adelante:

1. **Mundo 3D** (sección 12).
2. **Barra superior:**

| Elemento | Qué muestra |
|---|---|
| **Apoyo** | `apoyo_pct` con la meta marcada en la barra; verde sobre la meta, amarillo cerca, rojo lejos. En zombies, **Población** con meta y límite de derrota |
| **Caja** | La reserva en semanas de gasto; rojo con menos de 2 |
| **Objetivo** | Días al plazo |
| **Línea de tiempo** | Lo que viene: próximo día de pago, avisos de clima, plazos de demandas, fecha del objetivo |
| **Reloj** | Día, hora del día, pausa y velocidades; estado de la IA si está activa |

   Después de cada decisión, el cambio flota sobre el medidor (+3, −$200) con una flecha de tendencia.
3. **Barra inferior:** palancas en tres grupos (finanzas, obras, alimento), capas del mapa y accesos a ventanas.
4. **Panel lateral único:** lo seleccionado (parcela, edificio, NPC, zona), las demandas abiertas y las noticias del día.
5. **Tarjetas que no pausan,** en una esquina: demandas nuevas, avisos de clima, inauguraciones, resumen de cada día de pago (ingresos, gastos, cambio de apoyo y 3 hechos principales) y balance cada 30 días (apoyo frente a la meta y los 3 factores que más lo mueven). Las alertas menores se agrupan en el resumen.
6. **Ventanas** de detalle **[propuesta: gestor central que recuerda posición]**: economía (empresas, precio, despensas), finanzas del estado, comunidad (por zona y grupo), prensa (noticias y medios), historial (las seis series y el registro de hechos con filtro), clima y objetivo.

**Palancas:** cada una muestra antes de confirmar su valor, sus opciones, su costo por período y a quién afecta. Se pueden operar en pausa.

## 4. Interacción con el mundo

| Clic en | Qué pasa |
|---|---|
| **Parcela libre** | Menú de construcción: edificios disponibles con costo, días de obra y mantenimiento. Al pasar por cada opción se ilumina su área de efecto en el terreno |
| **Edificio** | Estado (activo, en obra, sin personal, lleno), personal, capacidad y demoler. La cámara lo enmarca |
| **NPC** | Ficha: una frase con el factor que más pesa en su ánimo ("No hay camas", "Me bajaron el sueldo"), rol, zona, ánimo, acción y "¿por qué?". Opción de seguirlo con la cámara |
| **Zona** | Resumen y necesidad principal |
| **Alerta o noticia** | La cámara va al lugar del hecho |

- **Cámara:** orbitar, inclinar, zoom y desplazar, entre "ver una persona" y "ver toda la ciudad", sin pasar el terreno ni el borde (límites en CALIBRACION). Atajos para saltar a cada zona.
- **Capas de lectura,** una a la vez y apagadas por defecto: ánimo, roles, acciones, defensa, orden, integridad y amenaza por zona, ocupación de hospitales y necesidades. Tiñen el terreno y los NPCs.
- **Lista filtrable de NPCs** para llegar a uno sin buscarlo.
- La frase del NPC y la necesidad de cada zona las calcula la UI solo para mostrar, a partir del estado; no tienen efecto. Cuando el motor se porte a Godot puede exponerlas él.

## 5. Información

- **Alertas:** hechos del motor, exactos, agrupados con aceleración. Llevan al hecho y a su causa. Nunca pausan.
- **Demandas:** tarjeta con el actor (retrato), lo que pide, lo que amenaza, el plazo y los botones aceptar o rechazar. Si vence, se toma como rechazo.
- **Hitos:** al cumplirse, las parcelas nuevas se iluminan y la cámara las muestra.
- **Noticias:** la versión de la prensa, con sesgo, que puede llegar después del hecho. Con medio, autor, tema, tono y alcance; plantilla o texto generado se ven igual.
- **"¿Por qué pasó esto?":** desde una alerta, noticia o NPC, una línea de hasta 5 pasos clicables armada por el motor. Si empezó en una decisión del jugador, termina en ella.

## 6. El mundo vivo

El motor entrega zonas, parcelas, indicadores y eventos; la vista decide coordenadas, rutas y aspecto.

1. La vista es solo de lectura: función del estado, la semilla, el día y los eventos.
2. El estado persistente (edificios, obras, daños) se reconcilia con el estado, así que funciona igual al cargar o acelerar. Los eventos transitorios se animan; si se pierden, el estado final se corrige igual.
3. Cada parcela tiene un lugar fijo en el terreno; lo que pasa en una parcela se ve ahí.
4. La vista no inventa eventos con efecto: toda muerte visible es un evento de muerte.
5. Todo evento se representa: en el mundo o, si no se ve, en el registro de hechos.
6. El mapa respeta las zonas y su vecindad. Lo que el motor ubica en una zona se muestra ahí; lo que no, se coloca sin sugerir que el lugar importa.
7. Si algo se promueve a entidad del motor (MOTOR §5), solo cambia de dónde sale el dato.

## 7. Retroalimentación

Lo que anda bien o mal se siente, no solo se lee, por tres canales: datos exactos, el mundo y la prensa. Todo estímulo sale de un estado o evento del motor, es proporcional al hecho y nunca bloquea.

- **Después de cada decisión:** se resaltan los NPCs o la zona afectados y aparecen burbujas de ánimo según cómo cambia su satisfacción en los días siguientes.
- **Ánimo de la ciudad a la vista:** zonas descontentas con menos gente en la calle, carteles y grupos reunidos; zonas contentas con más movimiento y luces.
- **Sonido:** ambiente por zona (mercado, obra, calle vacía), música que cambia con la tensión, y sonidos cortos para decisión confirmada, demanda, aviso, inauguración, protesta y ataque. Volúmenes separados.

## 8. Rendimiento

- El cuello de botella es dibujar y mover NPCs. 100 NPCs de arranque, techo de 1.000.
- 6 GB de VRAM entre render e IA, con topes fijos (MOTOR §4).
- Tres perfiles (bajo, medio, alto) con detección automática; cada uno fija cuántos NPCs con modelo completo, la distancia de cambio de detalle, sombras y la calidad del clima. La detección nunca activa la IA.
- NPCs genéricos con instancias agrupadas (`MultiMeshInstance3D`) y animación por vértices, sin un nodo con script por NPC. Modelo completo solo para los interesantes (en foco, con acción, muy descontentos, periodistas).
- Detalle por distancia, solo se dibuja lo que entra en cámara, comunidad agregada por zona a distancia y sin cálculo de caminos fuera de cámara.

## 9. Frontera con el motor

- La UI **lee** el estado (CONTROLES §4 y §5) y **envía comandos**: palancas, órdenes de obra, respuestas a demandas, NPC en foco, pausa y velocidad, partida nueva (preset, configuración, semilla), guardar y cargar, opciones de IA y depuración.
- El contrato es independiente del lenguaje: cambiar dónde vive el motor no cambia la UI.
- **Fase 1 (ahora):** el motor TypeScript del prototipo corre como proceso local aparte y Godot se conecta por websocket. Al abrir el juego, Godot lanza el proceso; al cerrarlo, lo termina. El motor manda el estado de cada día y los eventos; Godot manda los comandos. Así el motor probado y calibrado sigue siendo la única fuente de verdad mientras las reglas cambien.
- **Fase 2 (cuando las reglas se estabilicen):** el motor se porta a C# dentro de Godot, como módulo sin dependencias de escenas. El port se valida con partidas grabadas del motor TS: misma semilla, mismos resultados.
- **Partidas grabadas:** el motor puede exportar el estado diario y los eventos de una partida, y Godot reproducirla sin motor. Sirve para probar la vista y el rendimiento con 1.000 NPCs.
- Mundo 3D, ventanas y HUD leen la misma fuente.

## 10. Opciones y desarrollo

- **Opciones:** calidad gráfica, controles de cámara, volúmenes e IA opcional (activar y elegir modelos; viene apagada).
- **Guardado:** uno manual y un autoguardado por partida, cargados desde el menú (MOTOR §3).
- **Modo desarrollador** (oculto): FPS y tiempos de simulación, velocidades altas, forzar fenómenos y demandas, cambiar la cantidad de NPCs, elegir nivel de mundo y de gobernador (MUNDO §12, GOBERNADOR §7), ver valores crudos y exportar métricas de la partida (tiempo entre decisiones, decisiones por tipo, cambio de apoyo y caja después de cada una).

## 11. Fuera de esta UI y para después

- **Fuera:** idiomas adicionales, tutorial, gamepad y Steam Deck (nivel 3) y accesibilidad con paleta alternativa (sin nivel).
- **Para después:** estilo final de ventanas e íconos, presentación de la prensa como portada, animaciones de la interfaz y atajos de teclado completos.

## 12. El mundo en 3D

| Elemento | Cómo se ve |
|---|---|
| **Terreno** | Una isla o valle low-poly dividido en las zonas del mundo, contiguas según su vecindad, con un borde natural (agua, montaña). Cada zona con su carácter (campos en la periferia, comercios y edificios públicos en el centro) |
| **Parcelas** | Terrenos marcados: libres (cerco o estacas), en obra (andamios que crecen día a día), ocupadas (el edificio), bloqueadas (vegetación o cerco con candado y su hito) |
| **Edificios** | Un modelo por tipo del catálogo (EDIFICIOS.md), con su estado visible: luces y movimiento si está activo, cerrado sin personal, cola en la puerta si está lleno, humo o grietas si la zona tiene daño |
| **Casas** | Decorativas, repartidas por las zonas según cuántos NPCs viven ahí; sirven de punto de partida de la rutina |
| **NPCs** | Personas low-poly con color o prenda según su rol. Siguen su rutina (casa, trabajo, compras), hacen sus acciones (cavar un pozo, predicar, marchar a una protesta) y se ven distinto si están internados, enfermos o fuera de su puesto |
| **Íconos** | Sobre edificios y zonas: hospital lleno, sin personal, comida agotada, necesidad principal de la zona |
| **Día y noche** | Ciclo según la hora del día del motor: de noche se encienden las luces y la gente vuelve a sus casas |
| **Clima** | Sequía (tierra seca, cultivos amarillos), plaga (cultivos manchados), pandemia (barbijos, calles vacías), plaga zombie (niebla desde la zona de origen) |
| **Eventos** | Ataques zombie que vienen desde su zona de origen y chocan con la defensa (murallas, policías), protestas que marchan al centro, obras que terminan con una inauguración, saqueos en el mercado |

## 13. Arte y Blender

- **Blender** se instala aparte (gratis). Se usa para modelar edificios, personas, terreno y props low-poly, y exportar a glTF (`.glb`), que Godot importa directo.
- El agente puede generar modelos simples por script con Blender en modo consola (`blender --background --python`), sin abrir la interfaz.
- **Para arrancar rápido:** paquetes gratuitos de dominio público (Kenney, Quaternius) como reemplazo temporal; después se cambian por arte propio sin tocar la lógica.
- **Reglas de arte:** una paleta compartida en una sola textura chica para todos los modelos; pocos polígonos; un nivel de detalle lejano por modelo; personas con animación simple (caminar, trabajar, protestar) apta para instancias agrupadas.
