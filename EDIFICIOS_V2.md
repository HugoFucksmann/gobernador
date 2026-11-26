# Edificios y parcelas (v2.0)

> Catálogo de parcelas y edificios del mundo. Cómo funcionan las parcelas: MUNDO_V2 §8. Quién paga y cobra: ECONOMIA_V2. Costos, días de obra, capacidades y puestos: parámetros con nombre, sin calibrar acá. Lo marcado **[propuesta]** se pule.

---

## 1. Parcelas

| Tipo | Quién construye | Qué se levanta |
|---|---|---|
| `residencial` | Hogares, firmas de construcción e inmobiliarias | Casas |
| `comercial` | Firmas | Locales de comercio, oficinas de medio, oficinas de construcción e inmobiliaria |
| `agricola` | Firmas `agro` | Campos |
| `publica` | El estado | Hospital, comisaría, escuela, oficina pública |
| `especial` | Nadie (la preset) | Plaza, puerto, muelle de comercio exterior |

- Estados: `bloqueada`, `libre`, `en_obra`, `ocupada`. Las parcelas bloqueadas se habilitan más adelante (capa del gobernador).
- Cada parcela tiene su zona y un lugar fijo. El orden dentro de la zona decide quién ocupa primero.
- Una parcela solo admite los edificios de su tipo.

## 2. Casas

| Tipo | Capacidad | Notas |
|---|---|---|
| `casa_chica` | Hasta `cap_chica` personas | Alquiler bajo |
| `casa_mediana` | Hasta `cap_mediana` | Estándar |
| `casa_grande` | Hasta `cap_grande` | Alquiler alto |

- Atributos: `capacidad`, `estado` (0-100, decae solo), `dueno` (hogar, persona o firma inmobiliaria), `alquiler`.
- **Obra:** al ordenarla se paga el costo a una firma de construcción; la parcela queda en obra `dias_obra_casa` días. Al terminar, la casa está libre o se asigna a su dueño.
- **Mantenimiento:** lo paga el dueño a una firma de construcción. Sin pago, `estado` baja y con él la capacidad útil, el alquiler y la satisfacción.
- **Abandono:** una casa vacía mucho tiempo sin reparar se deteriora hasta quedar inutilizable; el dueño puede demolerla y recuperar la parcela **[propuesta]**.
- **Demoler:** libera la parcela; sus habitantes quedan sin casa y entran al mercado de vivienda.

## 3. Públicos

| Tipo | Da | Puestos | Requisito del personal | Ubicación |
|---|---|---|---|---|
| `hospital` | Camas (`camas_por_hospital`) | Médicos | Educación 3 | Los internados van al hospital con cama libre más cercano |
| `comisaria` | Base de policía y `bonus_defensa` en su zona | Policías | Educación 1 | Los policías nuevos arrancan en su zona |
| `escuela` | Nada en el mundo base; viene en el preset | Docentes | Educación 2 | — |
| `oficina_publica` | Igual que la escuela | Estatales | Educación 1 | — |

- Cada edificio genera sus puestos; los cubren personas que cumplen el requisito. Sin personal, no funciona (camas = min(camas del edificio, médicos × `pacientes_por_medico`)).
- Costo de obra (una vez), días de obra y mantenimiento por período, pagados por el estado.
- **Estado en piloto automático:** construye hospitales y comisarías en parcelas públicas libres según MUNDO_V2 §9. Escuelas y oficinas vienen con el preset.

## 4. Privados

| Tipo | Rubro | Da | Parcela |
|---|---|---|---|
| `campo` | `agro` | `puestos_por_campo` agricultores y tope de producción | Agrícola |
| `almacen` | `comercio` | Venta de comida: `puestos_por_almacen` obreros y 1 comerciante; capacidad diaria de ventas | Comercial |
| `kiosco` | `comercio` | Gasto de vida chico (golosinas, diarios, varios), pocos puestos | Comercial |
| `restoran` | `comercio` | Gasto de vida y comida, más puestos y más margen | Comercial |
| `oficina_constructora` | `construccion` | Sede de una constructora: capacidad de obra por período | Comercial |
| `oficina_inmobiliaria` | `inmobiliaria` | Sede de una inmobiliaria: administra casas | Comercial |
| `oficina_medio` | `medio` | Redacción: columnistas y alcance base | Comercial |

- Cada local tiene `estado` y pierde puestos si no se mantiene. El mantenimiento lo paga la firma.
- La **capacidad diaria de ventas** de un local limita lo que puede vender; una firma con un solo local satura. Es una de las fricciones contra el monopolio.
- **Obra:** la ordena una firma, la paga con su caja a una constructora y queda en obra `dias_obra_local` días.
- Al arrancar, el preset trae los locales, campos y oficinas de las firmas iniciales.
- Al quebrar una firma, sus locales quedan libres o salen a remate (ECONOMIA_V2 §9).

## 5. Obras de suceso

Murallas, silos, riego y hospitales de campaña (v1) **no existen en el mundo base**: las construye el gobernador (capa posterior) antes del golpe. El catálogo de v1 (EDIFICIOS_V1 §2) sigue vigente para esa capa.

## 6. Fuera del mundo base

Viviendas públicas, refugios, subsidios, puente y dique (piden crecida), edificios con integridad propia (promoción por necesidad, MOTOR_V2 §7) y servicios privados (hospitales y escuelas privados).
