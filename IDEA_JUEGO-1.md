# Juego de gobernador con comunidad de NPCs (título provisorio) (v1.0)

> La visión del juego y el mapa de los documentos. Todo lo escrito en los docs está decidido, salvo lo marcado **[propuesta]** (base para pulir) o **[pendiente de prueba]**.

---

## 1. Pitch

Una simulación de comunidad donde cada habitante es un NPC con personalidad propia. El jugador es el **gobernador** de una ciudad chica que tiene que crecer: construye en el mapa, ajusta unas pocas palancas, negocia con empresarios y medios, y se prepara para lo que viene. Gestiona condiciones, no a las personas. Un **director de caos** hace que los NPCs hagan cosas diversas, raras y divertidas, y la **prensa** cuenta lo que pasa. **El juego funciona completo sin IA**; opcionalmente, una IA local mejora las decisiones del caos y el texto de las noticias.

## 2. Corazón

La tensión entre **el orden que intenta imponer el gobernador** y **el caos creativo de la comunidad**. No se trata de optimizar una colonia, sino de gobernar gente impredecible.

**El loop:** la ciudad arranca chica y con servicios insuficientes → el jugador construye y ajusta → la economía y la comunidad responden → empresarios y medios presionan, el clima avisa y el caos sorprende → si las cosas van bien, se cumplen hitos y la ciudad se expande. Todo se ve y se toca en el mapa.

## 3. Pilares

1. **Simulación mecánica y barata.** Cada NPC tiene estado propio; la comunidad se deriva de ellos.
2. **Caos mecánico, IA opcional.** Las acciones salen de una tabla cerrada con efectos acotados. La IA elige y escribe; las reglas y la magnitud las controla el juego.
3. **Gobernador que construye y fija condiciones.** Construye, ajusta, negocia y planifica; nunca manda a un NPC ni escribe una noticia.
4. **Sucesos del mundo.** Sequías, plagas, pandemias y zombis desajustan lo que al empezar encaja.
5. **Economía viva.** Los NPCs trabajan, ganan, compran su comida y gastan; las empresas pagan según venden; el estado recauda y redistribuye.
6. **Prensa.** Es la forma de enterarse de lo que pasa y una fuerza más con la que lidiar.
7. **Todo explicable.** Cualquier hecho se rastrea hasta su causa.
8. **Dos capas que escalan por separado.** El mundo y la jugabilidad del gobernador crecen cada uno a su ritmo (sección 4).

## 4. Arquitectura en capas

```
GOBERNADOR (construir, palancas, demandas, hitos, objetivo)
        │ controles y órdenes · lee indicadores y eventos
     CONTROLES (contrato)
        │
MUNDO (NPCs, ciudad, economía, clima, salud, caos, prensa)
```

- El mundo corre solo, con los controles en los valores del preset (piloto automático).
- El gobernador solo mueve controles. Sumar o reagrupar palancas no toca el mundo; sumar complejidad al mundo no toca las palancas.
- Cada capa tiene sus niveles (Mundo M0-M2, Gobernador G0-G3) y cualquier combinación es jugable. Así se calibra el mundo sin jugar y se ve dónde interfiere el gobernador.

## 5. Escenarios

Dos para empezar: **elecciones** (primero) y **apocalipsis zombie**. Cada uno es un preset con historia, mundo y objetivo; un objetivo con plazo que no termina la partida y una derrota que sí (ESCENARIOS.md). Mundos de 100 NPCs, con techo de 1.000.

## 6. Plataforma

Steam, prototipo en TypeScript con un mapa 2D simple, UI final en Godot con 3D low-poly y cámara libre. El contrato entre UI y motor es independiente del lenguaje, así que dónde viva el motor final no cambia la UI. A x1, elecciones dura unas 2 horas reales y zombies, una.

## 7. Ideas a futuro

Niveles en HOJA_DE_RUTA. Notas que solo viven acá:

- **Leyes** que los NPCs puedan desobedecer, junto con la división de poderes.
- **Comunicado oficial** del gobernador a la comunidad (sin medio estatal).
- **Decisiones puntuales:** cuarentena, toque de queda.
- **Servicios privados** que den peso real a la desigualdad.
- **Subsidios a servicios** y a la producción de alimento.
- **Que la IA proponga a quién ofrecer acciones.**
- **Pensamiento del NPC en foco** y textos personalizados, con el generativo.

## 8. Documentos

| Capa | Documento | Qué tiene |
|---|---|---|
| Visión | IDEA_JUEGO.md | Este documento |
| Mundo | MUNDO.md | NPCs, roles, zonas, clima, salud, servicios, seguridad, causas, parcelas y edificios |
| Mundo | ECONOMIA.md | Circuito del dinero y la comida |
| Mundo | CAOS_PRENSA.md | Director de caos, acciones, medios, noticias, IA opcional |
| Mundo | ACCIONES.md | Tabla inicial de acciones |
| Mundo | EDIFICIOS.md | Catálogo de edificios y obras |
| Contrato | CONTROLES.md | Controles, órdenes, medidas, indicadores y eventos |
| Gobernador | GOBERNADOR.md | Construir, palancas, hitos, qué ve, objetivo y derrota |
| Gobernador | ACTORES.md | Empresarios, medios y sus demandas |
| Ambas | ESCENARIOS.md | Presets y panel de configuración |
| Técnico | MOTOR.md | Tiempo, orden de cálculo, guardado, infraestructura de IA |
| Técnico | UI.md | Interfaz final en Godot |
| Plan | HOJA_DE_RUTA.md | Niveles del juego |
| Plan | CALIBRACION.md | Valores y pruebas (lo maneja el agente de prototipo) |
