# Mapa y edificios (v2.0)

> Cómo se representa el territorio en el motor y en la UI 2D. Reemplaza lo territorial de MUNDO_V2 §4 y §8 y la parte de parcelas de EDIFICIOS_V2 §1 (esos docs apuntan acá). El terreno se genera por semilla (§3b) y la ciudad se construye encima. Lo marcado **[propuesta]** se pule.

---

## 1. Decisión

El mapa es una **grilla de baldosas** con **calles** (también baldosas) y **lotes** rectangulares pegados a una calle. Un lote aloja un edificio. Las **zonas** son regiones de baldosas. La **red de rutas** sale de las baldosas de vía.

El motor y la UI comparten el mismo mapa: el motor conoce las coordenadas enteras, la UI solo las dibuja y anima.

## 2. Por qué esta estrategia

| Opción | Ventajas | Problemas |
|---|---|---|
| Parcelas abstractas por zona (lo de hoy) | Simple y barato | La UI inventa coordenadas y rutas; calles y expansión no se ven ni se pueden razonar; las rutas del motor no coinciden con lo que se dibuja |
| **Baldosas + lotes sobre calles (elegida)** | Una sola fuente de verdad; rutas, expansión y vecindad salen de la grilla; la UI 2D es casi directa; Godot 3D es la misma grilla extruida; un generador procedural futuro produce el mismo formato | Más datos que parcelas sueltas (manejables) |
| Grafo de calles con lotes por frente, sin grilla | Rutas limpias | Hay que inventar la geometría para dibujar; difícil de generar y de editar a mano |
| Coordenadas continuas libres | Máximo realismo | Caro, no determinista fácil y acopla las reglas a la geometría. No hace falta para esta etapa |

Costo de la elegida: una grilla de unas 16.000 baldosas para 5.000 personas es chica para el motor. No se calcula ruta por persona: se precomputa por nodos de la red (sección 6).

## 3. Baldosa

Cada baldosa tiene un **terreno** y, si la hay, una **vía**.

| Capa | Valores |
|---|---|
| Terreno | `suelo` (urbanizable), `monte` (se construye con desmonte, más caro), `montaña` (no se construye ni se cruza) y `agua` (río, lago o mar; solo se cruza con puente) |
| Vía | ninguna, `calle`, `camino`, `puente` (con `estado` 0-100) |
| Zona | id de zona, o ninguna |

- Una baldosa de vía conecta con sus 4 vecinas de vía.
- Un `puente` solo puede ir sobre `agua` y une dos orillas de la red.

## 3b. Terreno generado por semilla [propuesta]

- **Terreno y ciudad separados:** el terreno es una capa que se genera una vez por semilla y no cambia durante la partida. Vías, lotes y edificios se construyen encima. El formato es el mismo `mapa.json` (§9): el generador solo llena `terreno` (y `altura`); los presets a mano siguen valiendo.
- **Generador (simple):**
  1. `altura` por ruido de valor de 2 octavas con el RNG `terreno`.
  2. Bajo `nivel_agua` es `agua` (mar o lago).
  3. **Ríos:** nacen en `n_rios` puntos altos y bajan por la mayor pendiente hasta el agua o el borde, de 1 a 2 baldosas de ancho.
  4. Sobre `umbral_montana` es `montaña`; entre `umbral_monte` y ese valor, o con pendiente fuerte, es `monte`.
  5. El resto es `suelo`.
- **Núcleo inicial:** va en el mayor claro de suelo plano y contiguo (al menos `area_minima_nucleo` baldosas). Ahí van las zonas activas y la red inicial. El resto del suelo urbanizable queda `sin_calle` o `no_urbanizada`, separado por ríos, montes y montañas.
- **Validación:** el suelo debe ser al menos `suelo_minimo_pct` del mapa y el núcleo debe caber en un claro. Si no, se regenera con una semilla derivada (misma semilla, mismo resultado).
- **Costo de obra por terreno** (factor sobre el costo base de vías y edificios): `suelo` ×1; `monte` ×`factor_monte`; pendiente fuerte ×`factor_pendiente`; `montaña` no se construye (se rodea); `agua` solo `puente`, con costo = `costo_puente_por_baldosa` × baldosas de cruce.
- **Efecto:** un río sin puente deja la otra orilla aislada (sus lotes quedan `sin_calle`); la ciudad crece por donde la obra sale más barata; cada semilla da otra forma de ciudad.
- **Fuera de esta etapa:** túneles y terreno modificable (la capa no cambia en la partida).

## 4. Lote (la parcela)

```json
{ "id": "l_centro_3", "zona": "centro", "x": 40, "y": 38, "w": 3, "h": 3, "clase": "M",
  "tipo": "comercial", "frente": [41, 41], "estado": "libre", "edificio": null }
```

- `tipo` como MUNDO_V2 §8: `residencial`, `comercial`, `agricola`, `industrial`, `publica`, `especial`.
- `clase` de tamaño **[propuesta]**: `S` (2×2), `M` (3×3), `L` (4×4), `XL` (6×6). El preset la fija por lote.
- `frente`: la baldosa de vía por la que se accede. Un lote cuyo frente no es vía construida está `sin_calle`.
- Estados: `sin_calle`, `libre`, `en_obra`, `ocupada`. (`bloqueada` de v1 se retira: la expansión es solo por vías.)
- **Un lote, un edificio.** El edificio necesita una clase mínima; en un lote más grande entra, y el resto del lote queda libre de uso.

| Edificio | Clase mínima |
|---|---|
| `casa_chica` | S |
| `casa_mediana` | M |
| `casa_grande` | L |
| `kiosco`, `bar_cafe`, `peluqueria`, `almacen` | S |
| `tienda`, `taller`, `gimnasio`, `restoran`, `comisaria`, `oficina_constructora`, `oficina_inmobiliaria`, `oficina_medio`, `oficina_publica` | M |
| `supermercado`, `cine_teatro`, `club`, `hospital`, `escuela`, `universidad` | L |
| `campo`, `fabrica` | XL |

## 5. Zonas

- Una zona es un conjunto de baldosas, sin huecos. Se declara en el mapa como una capa (una letra por baldosa).
- **La vecindad se deriva:** dos zonas son vecinas si tienen baldosas contiguas. Ya no hay grafo manual ni problema de cruces.
- La distancia entre zonas para clima y ataques (MUNDO_V1 §4) es el número de pasos entre zonas vecinas, como antes.
- **Zonas `no_urbanizada`:** región del mapa que todavía no tiene vía; se activa cuando la red llega a ella.

## 6. Red de rutas

- Los **nodos** son las intersecciones, los extremos de tramo y los frentes de lote; los **tramos** son segmentos de baldosas de vía entre nodos.
- **Costo de una baldosa** = 1 × (1 + `k_vial` × (1 − `estado`/100)). Una baldosa en estado 0 es intransitable.
- **Distancia entre dos lotes** = costo del camino mínimo entre sus frentes por la red.
- **Cómputo:** distancias precomputadas entre nodos (Dijkstra) y cacheadas; solo se recalculan cuando un tramo cambia de estado o se construye. Nadie calcula rutas por persona en el día.
- Si no hay ruta, el lote queda aislado: no se puede comprar ni trabajar en él.
- Usos: elección de vendedor, de casa y de trabajo; hospital más cercano; tiempo de viaje de la agenda (MOTOR_V2 §7); traslado que baja la productividad.

## 7. Expansión de la ciudad

- El preset trae más lotes de los que se usan (`sin_calle`) y tramos posibles con lo que abre cada uno.
- Solo el estado construye vías (EDIFICIOS_V2 §3b), con el costo de obra afectado por el terreno (§3b): un tramo en construcción pasa baldosa a baldosa a vía construida, y al terminar los lotes cuyo frente toca el tramo pasan a `libre`.
- Una zona `no_urbanizada` se activa cuando un camino o puente llega a sus baldosas.
- Hogares y firmas construyen sobre lotes libres según ECONOMIA_V2 §8.

## 8. Tamaño del mapa [propuesta]

| Escala | Personas | Baldosas aprox. |
|---|---|---|
| Depuración | 100 | 48 × 48 |
| Referencia | 500 | 80 × 80 |
| Máxima | 5.000 | 160 × 160 |

**Regla del generador [propuesta]:** el lado del mapa sale de la población inicial: `lado` = raíz de (`poblacion_inicial` × `baldosas_por_persona` ÷ `suelo_util_pct`), redondeado. `suelo_util_pct` es la parte del mapa que queda como suelo después del terreno (§3b), así que un mapa con más ríos y montañas sale más grande. La tabla de arriba son valores de referencia, no una regla. El tamaño se puede fijar a mano en un preset o en el modo desarrollador.

El preset ajusta la cantidad de lotes por tipo para que hogares, comercios y campos tengan lugar, con un 30 % de suelo `sin_calle` para crecer.

## 9. Formato del mapa (`mapa.json`)

```json
{
  "version": 1, "ancho": 96, "alto": 96,
  "terreno": ["....~~~~..", "..."],
  "altura":  ["3344556677", "..."],
  "vias":    ["..cc......", "..."],
  "zonas":   ["CCCCNNNN..", "..."],
  "zonas_info": [{ "id": "centro", "letra": "C", "caracter": "comercial", "estado": "activa" }],
  "lotes": [ { "id": "l_centro_3", "zona": "centro", "x": 40, "y": 38, "w": 3, "h": 3, "clase": "M", "tipo": "comercial", "frente": [41, 41] } ],
  "tramos_posibles": [ { "id": "t_12", "tipo": "calle", "baldosas": [[40, 41], [41, 41]], "abre": ["l_centro_3"] } ]
}
```

- Las tres capas (terreno, vías, zonas) son matrices del mismo tamaño, una cadena por fila.
- El estado dinámico (estado de las vías, lotes ocupados, edificios) vive en la partida, no en el mapa.
- `altura` es opcional (un dígito 0-9 por baldosa); sin ella no hay pendiente. El mapa se escribe a mano o lo produce el generador de §3b.

## 10. UI 2D

La UI dibuja el mapa baldosa por baldosa: terreno, vías con color según su estado, lotes con el ícono de su edificio y NPCs como puntos que se mueven por la red entre los lotes de su agenda. Ver UI_PROTOTIPO_MUNDO.md.
