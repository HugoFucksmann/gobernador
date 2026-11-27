# Actores y demandas

> Los actores son las personas poderosas del mundo: grandes empresarios y dueños de medios. Nacen solos del juego económico, presionan al gobernador con demandas de una tabla cerrada y, si se juntan poder, hostilidad y debilidad del gobernador, lo extorsionan. Funcionan sin IA y todo queda explicable. Las demandas piden palancas u obras (GOBERNADOR §2 y §3) y sus consecuencias usan medidas del mundo (CONTROLES §3). Los valores son parámetros del preset. Toda la tabla es **[propuesta]**.

---

## 1. Quiénes son

- **Actor = notable.** Una persona real del mundo, con hogar, firmas e historia, que la regla de LECTURA §5 marca como notable. La capa del gobernador calcula esa misma regla para jugar; LECTURA solo la muestra, así que apagar la lectura no apaga a los actores.
- **Emergen solos:**
  - `empresario`: dueño mayoritario de firmas que suman peso (cantidad de firmas, empleados, caja, cuota de mercado, patrimonio). Se llega por crecer, por comprar firmas (ECONOMIA §9) o por heredar.
  - `medio`: quien funda o compra un medio (ECONOMIA §8 y §9) o lo hereda entra con peso = alcance × credibilidad de su medio. También cuenta su columnista estrella.
- **Dejan de serlo** al morir, quebrar, vender o caer bajo el peso de salida. Sus demandas abiertas se cancelan sin medida; sus herederos pueden entrar como actores nuevos.
- **Sin notables no hay actores:** la partida se juega igual. Hay como máximo `notables_max` (LECTURA §5).
- **Qué tiene cada actor:** `interes`, `recurso` y `amenaza` (sección 2), `peso` (0-100, el de LECTURA), `favor` (−100 a 100, sección 3) y `postura`.

## 2. Poder: qué pueden hacer

| Tipo | Interés | Recurso | Amenaza |
|---|---|---|---|
| **Empresario** | Su ganancia, sus lotes, sus vías, el impuesto | Empleo (los empleados de sus firmas), oferta (su cuota de comida y bienes), publicidad (lo que sus firmas pagan a los medios) | Retener stock, despedir, no invertir ni comprar |
| **Medio** | Sus fondos, su audiencia | Lo que publica (alcance × credibilidad) | Una campaña con un tono fijo |

- **La escala de la amenaza es el peso.** Las medidas se aplican a las firmas del actor y su magnitud crece con su peso: despedir un % de *sus* empleados, retener *su* stock, frenar *su* inversión. Un magnate con muchas firmas puede mover el desempleo de toda la ciudad; un medio grande, el apoyo.
- El gobernador **nunca manda** a un actor: solo responde a lo que piden.

## 3. Relación: favor y postura

- **`favor`** empieza en 0 (o sembrado por la lealtad del actor y la línea editorial de su medio) y decae hacia 0 `decaimiento_favor` por período.
  - **Sube:** aceptar una demanda, cumplir un compromiso, bajar el impuesto (empresarios), repartir fondos de prensa (medios), una obra que lo beneficia (la vía que abre sus lotes, la comisaría en la zona de sus locales).
  - **Baja:** rechazar una demanda, dejar vencer una, **incumplir** un compromiso (mucho más), impuesto alto, un impago que golpea a sus firmas.
- **`postura`** (derivada): `aliado` con favor ≥ `favor_aliado`, `hostil` con favor ≤ `favor_hostil`, `neutral` en el medio. Un aliado pide menos seguido y sus medidas son más suaves (× `k_aliado`); un hostil, lo contrario.
- Todo cambio de favor tiene origen y causa, así que la postura se puede explicar ("está hostil porque rechazaste dos pedidos y subiste el impuesto").

## 4. Demandas

- **Demanda:** cuando se cumple su disparador, el actor pide algo concreto con un **plazo** en días (`dias_respuesta_demanda`). El juego no se pausa. Hay una activa por actor como máximo y entre dos del mismo actor pasan al menos `dias_entre_demandas`.
- **Tipos:** de **palanca** (pide un cambio de valor) y de **obra** (pide una orden `construir` o `construir_via`).
- **Aceptar:**
  - *Palanca:* pasa al valor pedido y queda bloqueada `dias_compromiso` días.
  - *Obra:* el gobernador se **compromete** a ordenarla antes de que venza `dias_compromiso`. Se cumple al ordenarla (`obra_inicio` del tipo y lugar pedidos). Si no, es un **incumplimiento**: aplica la medida y el favor cae más que con un rechazo (`demanda_incumplida`).
  - El actor queda conforme y no vuelve a pedir lo mismo por un tiempo.
- **Rechazar** (o dejar vencer el plazo): el actor aplica su medida. Es un hecho más del mundo, con causa en la demanda.
- **Explicable:** la demanda tiene como causa el evento que la disparó; la medida, la demanda rechazada. "El magnate de la zona norte despidió gente porque no abriste el camino que pidió" sale de seguir la cadena.
- Una demanda solo se dispara si la palanca u orden que pide está disponible en el nivel del gobernador (GOBERNADOR §7) y si no está bloqueada por otro compromiso.

| Id | Actor | Disparador | Pide | Si se rechaza |
|---|---|---|---|---|
| `bajen_impuestos` | Empresario | `factor` < 1 en alguna de sus firmas durante 2 períodos, o `impuesto` sobre `umbral_impuesto_demanda` | Bajar `impuesto` un paso | `despido_forzado`: despide `pct_despido_medida` de sus empleados |
| `via_a_mi_zona` | Empresario | Sus firmas no pueden crecer por falta de lotes libres de su tipo durante `periodos_sin_lote` (demanda de suelo, MUNDO §8) | **Obra:** `construir_via` de un tramo que abre lotes de ese tipo | `sin_inversion` en todas sus firmas por `dias_medida` |
| `seguridad_en_mi_zona` | Empresario | Cobertura policial de la zona de sus locales bajo `cobertura_min` y saqueos o miedo alto en ella | **Obra:** `construir` una comisaría cuyo radio cubra esa zona | `sin_inversion` en las firmas de esa zona |
| `mas_pauta` | Medio | Su dependencia bajo `umbral_pauta` y una noticia mala reciente para el gobierno | Subir `prensa` un paso | `campana`: tono crítico sobre el gobierno por `dias_medida` |
| `silencio_pagado` | Medio con afinidad alta | `hambre_critica_pct` sobre su umbral de noticia | Subir `prensa` un paso a cambio de tono favorable | `campana`: tono alarmista sobre el hambre por `dias_medida` |
| `liberen_precio` | Empresario `agro` | `precio_maximo` moderado o estricto y `factor` de su firma `agro` < 1 | `precio_maximo` un modo más libre | `retencion_stock` en su firma por `dias_medida` (ECONOMIA §6) |
| `abran_exportacion` | Empresario `agro` | Su stock cerca del tope del silo y `comercio_exterior` en cerrado o importando | Pasar a exportar | `sin_inversion` en sus firmas por `dias_medida` |

- "Un paso" es el siguiente valor de la palanca (un modo, un escalón o el salto fijo del preset).
- `silencio_pagado` aceptada fuerza el tono favorable sobre el hambre por `dias_compromiso`: es pagar por propaganda y cuenta como dependencia del medio.
- Las tres primeras (`bajen_impuestos`, `via_a_mi_zona`, `seguridad_en_mi_zona`) usan solo las palancas y órdenes del nivel G2 (sección 6). Las demás piden `prensa`, `precio_maximo` o `comercio_exterior` (G3).

## 5. Extorsión

Una demanda normal es una presión. Pasa a ser **extorsión** cuando se juntan las tres condiciones:

1. **Poder:** el `peso` del actor es ≥ `peso_extorsion`. Un empresario chico presiona; un magnate extorsiona.
2. **Hostilidad:** su `postura` es hostil, o rechazaste o incumpliste algo suyo en los últimos `periodos_memoria_rechazo` períodos con `favor` < 0.
3. **Debilidad del gobernador:** el motor la mide con cualquiera de estas señales: `apoyo_pct` a menos de `margen_vulnerable` puntos de la meta o del límite de derrota, impago en curso, reserva bajo `reserva_min_dias`, o hambre crítica sobre su umbral. El actor ataca cuando el gobernador tiene algo grande que perder.

**Qué cambia respecto de una presión:**

| | Presión | Extorsión |
|---|---|---|
| Qué pide | Un paso de una palanca o una obra | Dos pasos, una obra que lo favorece sobre todo a él, o fondos y silencio |
| Plazo | `dias_respuesta_demanda` | `dias_respuesta_extorsion` (más corto) |
| Si se rechaza | La medida de la tabla | La medida × `k_extorsion`: despido de `pct_despido_extorsion` de los empleados de todas sus firmas más `sin_inversion` global; para un medio, una campaña crítica o alarmista sobre el apoyo |
| Si se acepta | Compromiso normal | Compromiso y **precedente** |

- **Precedente:** durante `periodos_precedente` el actor pide con la mitad de espera, y los medios publican que el gobierno cedió (tema `presiones`, con culpa del gobierno). "Ceder siempre deja al gobernador sin margen."
- **Límites:** una sola extorsión activa en toda la ciudad (`max_extorsiones_activas`) y al menos `dias_entre_extorsiones` entre dos del mismo actor. Nunca antes del nivel G2.
- Emite `extorsion {actor, demanda}` además de los eventos de demanda. Es un hecho del mundo con causa: el cambio de favor, el apoyo bajo o el impago que la habilitaron.

**Contrapesos (no son órdenes sobre el actor, son efectos del mundo):**

- **No estar débil:** colchón fiscal y apoyo alto hacen que la condición 3 no se cumpla. Es el contrapeso principal.
- **Trato parejo:** mantener `favor` alto con obras y servicios en su zona evita la hostilidad.
- **Competencia:** abrir vías suma suelo y emprendedores, lo que baja su cuota y su peso (ECONOMIA §9, monopolio).
- **Fondos de prensa parejos** entre medios (`prensa`, G3) hacen crecer a los medios chicos y diluyen al grande.

## 6. Niveles

| Nivel del gobernador | Qué pasa con los actores |
|---|---|
| G0, G1 | Existen y se ven (peso, postura), pero no piden nada: el jugador solo construye y ajusta lo mínimo |
| G2 | Presiones de obra y de impuesto (`bajen_impuestos`, `via_a_mi_zona`, `seguridad_en_mi_zona`) y extorsión |
| G3 | Todas las demandas de la tabla, incluidas prensa, precio y exportación |
| G4 | Contraofertas, `presion` y `acceso` sobre la prensa |

## 7. Fuera de la versión jugable

Contraofertas, adjudicación dirigida de obras a una firma amiga, sindicatos de públicos, vecinos de una zona, relación entre actores (alianzas y enfrentamientos) y demandas generadas por la IA.
