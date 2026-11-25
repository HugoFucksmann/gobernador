# Hoja de ruta (v0.1)

> Los niveles del juego y qué entra en cada uno. Cada nivel combina un nivel de mundo (MUNDO §12) y uno de gobernador (GOBERNADOR §6). Todo es **[propuesta]** para pulir.

---

## 1. Resumen

| Nivel | Meta | Mundo | Gobernador | Dónde corre |
|---|---|---|---|---|
| **1** | Validar que el juego es divertido | M0 → M1 | G0 → G1 → G2 | Prototipo en TypeScript con UI de depuración |
| **1.1** | Profundizar sin cambiar la base | M2 | G3 | Prototipo |
| **2** | El juego en Godot | M2 + construcción real | G3 | Motor final + UI final (UI.md) |
| **3** | Listo para publicar | Igual | Igual | Steam |

## 2. Nivel 1: prototipo

Orden de construcción, cada paso calibrado antes del siguiente:

1. **M0 + G0:** NPCs, roles, economía y servicios en una zona, en piloto automático. Prueba de arranque balanceado (ECONOMIA §12).
2. **M0 + G1:** las 5 palancas básicas. ¿Se entiende el dilema de gastar o ahorrar?
3. **M1 + G2, elecciones:** zonas, salud, caos, prensa y las 10 palancas. Primer escenario completo.
4. **M1 + G2, zombies:** clima con daño, defensa, integridad y hordas.
5. **IA opcional:** clasificador y generativo como mejora, con el juego ya balanceado sin IA.

Entregables: los dos escenarios jugables de punta a punta, CALIBRACION.md con los valores y el informe de calibración de cada escenario.

## 3. Nivel 1.1: profundidad

- Extensión `fiscal`: emisión e inflación dinámica (ECONOMIA §9) y la palanca `tope_emision`.
- Palancas de prensa `presion` y `acceso`.
- Subsidio a la producción de alimento.
- Educación como servicio con nivel, si las partidas son lo bastante largas.
- Si las corridas lo piden: `disturbios`, `patrullar_vecinal` y los efectos `resguarda` y `vandaliza` (CAOS_PRENSA §5).

## 4. Nivel 2: el juego en Godot

- Decidir dónde vive el motor final. El contrato con la UI no cambia (UI §9).
- UI final completa (UI.md), desarrollada primero con partidas grabadas.
- Integridad como construcción real: estructuras que se dañan y se reparan. Solo cambia de dónde sale el número (MOTOR §5).
- Subsidios a servicios (por ejemplo, comida a precio reducido).
- Prueba de rendimiento con 1.000 NPCs.

## 5. Nivel 3: publicación

Idiomas adicionales, tutorial, gamepad y Steam Deck.

## 6. Preparado desde el nivel 1

Para no volver atrás al crecer:

- El contrato de controles (CONTROLES.md): las palancas y el mundo crecen sin tocarse.
- El contrato con la UI, independiente del lenguaje.
- Todo efecto con origen y causa.
- El guardado versionado, con migración entre versiones.
- Promoción por necesidad: lo que hoy es un número pasa a entidad sin cambiar contratos.

## 7. Sin nivel asignado

- **Mundo:** zombis como agentes, coordenadas y combate (se promueven cuando una regla dependa de ellos); pandemia contagiosa entre NPCs; medios con balance y quiebra; servicios privados; escala mayor a 1.000 NPCs.
- **Gobernador:** leyes con división de poderes, comunicado oficial, decisiones puntuales (cuarentena, toque de queda, obra pública), más de un objetivo por escenario, modo sin objetivo.
- **IA:** pensamiento del NPC en foco, textos personalizados por NPC, que la IA proponga a quién ofrecer acciones.
- **UI:** accesibilidad con paleta alternativa.
