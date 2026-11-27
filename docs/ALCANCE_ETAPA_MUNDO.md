# Alcance de la etapa: motor y mundo simulado

> Orden de trabajo para el agente de prototipo. Esta etapa construye **solo el motor y el estado del mundo simulado, lo más cerrado posible, visible en la UI 2D**. No hay gobernador. No se calibran valores finos: se verifica que el mundo se sostiene y que todo sucede.

---

## 1. Qué entra

1. **Mundo completo** según MUNDO, ECONOMIA, EDIFICIOS, CAOS_PRENSA, ACCIONES y MOTOR: personas, familias, hogares, casas, ciclo de vida, firmas (rubros del catálogo), propiedad, compras, quiebras, medios, salud, clima, servicios, seguridad, caos y prensa.
2. **Mapa** de baldosas con calles, caminos, puentes, lotes y zonas, y red de rutas (MAPA), con **terreno generado por semilla** (ríos, montes y montañas que exigen puentes y obras caras, MAPA §3b).
3. **Estado en piloto automático** que construye servicios y vías según la demanda de suelo (MUNDO §9).
4. **Agenda diaria con variedad:** turnos por local, ritmo personal, tiempo libre con hábitos y faltazgos; cada persona va a su casa, su trabajo o escuela, a comprar, a ocio, a visitar, al hospital, o está en la calle o en una acción (MOTOR §7).
5. **UI 2D de observación** (UI_PROTOTIPO_MUNDO.md) con su **capa de lectura** (LECTURA): indicadores de vistazo con estado y tendencia, alertas, series, informe periódico y personas notables.
6. **Guardado y carga, determinismo con semilla, modo sin dibujo y escala de 100 a 5.000** (MOTOR).
7. **Verificaciones del motor** (MOTOR §6) y pruebas de que las cadenas aparecen.
8. **Extensión `fiscal`** (emisión e inflación) como último paso, si el resto cierra.

## 2. Qué no entra

Gobernador (palancas, demandas, hitos, objetivo, escenarios), IA opcional, Godot y 3D, arte y sonido, túneles y terreno modificable, crédito y bancos, y todo lo marcado "fuera del mundo base".

## 3. Orden sugerido

1. Mapa y red de rutas con un mundo fijo de 100 personas y la UI 2D mostrándolo.
2. Personas, hogares, casas, agenda y ciclo de vida (M0).
3. Economía con firmas, propiedad, mercado de vivienda y quiebras (M1).
4. Clima, salud, servicios, seguridad y estado automático (M2).
5. Caos y prensa con medios como firmas (M3).
6. Escala a 5.000, guardado y modo sin dibujo.
7. `fiscal`.
8. Capa de lectura y primera vista simple de la UI (LECTURA, UI_PROTOTIPO_MUNDO §7). Puede ir antes si ayuda a observar los pasos anteriores.

Cada paso se prueba corriendo antes de seguir.

## 3b. Perfiles de configuración

El mismo motor corre mundos más simples o más complejos cambiando solo la configuración, nunca el código.

- **Perfil** = módulos activos (niveles M0–M4 de MUNDO §13 y los interruptores de caos, clima, medios, `fiscal`, migración y estado automático) + parámetros + qué controles expone el contrato (CONTROLES). Se guarda como un preset con nombre.
- **Perfiles de prueba de esta etapa:** `minimo` (solo M0: hogares, casas y vida), `economia` (M0–M1), `completo` (todo menos el gobernador).
- **Regla de diseño:** un módulo apagado deja un comportamiento neutro (valores fijos del preset) y no rompe a los demás. Hay una prueba por módulo: se apaga y las verificaciones del motor (MOTOR §6) siguen pasando.
- **Después (fuera de esta etapa):** la dificultad del juego sale de cuántas palancas expone el perfil, sus rangos y si el estado automático ayuda o no. Otros mundos (amenazas nuevas, mundos chicos) son perfiles y tipos de fenómeno nuevos sobre el mismo motor.

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
- Cada cadena de ECONOMIA §13 aparece al forzar su causa.
- Con 5.000 personas, la simulación corre en modo sin dibujo y la UI 2D se mueve fluida.
- Dos semillas distintas dan mapas distintos; un río sin puente deja lotes aislados y el estado lo cruza al haber demanda de suelo.
- Las horas de salida al trabajo se reparten en el día (turnos, cronotipo): no hay un solo pico donde todos se mueven a la vez.
- Cada perfil de prueba corre sin errores y con las verificaciones del motor en verde.
- La capa de lectura cumple sus pruebas (LECTURA §9): sin alertas en cadena, notables estables, apagarla no cambia la simulación.
- Misma semilla, misma partida; guardar y cargar da el mismo resultado.

## 6. Qué documentos leer

ALCANCE_ETAPA_MUNDO, MAPA, MUNDO, ECONOMIA, EDIFICIOS, CAOS_PRENSA, ACCIONES, CONTROLES, MOTOR, LECTURA y UI_PROTOTIPO_MUNDO. GOBERNADOR, ACTORES, ESCENARIOS y UI quedan fuera de esta etapa.
