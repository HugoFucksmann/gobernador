# Edificios (v0.1)

> Catálogo de edificios y obras. Cómo funcionan parcelas, construcción y edificios: MUNDO §13. Quién construye: el gobernador (GOBERNADOR §3) y los privados (MUNDO §13). Costos, días, capacidades y puestos: CALIBRACION.md. Toda la tabla es **[propuesta]**.

---

## 1. Públicos (los construye el gobernador)

| Tipo | Da | Puestos | Requisito del personal | Ubicación |
|---|---|---|---|---|
| `hospital` | Camas (`camas_por_hospital`) | Médicos | Educación 3 | Los internados van al hospital con cama libre más cercano |
| `comisaria` | Base de policía y `bonus_defensa` en su zona | Policías | Educación 1 | Los policías nuevos arrancan en su zona |
| `escuela` | Nada en el nivel 1: solo la trae el preset; no se puede construir | Docentes | Educación 2 | — |
| `oficina_publica` | Igual que la escuela | Estatales | Educación 1 | — |

- Cada edificio genera sus puestos; los cubren los NPCs que cumplen el requisito. Sin personal, el edificio no funciona (camas = min(camas del edificio, médicos × `pacientes_por_medico`)).
- Cada uno tiene **costo de obra** (una vez), **días de obra** y **mantenimiento** por período.

## 2. Obras de suceso (las construye el gobernador)

Se construyen antes del golpe; los avisos del clima dan la anticipación.

| Tipo | Contra | Da | Dura |
|---|---|---|---|
| `muralla` | `plaga_zombie` | + `defensa_muralla` en su zona; se daña con la integridad de la zona | Permanente |
| `silo` | `sequia`, `plaga` | + `silo_extra_dias` al tope de stock | Permanente |
| `riego` | `sequia` | Reduce a la mitad la caída de producción por sequía | Permanente |
| `hospital_campana` | `pandemia` | `camas_campana` que no necesitan médicos, con cura a la mitad de la de un hospital | `dias_campana`; después se desarma solo |

Compiten por la misma reserva y las mismas parcelas que los servicios.

## 3. Privados (los construyen los dueños)

| Tipo | Quién | Cuándo | Da |
|---|---|---|---|
| `local_comercio` | Socios de comercio | Factor > 1 durante `periodos_para_invertir` y hay parcela libre habilitada | + `puestos_por_local` obreros y 1 puesto de comerciante |
| `campo` | Empresario de alimento | Igual | + `puestos_por_campo` agricultores al tope de alimento |

- Lo pagan los dueños con su `dinero`; el gasto va a la empresa de comercio (ECONOMIA §4).
- Al arrancar, el preset trae los locales y campos que dan los topes iniciales.

## 4. Fuera del nivel 1

Viviendas (no hay modelo de vivienda con población fija), puente y dique (piden un fenómeno de crecida), edificios con integridad propia.