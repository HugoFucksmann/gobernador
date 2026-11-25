# Escenarios (v1.0)

> Un escenario es un preset que configura las dos capas: el mundo (población, zonas, fenómenos, valores iniciales) y el gobernador (palancas activas, objetivo y derrota). Los escenarios solo cambian datos: no agregan mecánicas ni palancas propias. Valores: el preset de cada escenario (`presets/*.json`) y CALIBRACION.md.

---

## 1. Panel de configuración

Antes de la partida, sobre el preset elegido:

| Opción | Qué cambia |
|---|---|
| Escenario | El preset |
| Prensa | Un medio (monopolio) o varios |
| Economía | Base o con la extensión `fiscal` (cuando exista) |
| Límites del caos | Los de CAOS_PRENSA §6 |

- Todo valor distinto del preset se marca como **configuración de prueba**.
- La cantidad de NPCs (100 por defecto, techo 1.000) y los umbrales del objetivo no están en el panel: se cambian solo en modo desarrollador (UI §10).

## 2. Elecciones

Se implementa primero.

- **Historia:** gobernar un año y llegar a las elecciones con la comunidad a gusto.
- **Dilema:** gastar hoy (ayuda social, servicios) contra ahorrar la reserva. Si se agota, impago, huelga y servicios caídos.
- **Mundo:** sin fenómenos con daño. La policía solo hace orden.
- **Objetivo:** `apoyo_pct` ≥ 50 al día 365.
- **Derrota:** `hambre_critica_pct` > 50.

## 3. Apocalipsis zombie

- **Historia:** que la comunidad sobreviva a una plaga que crece.
- **Dilema:** más seguridad y obras contra garantía alimentaria y ayuda social. La prensa decide si la policía se ubica a tiempo.
- **Mundo:** una `plaga_zombie` con origen en la zona de entrada del preset, que crece hasta su máximo hacia el final del plazo, más hordas cortas e intensas con su propio origen y aviso. La referencia de policías por población es mayor.
- **Objetivo:** `poblacion_pct` ≥ 70 al día 180.
- **Derrota:** `poblacion_pct` < 40.

## 4. Qué define cada preset

- **Mundo:** población y roles, zonas y vecindad, asignación de zona por rol, `tope_privado` por rol, puestos de estatales y docentes, fenómenos, medios, valores iniciales (reserva, stock, dinero) y nivel de mundo (MUNDO §12).
- **Controles en piloto automático:** el valor inicial de cada control (CONTROLES §2).
- **Gobernador:** nivel de gobernador (GOBERNADOR §6), palancas bloqueadas, objetivo y derrota.
- **Arranque:** el generador cierra las cuentas de ECONOMIA §12 para que todo encaje al empezar.
