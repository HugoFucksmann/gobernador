# UI final (v1.0)

> Estructura de la interfaz final en Godot (nivel 2, HOJA_DE_RUTA). El prototipo usa un mapa 2D simple con la misma lógica de interacción (HOJA_DE_RUTA §2). Lo que se puede leer y mover: CONTROLES.md. Qué ve el jugador: GOBERNADOR §5. Detalles visuales (colores, tooltips, estilo) se definen después.

---

## 1. Base

- Steam, Godot, 3D low-poly, cámara libre (orbitar, inclinar, zoom, desplazar). Solo mouse y teclado.
- Referencias: RollerCoaster Tycoon (gestión con ventanas) y Project Zomboid (ficha del personaje y atmósfera).
- El rendimiento es la prioridad y se adapta a la PC del usuario.
- Cubre todo lo del motor hasta el nivel 2. El contrato con el motor (sección 9) no cambia entre niveles.
- La UI nunca frena la simulación ni contiene lógica de juego. Muestra hechos y noticias, nunca "la IA hizo X".
- **El mapa es la interfaz principal:** la simulación se entiende de un vistazo y casi todo se hace con un clic en el mapa. Las ventanas son para el detalle.

## 2. Pantallas

1. Menú principal (cargar partida incluido).
2. Escenario y panel de configuración (ESCENARIOS §1).
3. Partida.
4. Fin de partida, solo por derrota: resultado, línea de tiempo de los hechos principales y cadena de causas del final. Al llegar el plazo del objetivo sale un aviso (cumplido o perdido) con un resumen corto y se sigue jugando.

## 3. Pantalla de partida

De atrás hacia adelante:

1. **Mundo 3D** con los NPCs y el clima.
2. **HUD:**
   - Barra superior: reserva, ingresos, gastos, saldo, inflación, días de stock, avisos de clima con su zona, objetivo con su progreso, reloj, pausa y velocidad, y el estado de la IA si está activa (activa, lenta o sin respuesta).
   - Barra inferior: accesos a ventanas y selector de capas del mapa.
   - Zona de alertas.
3. **Panel lateral:** noticias, demandas abiertas (con su plazo y los botones aceptar o rechazar) o la ficha de lo seleccionado; cada una se puede desprender como ventana.
4. **Ventanas flotantes** **[propuesta: gestor central que recuerda posición y permite varias abiertas]**:
   - **Palancas:** finanzas (impuesto, salario público, ayuda social, prensa), obras (nivel de obras) y alimento (garantía, precio máximo, comercio exterior). Cada una muestra valor, opciones, efectos y costo antes de confirmar, y los días hasta el próximo día de pago. Se pueden operar en pausa.
   - **Economía:** empresas (factor, ganancia, empleados, vacantes), precio y despensas.
   - **Finanzas del estado.**
   - **Comunidad:** resúmenes por zona y por grupo.
   - **Prensa:** noticias y estado de los medios.
   - **Historial:** las seis series y el registro de hechos con filtro.
   - **Clima.**
   - **Objetivo:** progreso, derrota y estado (pendiente, cumplido, perdido).

## 4. Interacción con el mundo

- Cámara con límites: entre "ver una persona" y "ver todo el mundo", sin pasar el terreno ni el borde, con inclinación acotada (valores en CALIBRACION).
- **Clic en una parcela libre:** menú de construcción con los edificios disponibles, su costo, días de obra y mantenimiento. La obra se ve avanzar en el mapa.
- **Clic en un edificio:** su estado (activo, en obra, sin personal, lleno), personal y capacidad, y demoler.
- **Clic en un NPC o una zona:** su ficha o resumen. Lista filtrable de NPCs para llegar a uno sin buscarlo.
- **Rutina visible:** los NPCs van de casa al trabajo, a comprar y de vuelta, según su rol y la hora (CONTROLES §4). Quien está en una acción, internado o fuera de su puesto se ve distinto.
- **Íconos de estado** sobre los edificios: hospital lleno, comisaría sin personal, empresa recortando, comida agotada, obra en curso.
- **Parcelas bloqueadas** se ven con su hito pendiente.
- Capas de lectura: variables del NPC, roles, acciones activas, defensa, orden, integridad y amenaza por zona, y ocupación de cada hospital. **[propuesta]** Una a la vez, apagadas por defecto.
- A distancia, resúmenes y capas se agrupan por zona.

## 5. Información

- **Alertas:** hechos del motor, exactos, agrupados con aceleración. Llevan al hecho y a su causa. Nunca pausan.
- **Demandas:** llegan como tarjeta con el actor, lo que pide, lo que amenaza y el plazo. Si vence, se toma como rechazo.
- **Hitos:** al cumplirse, las parcelas nuevas se iluminan en el mapa.
- **Noticias:** la versión de la prensa, con sesgo, que puede llegar después del hecho. Muestran medio, autor, tema, tono y alcance; plantilla o texto generado se ven igual.
- **"¿Por qué pasó esto?":** desde una alerta, noticia o NPC, una línea de hasta 5 pasos clicables armada por el motor. Si empezó en una decisión del jugador, termina en el cambio de palanca.
- **Eventos colectivos:** el motor decide quiénes, cuándo y a qué zona; la vista solo anima el movimiento. Los contagiados se animan como un grupo que se suma.

## 6. El mundo vivo

El motor entrega zonas, indicadores y eventos; la vista decide coordenadas, rutas y aspecto.

1. La vista es solo de lectura: función del estado, la semilla, el día y los eventos.
2. El estado persistente (estructuras, defensas, daños) se reconcilia con el estado, así que funciona igual al cargar o acelerar. Los eventos transitorios se animan; si se pierden, el estado final se corrige igual.
3. Slots por semilla dentro de cada zona: la estructura n siempre ocupa el slot n; si un indicador sube se agrega una y las otras no se mueven.
4. La vista no inventa eventos con efecto: toda muerte visible es un evento de muerte.
5. Todo evento se representa: en el mundo o, si no se ve, en el registro de hechos.
6. El mapa respeta las zonas y su vecindad. Lo que el motor ubica en una zona (defensas, ataques, avisos) se muestra ahí; lo que no, se coloca sin sugerir que el lugar importa.
7. El contrato es el indicador (`seguridad`, `infraestructura`, `integridad` de cada zona). Si algo se promueve a entidad del motor (MOTOR §5), solo cambia de dónde sale el número.

## 7. Retroalimentación

Lo que anda bien o mal se siente, no solo se lee, por tres canales: datos exactos, el mundo (imagen y sonido) y la prensa. Todo estímulo sale de un estado o evento del motor, es proporcional al hecho y nunca bloquea. El diseño concreto se ajusta viendo la UI construida.

## 8. Rendimiento

- El cuello de botella es dibujar y mover NPCs. 100 NPCs de arranque, techo de 1.000.
- 6 GB de VRAM entre render e IA, con topes fijos (MOTOR §4).
- Tres perfiles (bajo, medio, alto) con detección automática; cada uno fija cuántos NPCs con modelo completo, la distancia de cambio de detalle y la calidad del clima. La detección nunca activa la IA.
- **[propuesta]** Detalle por distancia, solo lo que entra en cámara, detalle completo para NPCs interesantes (en foco, con acción, muy descontentos, periodistas), comunidad agregada por zona a distancia, instancias agrupadas y sin cálculo de caminos fuera de cámara.

## 9. Frontera con el motor

- La UI **lee** el estado (indicadores, eventos, historial: CONTROLES §4 y §5) y **envía comandos**: palancas, órdenes de obra, respuestas a demandas, NPC en foco (en la v1 solo abre su ficha), pausa y velocidad, partida nueva (preset, configuración, semilla), guardar y cargar, opciones de IA y depuración.
- El contrato es independiente del lenguaje: cambiar dónde vive el motor no cambia la UI.
- Mundo 3D, ventanas y HUD leen la misma fuente.
- **[propuesta]** Mientras el motor viva solo en TypeScript, Godot se desarrolla reproduciendo partidas grabadas (estado diario y eventos), incluida la prueba de 1.000 NPCs.

## 10. Opciones y desarrollo

- **Opciones:** calidad gráfica, controles de cámara, volumen e IA opcional (activar y elegir modelos; viene apagada).
- **Guardado:** uno manual y un autoguardado por partida, cargados desde el menú (MOTOR §3).
- **Modo desarrollador** (aparte, oculto en el juego normal): FPS y tiempos de simulación, velocidad muy alta, forzar fenómenos, cambiar la cantidad de NPCs y elegir el nivel de mundo y de gobernador (MUNDO §12, GOBERNADOR §7).

## 11. Fuera de esta UI y para después

- **Fuera:** idiomas adicionales, tutorial, gamepad y Steam Deck (nivel 3) y accesibilidad con paleta alternativa (sin nivel).
- **Para después:** estilo de alertas, leyendas de las capas, tooltips, estilo de ventanas, íconos, ambiente y sonido, animaciones de la interfaz, presentación de la prensa y atajos de teclado.
