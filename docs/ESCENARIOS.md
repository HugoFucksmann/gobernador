# Escenarios

> Un escenario es un preset que configura las dos capas: el mundo (población, mapa, zonas, lotes, edificios iniciales, fenómenos, valores iniciales) y el gobernador (palancas activas, hitos, objetivo y derrota). Los escenarios solo cambian datos: no agregan mecánicas ni palancas propias. Valores: el preset de cada escenario (`presets/*.json`).

---

## 1. Panel de configuración

Antes de la partida, sobre el preset elegido:

| Opción | Qué cambia |
|---|---|
| Escenario | El preset |
| Prensa | Cantidad inicial de medios (uno es monopolio; 0 a muchos) |
| Economía | Base o con la extensión `fiscal` (M4, cuando exista) |
| Límites del caos | Los de CAOS_PRENSA §6 |

- Todo valor distinto del preset se marca como **configuración de prueba**.
- La cantidad de personas (100 por defecto, hasta 5.000), la semilla del terreno y los umbrales del objetivo no están en el panel: se cambian solo en modo desarrollador (UI §10).

## 2. Elecciones

Se implementa primero.

- **Historia:** gobernar un año y llegar a las elecciones con la comunidad a gusto.
- **Dilema:** construir y gastar hoy (servicios, ayuda social) contra ahorrar la reserva. Si se agota, impago, huelga y servicios caídos. Los empresarios presionan por impuestos y precios; los medios, por pauta.
- **Mundo:** núcleo chico con un hospital y una comisaría insuficientes, lotes libres y otros `sin_calle` que se abren construyendo vías. Sin fenómenos con daño; **[propuesta]** una sequía con aviso a mitad de año, para que silo y riego tengan sentido. La policía solo hace orden.
- **Objetivo:** `apoyo_pct` ≥ 50 al día 365.
- **Derrota:** `hambre_critica_pct` > 50 o `poblacion_pct` < 50.

## 3. Apocalipsis zombie

- **Historia:** que la comunidad sobreviva a una plaga que crece.
- **Dilema:** comisarías, murallas y hospitales contra garantía alimentaria y ayuda social. La prensa decide si la policía se ubica a tiempo.
- **Mundo:** núcleo chico sin murallas, lotes públicos libres en todas las zonas. Una `plaga_zombie` con origen en la zona de entrada del preset, que crece hasta su máximo hacia el final del plazo, más hordas cortas e intensas con su propio origen y aviso. La referencia de policías por población es mayor.
- **Objetivo:** `poblacion_pct` ≥ 70 al día 180.
- **Derrota:** `poblacion_pct` < 40.

## 4. Qué define cada preset

- **Mundo:** población y roles, mapa (terreno o semilla, vías iniciales, zonas), lotes de cada zona (libres y `sin_calle`) y tramos posibles, edificios iniciales (públicos, locales y campos), firmas con sus dueños, fenómenos, medios, valores iniciales (reserva, stock, dinero) y nivel de mundo (MUNDO §13).
- **Controles en piloto automático:** el valor inicial de cada control (CONTROLES §2).
- **Gobernador:** nivel de gobernador (GOBERNADOR §7), palancas bloqueadas, tipos de edificio y vía disponibles desde el inicio, hitos con lo que desbloquean (GOBERNADOR §4), demandas activas (ACTORES §3), objetivo y derrota.
- **Arranque:** el generador cierra las cuentas de ECONOMIA §16 para que todo encaje al empezar.
