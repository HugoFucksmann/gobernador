# Alcance de la versión jugable

> Orden de trabajo para la primera versión que se puede jugar: el escenario Elecciones con el gobernador mínimo (G1) y, después, G2. Parte del mundo cerrado (ALCANCE_ETAPA_MUNDO). La jugabilidad: GOBERNADOR.md. Los actores: ACTORES.md.

---

## 1. La partida

El jugador ve una ciudad que se sostiene sola y la hace crecer **construyendo**: decide dónde poner escuelas, hospitales, comisarías y caminos, cuánto cobrar de impuesto, cuánto pagarle al sector público y cuánta obra sostener. Cada edificio cubre su radio de zonas; cada camino abre suelo nuevo. Gana si llega a las elecciones con el apoyo sobre la meta; pierde si la comunidad colapsa.

Bucle: mirar cobertura y reserva → construir o ajustar → ver cómo cambia el mundo en los días siguientes → llegar a la meta sin quedarse sin plata.

## 2. Qué entra

1. **G1:** órdenes `construir`, `construir_via`, `demoler` y palancas `impuesto`, `salario_publico`, `nivel_obras` (GOBERNADOR §2, §3 y §7), con el piloto automático del estado apagado (CONTROLES §1).
2. **Servicios por radio:** escuela, hospital y comisaría actúan solo dentro de su radio de zonas; fuera no hay servicio (MUNDO §9). Cobertura y radio visibles en el mapa.
3. **Objetivo y derrota** de Elecciones (ESCENARIOS §2), con la meta, los días restantes y el límite siempre visibles.
4. **UI 2D jugable:** la de observación (UI_PROTOTIPO_MUNDO) más barra de palancas, menú de construcción con radio, tarjetas que no pausan y la capa de cobertura.
5. **Guardado y carga**, determinismo con semilla (MOTOR §3).
6. **G2** como segundo paso: `ayuda_social`, `garantia_alimentaria`, hitos, y actores con demandas de obra e impuesto y extorsión (ACTORES §4 a §6). Los actores ya existen y se muestran desde G1.

Perfil de mundo: `completo` sin `fiscal` (M0 a M3).

## 3. Qué no entra

Palancas de precio, exterior y prensa y las demandas que las piden (G3); `fiscal`, contraofertas, `presion` y `acceso` (G4); Apocalipsis zombie; IA opcional; UI 3D en Godot y arte; adjudicación dirigida de obras; mercado de suelo; terreno modificable; crédito y bancos; zombis como agentes; edificios con integridad propia.

## 4. Complejidad de cada pieza

| Pieza | Complejidad | Por qué |
|---|---|---|
| Órdenes de construcción y palancas G1 | Baja | El contrato ya existe (CONTROLES §2 y §3) |
| Radios de servicio (escuela, hospital) | Baja a media | Cambia las reglas de asignación; las distancias entre zonas ya están precomputadas |
| Policía por radio con atenuación | Media | Presencia ponderada por zona y destaque dentro del radio; hay que cuidar que no oscile |
| Capa de cobertura en la UI | Baja | Pinta valores que el motor ya entrega por zona |
| Actores emergentes (notables) | Baja | Es una función derivada; ya está definida en LECTURA §5 |
| `favor` y `postura` | Baja a media | Un número con subas, bajas y decaimiento, todos con causa |
| Demandas de presión (tabla cerrada) | Media | Disparadores, plazos, compromisos de palanca y de obra, medidas |
| Extorsión | Media | Son las mismas demandas con tres condiciones y una medida más fuerte; lo difícil es calibrar que no sea injusta |
| Piloto automático sostenible | Media a alta | Ajuste fiscal, freno de obra y obra directa deben cerrar sin oscilar; es lo que más calibración pide |
| Adjudicación dirigida, mercado de suelo, crédito | Alta | Abren sistemas nuevos con muchas interacciones; fuera de esta versión |
| Zombis como agentes, integridad propia, IA generativa, port a C# | Muy alta | Cambian el motor o suman dependencias externas |

## 5. Orden sugerido

1. G1 sobre el mundo cerrado: construir y ver cobertura por radio.
2. Objetivo, derrota y tarjetas de Elecciones. Primera partida completa.
3. Ajustar con partidas reales: que construir de más hunda y construir bien alivie.
4. G2: `ayuda_social`, `garantía`, hitos.
5. Actores: peso, postura y favor visibles; después demandas de presión; al final la extorsión.

Cada paso se juega antes de seguir.

## 6. Cómo se prueba

- Una partida de 365 días se puede jugar de punta a punta sin trabarse y se puede ganar y perder.
- Construir una escuela cambia cuántos menores estudian; construir un hospital, cuántos se internan; construir una comisaría, el miedo y el orden de las zonas de su radio; abrir un camino, los lotes libres. Todo se ve en la UI.
- Sin construir nada durante un año, el mundo se resiente en lo que cada servicio cubre y en la expansión, pero no se rompe.
- Construir de más lleva al impago, y demoler o bajar `nivel_obras` lo alivia.
- Un magnate hostil con el gobernador débil extorsiona; con el gobernador fuerte, no. Ceder deja precedente.
- Misma semilla y mismas decisiones dan la misma partida.
