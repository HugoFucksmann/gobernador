# Edificios y parcelas

> Catálogo de parcelas, edificios y obras del mundo. Cómo funcionan las zonas y la expansión: MUNDO §8. Quién paga y cobra: ECONOMIA.md. Costos, días de obra, capacidades y puestos: parámetros con nombre del preset. Lo marcado **[propuesta]** se pule.

---

## 1. Parcelas (lotes)

> Las parcelas son los **lotes** del mapa de baldosas (MAPA.md): tienen posición, tamaño (`S`, `M`, `L`, `XL`) y un frente sobre una calle. Cada edificio exige una clase de lote mínima (MAPA §4).

| Tipo | Quién construye | Qué se levanta |
|---|---|---|
| `residencial` | Hogares, firmas de construcción e inmobiliarias | Casas |
| `comercial` | Firmas | Locales de comercio, gastronomía, servicios y entretenimiento; oficinas de medio, construcción e inmobiliaria |
| `agricola` | Firmas `agro` | Campos |
| `industrial` | Firmas `industria` | Fábricas |
| `publica` | El estado | Hospital, comisaría, escuela, universidad, oficina pública |
| `especial` | Nadie (la preset) | Plaza, puerto, muelle de comercio exterior |

- Estados: `sin_calle`, `libre`, `en_obra`, `ocupada`. Una parcela `sin_calle` espera a que el estado construya la vía que la abre (sección 3b).
- Cada parcela tiene su zona y un lugar fijo. El orden dentro de la zona decide quién ocupa primero.
- Una parcela solo admite los edificios de su tipo y solo si tiene calle.
- **Obra:** al ordenarla se paga el costo y la parcela queda en obra por los días del catálogo, acortados por la infraestructura. Al terminar, el edificio se activa (evento `obra_fin`) y genera sus puestos y capacidades.
- **Mantenimiento:** cada edificio cuesta por período. Sin mantenimiento pagado, su servicio cae o el local pierde estado y puestos.
- **Demoler:** libera la parcela y deja de pagar mantenimiento, sin devolver el costo. Sus empleados quedan sin puesto al ritmo de siempre y sus internados pasan a otro hospital con cama o a su casa.
- **Zona:** lo que da un edificio actúa en su zona cuando el catálogo lo dice (comisaría, muralla, hospital).

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

| Tipo | Da | Radio | Puestos | Requisito del personal |
|---|---|---|---|---|
| `hospital` | Camas (`camas_por_hospital`) | `radio_hospital` | Médicos | Educación 3 |
| `comisaria` | Base de policía (hasta `puestos_por_comisaria`) y `bonus_defensa` en su zona | `radio_comisaria` | Policías | Educación 1 |
| `escuela` | Lugares de estudio (`lugares_por_escuela`); permite educación 2 al egresar | `radio_escuela` | Docentes | Educación 2 |
| `universidad` | Permite educación 3 al egresar | `radio_universidad` | Docentes | Educación 3 |
| `oficina_publica` | Nada en el mundo base; viene en el preset | — | Estatales | Educación 1 |

- **Radio de servicio:** cada edificio de servicio actúa solo sobre su zona y las zonas a ≤ su radio en pasos (MUNDO §9, *Alcance de los servicios*). Fuera del radio no hay servicio: el menor no estudia, el enfermo no se interna y la zona no tiene policía. Dónde se construye un servicio importa tanto como cuántos hay.
- **Hospital:** los internados van al hospital con cama libre más cercano al alcance. **Escuela:** los menores van a la más cercana con lugar. **Comisaría:** los policías nuevos arrancan en su zona y se destacan solo dentro de su radio.
- **Cupo educativo:** `lugares_por_escuela` limita cuántos menores estudian a la vez (los que no entran se quedan en casa); la universidad no simula estudiantes, solo habilita el nivel 3 de quien egresa dentro de su radio. La UI muestra a los menores en la escuela en su franja de estudio.
- **`oficina_publica`:** parcela pública del preset, clase M (MAPA §4), puestos Estatales (educación 1) y sin construcción automática.
- Costo de obra, días de obra, mantenimiento y lugares de escuela y universidad: parámetros con nombre en el catálogo, con valores razonables sin calibrar.
- Cada edificio genera sus puestos; los cubren personas que cumplen el requisito. Sin personal, no funciona (camas = min(camas del edificio, médicos × `pacientes_por_medico`)).
- Costo de obra (una vez, multiplicado por el factor del terreno, MAPA §3b), días de obra y mantenimiento por período, pagados por el estado.
- **Estado en piloto automático:** construye hospitales, comisarías, escuelas y universidades en parcelas públicas libres según MUNDO §9. Las oficinas vienen con el preset.

## 3b. Vías (las construye el estado)

| Tipo | Da | Ubicación |
|---|---|---|
| `calle` | Abre las parcelas de su frente dentro de una zona (pasan de `sin_calle` a `libre`) | Zona activa |
| `camino` | Une dos zonas, o abre una zona `no_urbanizada` y sus parcelas | Entre zonas vecinas |
| `puente` | Un camino que cruza una barrera natural y abre el terreno del otro lado | Entre zonas separadas por agua o desnivel |

- Cada tramo tiene `longitud`, nodos de unión, `estado` (0-100), **costo de obra** (una vez), **días de obra** (acortados por la infraestructura) y **mantenimiento** por período, pagados por el estado a firmas de construcción.
- Un tramo solo puede conectarse a la red ya construida.
- **Sin mantenimiento,** el `estado` baja; con la vía en mal estado baja la `infraestructura` de su zona y la capacidad de venta de los locales de su frente.
- Las vías no se demuelen en el mundo base. Inaugurar una vía es buena noticia.
- **Piloto automático:** el estado las construye con la regla de MUNDO §9. El gobernador las ordenará con `construir_via` (CONTROLES §3).

## 4. Privados

| Tipo | Rubro | Da | Parcela |
|---|---|---|---|
| `campo` | `agro` | `puestos_por_campo` agricultores y tope de producción | Agrícola |
| `fabrica` | `industria` | Produce **bienes** hasta su capacidad diaria; `puestos_por_fabrica` obreros y técnicos | Industrial |
| `almacen` | `comercio` | Vende comida; `puestos_por_almacen` obreros y 1 comerciante; capacidad diaria de ventas | Comercial |
| `supermercado` | `comercio` | Vende comida y bienes; capacidad alta y margen bajo; más puestos | Comercial |
| `tienda` | `comercio` | Vende bienes (ropa, ferretería, hogar) | Comercial |
| `kiosco` | `comercio` | Vende bienes chicos (golosinas, diarios, varios); pocos puestos | Comercial |
| `restoran` | `gastronomia` | Vende gastronomía; más puestos y más margen | Comercial |
| `bar_cafe` | `gastronomia` | Vende gastronomía de gasto chico; pocos puestos | Comercial |
| `peluqueria` | `servicios` | Servicios personales; pocos puestos | Comercial |
| `taller` | `servicios` | Reparaciones y servicios técnicos | Comercial |
| `gimnasio` | `servicios` | Servicios de salud y bienestar de gasto medio | Comercial |
| `cine_teatro` | `entretenimiento` | Entretenimiento de gasto medio; capacidad por función | Comercial |
| `club` | `entretenimiento` | Entretenimiento nocturno; margen alto | Comercial |
| `oficina_constructora` | `construccion` | Sede de una constructora: capacidad de obra por período | Comercial |
| `oficina_inmobiliaria` | `inmobiliaria` | Sede de una inmobiliaria: administra casas | Comercial |
| `oficina_medio` | `medio` | Redacción: columnistas y alcance base | Comercial |

- Cada rubro vende una **categoría de gasto** (ECONOMIA §6b): almacén y supermercado la comida; tienda, kiosco y supermercado los bienes; restorán y bar la gastronomía; peluquería, taller y gimnasio los servicios; cine y club el entretenimiento.
- Cada local tiene `estado` y pierde puestos si no se mantiene. El mantenimiento lo paga la firma.
- La **capacidad diaria de ventas** de un local limita lo que puede vender; una firma con un solo local satura. Es una de las fricciones contra el monopolio.
- **Obra:** la ordena una firma, la paga con su caja a una constructora y queda en obra `dias_obra_local` días.
- Al arrancar, el preset trae los locales, campos y oficinas de las firmas iniciales.
- Al quebrar una firma, sus locales quedan libres o salen a remate (ECONOMIA §9).

## 5. Obras de suceso (capa del gobernador)

No existen en el mundo base: las construye el gobernador antes del golpe (los avisos del clima dan la anticipación) y compiten por la misma reserva y los mismos lotes públicos que los servicios.

| Tipo | Contra | Da | Dura |
|---|---|---|---|
| `muralla` | `plaga_zombie` | + `defensa_muralla` en su zona; se daña con la integridad de la zona | Permanente |
| `silo` | `sequia`, `plaga` | + `silo_extra_dias` al tope de stock | Permanente |
| `riego` | `sequia` | Reduce a la mitad la caída de producción por sequía | Permanente |
| `hospital_campana` | `pandemia` | `camas_campana` que no necesitan médicos, con cura a la mitad de la de un hospital | `dias_campana`; después se desarma solo |

## 6. Fuera del mundo base

Viviendas públicas, refugios, subsidios, dique (pide crecida), edificios con integridad propia (promoción por necesidad, MOTOR §8), servicios privados (clínicas, escuelas y universidades privadas) y bancos (extensión `fiscal`, ECONOMIA §14).
