# Alcance de la etapa: motor y mundo simulado (v0.1)

> Orden de trabajo para el agente de prototipo. Esta etapa construye **solo el motor y el estado del mundo simulado, lo más cerrado posible, visible en la UI 2D**. No hay gobernador. No se calibran valores finos: se verifica que el mundo se sostiene y que todo sucede.

---

## 1. Qué entra

1. **Mundo completo** según MUNDO_V2, ECONOMIA_V2, EDIFICIOS_V2, CAOS_PRENSA_V2, ACCIONES_V2 y MOTOR_V2: personas, familias, hogares, casas, ciclo de vida, firmas (rubros del catálogo), propiedad, compras, quiebras, medios, salud, clima, servicios, seguridad, caos y prensa.
2. **Mapa** de baldosas con calles, caminos, puentes, lotes y zonas, y red de rutas (MAPA_V2).
3. **Estado en piloto automático** que construye servicios y vías según la demanda de suelo (MUNDO_V2 §9).
4. **Agenda diaria:** cada persona va a su casa, su trabajo o escuela, a comprar, a comer, al hospital, o está en la calle o en una acción (MOTOR_V2 §8).
5. **UI 2D de observación** (UI_PROTOTIPO_MUNDO.md).
6. **Guardado y carga, determinismo con semilla, modo sin dibujo y escala de 100 a 5.000** (MOTOR_V2).
7. **Verificaciones del motor** (MOTOR_V2 §6) y pruebas de que las cadenas aparecen.
8. **Extensión `fiscal`** (emisión e inflación) como último paso, si el resto cierra.

## 2. Qué no entra

Gobernador (palancas, demandas, hitos, objetivo, escenarios), IA opcional, Godot y 3D, arte y sonido, terreno procedural, crédito y bancos, y todo lo marcado "fuera del mundo base".

## 3. Orden sugerido

1. Mapa y red de rutas con un mundo fijo de 100 personas y la UI 2D mostrándolo.
2. Personas, hogares, casas, agenda y ciclo de vida (M0).
3. Economía con firmas, propiedad, mercado de vivienda y quiebras (M1).
4. Clima, salud, servicios, seguridad y estado automático (M2).
5. Caos y prensa con medios como firmas (M3).
6. Escala a 5.000, guardado y modo sin dibujo.
7. `fiscal`.

Cada paso se prueba corriendo antes de seguir.

## 4. Mundo cerrado: qué significa

- **Ciclo diario completo:** la gente duerme, trabaja, compra, come, enferma, se cura y vuelve a casa; nada sucede sin una regla ni un origen.
- **Ciclo largo completo:** se nace, se crece, se estudia, se trabaja, se emparejan, se tienen hijos, se envejece, se muere y se hereda.
- **Economía completa:** hay empleo, comercio, alquiler, impuestos, empresas que nacen, crecen, se compran y quiebran, y medios que viven de publicidad.
- **Territorio vivo:** el estado abre calles y caminos cuando falta suelo y la ciudad crece.
- **Sin hilos sueltos:** toda cosa nombrada en los docs tiene su regla y su evento.
- **Explicable:** cualquier hecho se rastrea con "¿por qué?".

## 5. Cómo se prueba

- 100 personas corriendo 30 días sin tocar nada, sin clima ni caos: sin quiebras, sin desalojos, dinero y stock estables.
- 500 personas corriendo décadas: población que se sostiene, calle acotada, ninguna firma con todo el mercado, dinero que no deriva.
- Cada cadena de ECONOMIA_V2 §13 aparece al forzar su causa.
- Con 5.000 personas, la simulación corre en modo sin dibujo y la UI 2D se mueve fluida.
- Misma semilla, misma partida; guardar y cargar da el mismo resultado.

## 6. Qué documentos leer

Primero: ALCANCE_ETAPA_MUNDO, MAPA_V2, MUNDO_V2, ECONOMIA_V2, EDIFICIOS_V2, CAOS_PRENSA_V2, ACCIONES_V2, CONTROLES_V2, MOTOR_V2, UI_PROTOTIPO_MUNDO. Después, los v1 solo para lo que v2 cita (MUNDO_V1 §5-§10, ECONOMIA_V1 §5 y §7, CAOS_PRENSA_V1 §4-§5).
