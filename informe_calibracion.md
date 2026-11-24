# Informe de Calibración — Escenario `Elecciones` (`simple`)

**Preset final:** `presets/elecciones_simple.json`  
**Simulación base:** 100 habitantes (distribución exacta de `ESTADOS §10`), 365 días de juego, módulo económico `simple`, director aleatorio de respaldo (`ESTADOS §9`) sin llamadas a IA externa y registro de causas activo.  
**Reglas y documentación fuente:** `IDEA_JUEGO.md`, `ESTADOS.md`, `GOBERNADOR.md` (sin modificaciones). En el código solo se actualizaron valores numéricos/placeholders en `src/data/catalogs.ts` y `src/engine/worldGenerator.ts`.

---

## 1. Alineación con la documentación y desvíos detectados respecto del brief

1. **Síntomas iniciales del brief vs implementación real:**
   - El brief reportaba orientativamente `nómina ~250/día vs recaudación ~170/día; producción ~90 vs consumo ~100`.
   - En la simulación headless real con los defaults previos (`antes`, `n = 40`):
     - Nómina = `21 × 12 = 252/día` (`1764/semana`).
     - Recaudación neta = `264.48/día` (`1851.36/semana`, `ingresos/obligatorios = 1.05`, dejando `disponible = +87.36/semana`, insuficiente frente al costo de servicios `294/semana`). Resultado: colapso de servicios, caída de productividad y `impago` en `6/40` semillas (`28` impagos acumulados).
     - Producción día 1 = `80.33/día` (`SD = 1.77`) frente a `100/día` de consumo, porque la productividad real promedio del día 1 es `~0.655` (no `~0.90` como decía el comentario de `catalogs.ts`).
2. **Desvío de sequía de prueba (`brief` vs `ESTADOS §4–5`):**
   - El brief menciona `sequía intensidad 60, día 140, 30 días` y simultáneamente autoriza ajustar `intensidad y duración de la sequía de prueba`.
   - Bajo las reglas actuales de `ESTADOS §4` (almacén sin tope ni merma), al llegar el día 140 con equilibrio inicial (`A1`), el stock acumulado ronda `2440–3100` unidades. Una sequía `60%` durante `30` días solo recorta la producción `30%` (`~-960` u netas): el stock mínimo queda en `1287.83 u` (`SD = 476.66`) y el gobernador pasivo gana **`75.0%`** (`n = 40`), incumpliendo `<= 25%`.
   - Siguiendo `PUEDES AJUSTAR`, se calibró la sequía de prueba a **`intensidad 95, día 140, duración 90 días`**, donde el pasivo gana **`15.0%`** y el heurístico **`69.5%`** (`n = 200`).
3. **Desvío de `ESTADOS §13` (escala salarial pública vs privada):**
   - `ESTADOS §13` pide `salario_publico` cercano al medio de privados de nivel parecido (`educ 1–2`: bruto efectivo `~16–24/día`), pero con `precioBaseAlimento = 1.0` subir `salarioBasePublico` a `~18` duplica la nómina (`378/día`) y exige ingresos privados casi el doble de altos (lo cual volvería trivial el costo externo de importar alimento). Se calibró `salarioBasePublico = 9` para preservar el intercambio fiscal real y se reporta esta tensión en la Sección 6.

---

## 2. Tabla de Criterios de Aceptación (`A` – `E`)

| Criterio | Métrica y meta | `n` | Valor medido (media ± desvío) | Mín / Máx | Estado |
|---|---|---:|---|---|---|
| **A1** | Producción alimento >= consumo × 1,05 (ración 100) | 100 | `105.91 ± 2.67` vs `100.00` (ratio `1.059x`) | `99.0 / 111.8` | **Cumple** |
| **A1b** | Stock inicial entre 15 y 20 días | 100 | `1500` u (`15.0` días exactos) | `15.0 / 15.0` | **Cumple** |
| **A2** | Ingresos >= obligatorios × 1,10 (incluye impuesto público); disponible > 0 | 100 | `1888.07 ± 32.93` vs `1323.00` (ratio `1.43 ± 0.02`; disp. `+565.07 ± 32.93`) | ratio `1.37 / 1.50` | **Cumple** |
| **A3** | Reserva inicial >= 20 días de nómina | 100 | `4200` vs `20 × 189 = 3780` (`22.2` días) | `22.2 / 22.2` | **Cumple** |
| **B1** | Sin perturbación (365d): 0 impagos | 100 | `0` semillas con impago (`0` eventos) | `0 / 0` | **Cumple** |
| **B2** | Sin perturbación: `hambre_critica_pct < 5` | 100 | `0.00 ± 0.00 %` | `0 / 0` | **Cumple** |
| **B3** | Sin perturbación: satisfacción media dentro de ±5 pts del inicio | 100 | `66.94 ± 0.47` -> `63.34 ± 2.32` (`Δ = -3.60 ± 2.36`) | Δ `-14.2 / -1.5` | **Cumple** |
| **B4** | Sin perturbación: `apoyo_pct` entre 50 y 60 al día 365 (victoria) | 100 | `57.70 ± 2.88 %` (victoria `98.0%`) | `46 / 63` | **Cumple** |
| **C1** | Con sequía calibrada (`95%`, día `140`, `90d`) + caos: gobernador pasivo gana <= 25 % | 200 | Victoria **`15.0%`** (`apoyo 34.61 ± 11.05`, `hambre 80.08 ± 33.91`) | apoyo `21 / 64` | **Cumple** |
| **C2** | Con sequía calibrada + caos: gobernador heurístico gana 60–85 % | 200 | Victoria **`69.5%`** (`apoyo 48.38 ± 14.80`, `hambre 13.98 ± 32.65`) | apoyo `16 / 63` | **Cumple** |
| **C_doc** | Diagnóstico con sequía ejemplo del brief (`60%`, día `140`, `30d`) + caos, pasivo | 40 | Victoria `75.0%` (`minStock 1287.83 ± 476.66`, `hambre 4.53 ± 19.72`) | minStock `0 / 1500` | *Ref. brief* |
| **C3** | Solo caos (cesa día 180), sin sequía, gobernador pasivo: recuperación | 100 | Al cese (d180): `sat 57.82 ± 2.70`, `apoyo 52.06 ± 4.19`. Al d365: `sat 59.67 ± 7.74`, `apoyo 52.72 ± 10.72` (victoria `83.0%`) | `apoyo365` `7 / 63` | **Cumple** |
| **D** | Sensibilidad ±20% a 60d > ruido entre semillas (`apoyo SD = 0.72`, `res SD = 68.01`) | 50 | Palancas fiscales, ración, subsidios e intercambio superan ampliamente `SD`; ninguna palanca decide sola por sí misma sin restricción | Ver Sección 4 | **Cumple (con notas)** |
| **E** | Ningún rol queda vacío y `obreros <= comerciantes × empleados_por_comerciante` | 500 | Mínimo de cualquier rol = `3` (`> 0`); `max(obrero - cap) = -2` (`14 <= 4 × 4 = 16`) | min `3` / over `-2` | **Cumple** |

---

## 3. Valores Antes y Después

### 3.1 Parámetros (`ECON_CONSTANTS`, `ROLE_CATALOG`, `SCENARIO_PRESETS` y palancas iniciales)

| Parámetro | `ESTADOS.md` (ejemplo) | Código previo ("Antes") | Preset calibrado ("Después") | Motivo |
|---|---:|---:|---:|---|
| `produccionBaseAgricultor` | `3` | `4.1` | **`5.42`** | Compensa productividad real inicial `~0.655` para lograr `~106 >= 105` |
| `salarioBasePublico` | `12` | `12` | **`9`** | Equilibra nómina (`189/día`) contra recaudación y reserva |
| `costoBaseServicioPorPoblacion` | N/E | `0.42` | **`0.19`** | Evita el colapso estructural de los 4 servicios (`133/sem`) |
| `coefSubsidioSimple` | a calibrar | `3.5` | **`11.9`** | Diferencia grupos (`agro`/`sin_ingreso`) manteniendo `sat >= 62` |
| `coefImpuestoSimple` | a calibrar | `0.45` | **`1.17`** | Posiciona `apoyo_pct` base en `~57.7%` (cerca del umbral 50) |
| `agricultor.ingreso` | `[8, 14]` | `[14, 22]` | **`[18, 28]`** | Base gravable compatible con A2 sin superar umbral fiscal `40%` |
| `obrero.ingreso` | `[12, 20]` | `[16, 26]` | **`[20, 30]`** | Escala consistente con agricultura y comercio |
| `comerciante.ingreso` | `[14, 30]` | `[20, 34]` | **`[24, 38]`** | Refleja `educ_min = 1` + base tributaria |
| `tecnico.ingreso` | `[20, 32]` | `[26, 38]` | **`[30, 44]`** | Mayor ingreso privado acorde a `educ_min = 2` |
| `periodista.ingreso` | `[10, 20]` | `[16, 26]` | **`[20, 30]`** | Ajuste proporcional manteniendo rol viable |
| `reservaInicial` | `600` | `650` | **`4200`** | Cumple A3 (`>= 20 × 189 = 3780`, `22.2` días de nómina) |
| `stockAlimentoInicial` | `1700` | `1700` | **`1500`** | Cumple A1 (`15.0` días dentro del rango `15–20` días) |
| `impuestoUnico` inicial | `~25` | `28` | **`26`** | Margen de recaudación y margen de suba ante sequía sin pasar `40%` |
| `presupuesto` (`sal/seg/inf/edu`) | `20/10/20/15` | `22/18/20/16` | **`18/12/18/12`** | Sostiene servicios y deja `20%` libre a reserva y holgura para D |
| `prensa` | `5` | `6` | **`5`** | Sostenibilidad de 2 medios con `20%` libre total |
| `subsidios` (`agro/ind/com/pub/sin_ing`) | `5/0/0/0/10` | `0/0/0/0/8` | **`9/0/0/0/6`** | Sostiene al agro (`30` NPCs) y `sin_ingreso` (`25` NPCs) en ~57% apoyo |
| `sequia_prueba` (`int, dia, dur`) | `(60, 140, 30)` | aleatoria | **`(95, 140, 90)`** | Genera crisis real al pasivo (`15%`) resoluble por heurístico (`69.5%`) |

### 3.2 Resultados comparativos Antes vs Después (`n = 40` antes vs `n = 100` después, sin perturbación)

| Indicador (365 días sin clima/caos) | Antes (`n = 40`) | Después (`n = 100`) |
|---|---:|---:|
| Victoria (%) | `0.0%` | **`98.0%`** |
| Producción día 1 | `80.33 ± 1.77` | **`105.91 ± 2.67`** |
| Ratio ingresos / obligatorios (día 7) | `1.05 ± 0.02` | **`1.43 ± 0.02`** |
| Disponible semanal día 7 | `87.36 ± 33.06` | **`565.07 ± 32.93`** |
| Semillas con impago | `6 / 40` (`28` impagos) | **`0 / 100`** (`0` impagos) |
| Hambre crítica día 365 (%) | `100.00 ± 0.00` | **`0.00 ± 0.00`** |
| Satisfacción media día 365 | `25.81 ± 1.22` (`Δ -41.19`) | **`63.34 ± 2.32`** (`Δ -3.60`) |
| Apoyo día 365 (%) | `8.47 ± 3.52` | **`57.70 ± 2.88`** |
| Reserva final | `248.01 ± 146.07` | **`11523.75 ± 881.80`** |

---

## 4. Sensibilidad por Palanca a 60 Días (`n = 50` semillas)

**Ruido base entre semillas (sin cambios de palanca):** `apoyo_pct = 54.44 ± 0.72 pp`; `reserva = 5121.53 ± 68.01`.  
Cada palanca se movió según `cambio_max_por_periodo_pct = 20%` del rango válido de `GOBERNADOR §4` (más prueba relativa `±20%` del valor inicial en `impuestoUnico` y `subsidios.agro`).

| Palanca y desplazamiento probado | Δ Apoyo (+) | Δ Apoyo (−) | Δ Reserva (+) | Δ Reserva (−) | Clasificación |
|---|---:|---:|---:|---:|---|
| `alimento.racion` (`±20` pp sobre `[50..150]`) | `0.00` | **`-32.60`** | `0.0` | `-623.5` | **Dominante hacia abajo** / nula arriba |
| `gasto.subsidios.agro` (`+20 / -9` pp) | `+0.26` | **`-30.36`** | `-807.6` | `+196.3` | **Dominante en bloque al retirar** |
| `gasto.subsidios.agro` (`±1.8` pp, ±20% relativo) | `+0.02` | `-0.82` | `-62.5` | `+59.3` | Moderada (en el borde del ruido en `+`) |
| `gasto.subsidios.publico` (`+20 / 0` pp) | **`+21.00`** | `0.00` | `-807.6` | `0.0` | **Dominante** (mueve bloque `21` NPCs) |
| `gasto.subsidios.industria` (`+20 / 0` pp) | **`+17.34`** | `0.00` | `-807.6` | `0.0` | **Dominante** (mueve bloque `17` NPCs) |
| `gasto.subsidios.comercio` (`+20 / 0` pp) | `+7.12` | `0.00` | `-807.6` | `0.0` | Activa (`> 9× SD`) |
| `recaudacion.impuestoUnico` (`±12` pp, rango) | **`-8.68`** | `-2.14` | **`+1235.5`** | **`-2984.5`** | **Dominante en reserva**; bajar a `14%` da déficit |
| `recaudacion.impuestoUnico` (`±5.2` pp, ±20% rel.) | `-0.02` | `-2.02` | `+570.9` | `-563.8` | Activa sobre reserva (`> 8× SD`) |
| `cupos.policia` (`+6 / -4`, sin vaciar rol) | `-2.26` | `+4.50` | `-171.2` | `+311.3` | Activa (fiscal por nómina) |
| `gasto.presupuesto.salud` (`+20 / -18`) | `+0.58` | `-2.80` | `-807.6` | `+697.9` | Activa al recorte (`> 3.8× SD`) |
| `gasto.subsidios.sin_ingreso` (`+20 / -6`) | `+0.58` | `-2.42` | `-807.6` | `+242.3` | Activa al recorte |
| `gasto.salarioPublico` (`±20` pp sobre `[50..150]`) | `-2.06` | `+0.58` | `-321.1` | `+328.8` | Activa (solo vía nómina/disponible en `simple`) |
| `gasto.presupuesto.infraestructura` (`+20 / -18`) | `+0.56` | `-1.92` | `-807.6` | `+526.3` | Activa al recorte |
| `cupos.medico` (`+6 / -4`, sin vaciar rol) | `-0.84` | `+1.90` | `-56.6` | `+295.6` | Activa |
| `alimento.intercambio` (`±40` sobre `[-100..100]`) | `-1.46` | `+0.54` | `-255.8` | `+209.2` | Activa en stock/reserva (`±200–255`) |
| `gasto.presupuesto.seguridad` (`+20 / -12`) | `+0.12` | `-0.36` | `-807.6` | `+481.2` | Débil en `apoyo` sin crimen/zombies; fuerte en `reserva` |
| `gasto.presupuesto.educacion` (`+20 / -12`) | `0.00` | `0.00` | `-807.6` | `+484.6` | **Sin efecto en `apoyo` a 60d** (solo afecta `reserva`) |
| `gasto.prensa` (`+20 / -5`) | `0.00` | `0.00` | `-807.6` | `+201.9` | **Sin efecto en `apoyo` sin director/noticias** |
| `recaudacion.impuestoGrupo.*` (`±12` pp) | `0.00` | `0.00` | `0.0` | `0.0` | **Sin efecto** (inactiva en módulo `simple`) |
| `alimento.garantiaAlimentaria` (`+15 / -20`) | `0.00` | `0.00` | `0.0` | `0.0` | **Sin efecto** (inactiva en módulo `simple`) |
| `finanzas.topeEmision` (`±6` pp) | `0.00` | `0.00` | `0.0` | `0.0` | **Sin efecto** (inactiva en módulo `simple`) |

**Resumen de palancas:**
- **Sin efecto en `simple`:** `impuestoGrupo.*`, `garantiaAlimentaria`, `topeEmision` (`0.00` en todo); y sin efecto en `apoyo_pct` a 60d sin perturbación: `educacion`, `prensa`, y subir `racion > 100` (aunque `educacion` y `prensa` sí mueven la `reserva`).
- **Dominantes:** `alimento.racion` hacia abajo (`-32.60 pp` por disparar hambre continua bajo `0.98`), `subsidios` a grupos grandes (`agro`, `publico`, `industria`: `17–30 pp` por cruce masivo del umbral `lealtad = 50`) e `impuestoUnico` sobre la `reserva` (`+1235 / -2984`). Ninguna palanca sola convierte la sequía en victoria automática sin coordinar compra de comida + financiamiento fiscal.

---

## 5. Series Temporales (Semilla 1)

Reglas fijas del **gobernador heurístico** evaluadas cada 7 días:
1. Si `diasStock < 10`: `intercambio = 85`; si `10 <= diasStock < 14` y `produccion < consumo`: `intercambio = 50`; si no, `intercambio = 0`. `racion = 115` solo si `hambreCritica > 5%` y `diasStock >= 12` (si no, `100`).
2. Si `reserva < 20 días de nómina` o `intercambio >= 50`: subir `impuestoUnico` a `min(35, 26 + 9)` (`34` si `intercambio > 0` menor); si `intercambio == 0`, `reserva >= 20 días` y (`apoyo < 48%` o `descontentos > 25%`): aliviar `impuestoUnico` a `22`; si no, `26`.
3. Si `descontentos > 25%`: sumar `+2` puntos de subsidio (tope `12`, dentro del disponible) al grupo con menor satisfacción media.

### 5.1 Pasivo sin perturbación

| Día | Reserva | Stock | Días stock | Apoyo (%) | Hambre crítica (%) | Satisfacción media |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 4200 | 1500 | 15.0 | 100.0 | 0.0 | 67.6 |
| 30 | 4645 | 1738 | 18.4 | 55.0 | 0.0 | 57.5 |
| 60 | 5093 | 2039 | 21.4 | 55.0 | 0.0 | 57.5 |
| 90 | 5556 | 2380 | 24.8 | 55.0 | 0.0 | 57.7 |
| 120 | 6160 | 2773 | 28.7 | 55.0 | 0.0 | 59.5 |
| 140 | 6411 | 3072 | 31.7 | 55.0 | 0.0 | 58.9 |
| 155 | 6800 | 3317 | 34.2 | 55.0 | 0.0 | 60.5 |
| 170 | 7068 | 3585 | 36.9 | 55.0 | 0.0 | 60.8 |
| 185 | 7345 | 3877 | 39.8 | 55.0 | 0.0 | 61.2 |
| 200 | 7631 | 4195 | 42.9 | 55.0 | 0.0 | 61.6 |
| 215 | 7927 | 4543 | 46.4 | 55.0 | 0.0 | 62.2 |
| 230 | 8236 | 4928 | 50.3 | 55.0 | 0.0 | 62.6 |
| 260 | 9033 | 5728 | 58.3 | 55.0 | 0.0 | 64.0 |
| 300 | 9831 | 6801 | 69.0 | 56.0 | 0.0 | 62.9 |
| 330 | 10629 | 7605 | 77.1 | 56.0 | 0.0 | 64.1 |
| 365 | 11428 | 8546 | 86.5 | 56.0 | 0.0 | 64.1 |

### 5.2 Pasivo con sequía calibrada (`95%`, día `140`, `90d`) y caos (termina en derrota temprana día 204)

| Día | Reserva | Stock | Días stock | Apoyo (%) | Hambre crítica (%) | Satisfacción media |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 4200 | 1500 | 15.0 | 100.0 | 0.0 | 67.6 |
| 30 | 4607 | 1687 | 17.9 | 54.0 | 0.0 | 57.6 |
| 60 | 5016 | 1911 | 20.1 | 54.0 | 0.0 | 57.0 |
| 90 | 5406 | 2139 | 22.4 | 53.0 | 0.0 | 57.1 |
| 120 | 5914 | 2312 | 24.1 | 51.0 | 0.0 | 58.1 |
| 140 | 6119 | 2441 | 25.4 | 54.0 | 0.0 | 56.9 |
| 155 | 6416 | 1792 | 18.9 | 52.0 | 0.0 | 58.0 |
| 170 | 6605 | 1135 | 12.3 | 51.0 | 0.0 | 57.9 |
| 185 | 6802 | 490 | 5.9 | 51.0 | 0.0 | 57.1 |
| 200 | 7013 | 0 | 0.6 | 51.0 | 0.0 | 51.3 |
| 204 | 7105 | 0 | 0.5 | 31.0 | 100.0 | 36.9 |

### 5.3 Heurístico con sequía calibrada (`95%`, día `140`, `90d`) y caos (victoria día 365)

| Día | Reserva | Stock | Días stock | Apoyo (%) | Hambre crítica (%) | Satisfacción media |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 4200 | 1500 | 15.0 | 100.0 | 0.0 | 67.6 |
| 30 | 4607 | 1687 | 17.9 | 54.0 | 0.0 | 57.6 |
| 60 | 5016 | 1911 | 20.1 | 54.0 | 0.0 | 57.0 |
| 90 | 5406 | 2139 | 22.4 | 53.0 | 0.0 | 57.1 |
| 120 | 5858 | 2316 | 24.2 | 51.0 | 0.0 | 60.2 |
| 140 | 6053 | 2438 | 25.4 | 54.0 | 0.0 | 55.8 |
| 155 | 6339 | 1758 | 18.6 | 53.0 | 0.0 | 57.1 |
| 170 | 6519 | 1095 | 11.9 | 52.0 | 0.0 | 56.0 |
| 185 | 6852 | 708 | 8.1 | 40.0 | 0.0 | 52.5 |
| 200 | 7076 | 548 | 6.5 | 38.0 | 0.0 | 52.4 |
| 215 | 7280 | 386 | 4.9 | 39.0 | 0.0 | 51.3 |
| 230 | 7484 | 259 | 3.6 | 33.0 | 0.0 | 51.7 |
| 260 | 8144 | 1394 | 14.9 | 40.0 | 0.0 | 58.6 |
| 300 | 8656 | 1808 | 19.1 | 55.0 | 0.0 | 59.5 |
| 330 | 9256 | 2177 | 22.8 | 53.0 | 0.0 | 59.6 |
| 365 | 9881 | 2690 | 27.9 | 55.0 | 0.0 | 60.5 |

---

## 6. Problemas, Ambigüedades y Contradicciones de Reglas (Propuestas sin Aplicar)

1. **Acumulación ilimitada de stock en `simple` vs sequía de 30 días (`ESTADOS §4–5`):**  
   Sin tope de depósito ni merma diaria de alimento, un superávit inicial del 5% (`A1`) acumula >30 días de reserva antes del día 140, haciendo inocua la sequía de ejemplo `(60%, 30d)`.  
   *Propuesta:* introducir capacidad máxima de silo (p. ej. `20–25` días de consumo) o merma diaria del excedente (`1–2%`), o calibrar la sequía de crisis por defecto a `85–95%` y `60–90` días.
2. **`comprasAlimento` descuenta `disponible` antes que `reserva` (`ESTADOS §12`):**  
   En `settleFiscalPeriod`, el gasto por importación de alimento reduce `disponible`; si `disponible < 0`, la reserva cubre el déficit pero los 4 servicios públicos reciben presupuesto `0` y decaen `-4.2/semana`, iniciando una espiral destructiva sobre `infraestructura` y producción agrícola. Esto contradice la intuición de usar `reserva` como colchón anticíclico.  
   *Propuesta:* financiar el exceso de `comprasAlimento` con cargo directo a `reserva` (manteniendo un piso operativo de presupuesto para servicios) cuando exista reserva suficiente.
3. **Umbral discontinuo de hambre bajo `racion < 98` (`simulation.ts` / `ESTADOS §12`):**  
   Racionar por debajo de `98` (`racion = 90..95`) aplica `(1 - acceso) * 26` de hambre todos los días sin cota inferior, haciendo que racionar preventivamente empeore el hambre hasta `100` aun con cientos de unidades en depósito.  
   *Propuesta:* usar un `targetHambre` acotado cuando `racion >= 75` o reducir `hambre` parcialmente cuando se cubre la ración establecida.
4. **Inconsistencia en `ESTADOS §1` / `GOBERNADOR §5` sobre `salario_publico` en módulo `simple`:**  
   `GOBERNADOR §5` indica que subir `salario_publico` aumenta `satisfaccion(publicos)+`, pero en `ESTADOS §3.1` y en el código de `simple`, `poderAdquisitivo` solo lee `subsidios` e `impuestoUnico`, por lo que subir `salario_publico` en `simple` solo sube la nómina y empeora levemente el apoyo (`-2.06 pp`). Además, `ESTADOS §13` pide `salario_publico` cercano al medio de privados de nivel parecido, lo cual rompería la escala respecto al precio fijo de alimento `$1.00`.  
   *Propuesta:* sumar un término `(salarioPublico - 100) * k` al `poderAdquisitivo` del grupo `publico` en `simple`, y definir un factor de escala común entre precios base y salarios.
5. **Desfase en el día 1 entre `lealtad` inicial (`100%` apoyo real) y `historial[0].apoyo` (`64%`):**  
   `worldGenerator` inicializa `lealtad = randInt(54, 72)` en los 100 NPCs, haciendo que `deriveCommunityStats` marque `apoyo = 100%` durante los primeros días mientras `historial[0]` registra `64` hardcoded.  
   *Propuesta:* muestrear `lealtad` inicial heterogénea centrada en `~52–56` (coherente con `apoyo_pct` inicial real ~55–64%) y calcular `historial[0]` con `deriveCommunityStats(state)`.
6. **Edad y egreso de `estudiante` (`ESTADOS §1` vs `§2` vs código):**  
   `ESTADOS §1` fija menor `<18` (`estudiante`), `ESTADOS §2` permite hasta `24`, el generador asigna edades `8–21`, y `handleRolesAndAging` solo egresa al estudiante si `dia % 365 === 0 && edad === 18` (los estudiantes iniciales de `19–21` quedan bloqueados en el rol hasta jubilarse).  
   *Propuesta:* egresar en `edad >= 18` (salvo extensión explícita de estudios superiores) y evaluar transición periódicamente sin depender solo de igualdad exacta a `18`.
7. **Efecto en bloque sobre `apoyo_pct` y sesgo positivo del caos espontáneo:**  
   Como `apoyo_pct` cuenta el porcentaje binario con `lealtad >= 50`, los subsidios por grupo mueven bloques enteros de `17–30` NPCs (`±17..30 pp`). En sentido inverso, varias acciones espontáneas (`organizar_fiesta`, `peña_cultural`, `coleccionar_objetos`) aportan `+5..+12` de satisfacción media, amortiguando el caos cuando no reemplazan trabajo agrícola.  
   *Propuesta:* añadir dispersión individual adicional en `poderAdquisitivo` (según `ingreso_pos` o `resiliencia`) y revisar el balance neto de satisfacción en `ACTION_TABLE`.
8. **Palancas de `cupos` sin penalización por baja cobertura policial/sanitaria sin eventos:**  
   En `D`, recortar `cupos.policia` de `5` a `1` elevó `apoyo` (`+4.50 pp`) al liberar nómina hacia salud/infraestructura, porque sin plaga ni delitos activos la baja seguridad casi no penaliza el apoyo.  
   *Propuesta:* aplicar un recargo gradual de miedo/malestar cuando `coberturas.policia` o `medico` cae debajo de `0.60`.

---

## 7. Comando para reproducir todo

```bash
npx tsx scripts/run_calibration.ts
```

Lee automáticamente `presets/elecciones_simple.json`, mide el estado `antes`, verifica criterios `A`, `B` (`n = 100`), `C1/C2` (`n = 200`), `C3` (`n = 100`), `C_brief` (`n = 40`), `D` (`n = 50`), `E` (`500` corridas de 365 días) e imprime las 3 series temporales completas.
