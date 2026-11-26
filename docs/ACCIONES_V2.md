# Tabla de acciones (v2.0)

> Base de arranque del director de caos. Formato, efectos, contagio y selección: CAOS_PRENSA_V2.md. Toda la tabla es **[propuesta]**. Las 19 acciones espontáneas y las 3 de condición de v1 (ACCIONES_V1) siguen igual, con la salvedad de que los efectos sobre dinero y comida actúan sobre el hogar. Acá solo se agrega lo nuevo.

---

## 1. Acciones espontáneas nuevas

| Id | Texto base | Quién puede | Contexto | Afinidad | Efectos | Días | Contagio |
|---|---|---|---|---|---|---|---|
| `idea_de_negocio` | {nombre} anda con una idea de negocio entre manos | Adulto con ahorro | Siempre | codicia+, rebeldía+ | `emprendedor`, `anima` baja | 2-6 | 0,10 |
| `apostar_los_ahorros` | {nombre} apuesta todo a una corazonada | Adulto con ahorro | Siempre | codicia+, resiliencia− | `gasta` alta | 1-3 | 0,05 |
| `reunion_familiar` | {nombre} junta a toda la familia a comer | Adulto con hogar de 3 o más | Siempre | resiliencia+ | `anima` media (hogar), `gasta` baja | 1-2 | 0,10 |
| `cuidar_abuelos` | {nombre} se pasa los días cuidando a los mayores | Adulto con jubilado en el hogar | Siempre | laboriosidad+, valentía+ | `cuida` baja | 3-8 | 0,05 |
| `dar_posada` | {nombre} acoge a un vecino sin casa | Adulto con casa | Algún hogar en calle en la zona | valentía+, codicia− | `comparte` baja, `anima` baja | 3-8 | 0,10 |
| `remodelar_casa` | {nombre} se pone a arreglar la casa | Adulto con casa | Casa en estado bajo | laboriosidad+ | `repara` media (casa), `anima` baja | 2-6 | 0,10 |
| `mudarse_a_otro_barrio` | {nombre} decide mudarse a otro barrio | Adulto con casa | Siempre | rebeldía+ | `decorativa` | 1-3 | 0,03 |
| `rumor_de_quiebra` | {nombre} anda diciendo que un negocio se funde | Adulto | Alguna firma con factor < 1 | valentía−, rebeldía+ | `difunde` (miedo) | 2-5 | 0,20 |

- `remodelar_casa` reutiliza `repara`, pero actúa sobre el `estado` de la casa propia en lugar de la integridad de la zona **[propuesta]**.
- `dar_posada` y `mudarse_a_otro_barrio` son rarezas de vida cotidiana; la mudanza real la decide el mercado de vivienda, no esta acción.

## 2. Acciones de condición nuevas

| Id | Texto base | Disparador | Quién puede | Afinidad | Efectos | Días | Contagio | Zona |
|---|---|---|---|---|---|---|---|---|
| `paro_firma` | {nombre} se une al paro de {empresa} | Recorte o despido fuerte de una firma | Empleado de esa firma | rebeldía+, resiliencia− | `fuera_de_puesto` | 3-8 | 0,20 | |
| `ocupacion` | {nombre} se instala en una casa vacía | `calle_pct` sobre su umbral y casas libres | Adulto de un hogar en calle | rebeldía+, valentía+ | `ocupa`, `agita` baja | 3-10 | 0,15 | |
| `boicot` | {nombre} deja de comprarle a {empresa} | Cuota de una firma sobre `umbral_poder_precio` y precio alto | Adulto | rebeldía+, codicia− | `boicotea`, `ahorra` media | 3-8 | 0,25 | |

- `ocupacion` termina cuando vence su duración o cuando el dueño recupera la casa; mientras dura, la casa no cuenta como libre para el mercado.
- `boicot` baja las ventas de la firma y presiona su precio; no es violencia.

## 3. Cómo se cubre cada situación nueva

| Situación | Qué pasa | Acciones |
|---|---|---|
| Calle y hacinamiento | La gente se acoge, ocupa o protesta | `dar_posada`, `ocupacion`, `protesta` |
| Monopolio y precios altos | Se organiza el boicot y se corre el rumor | `boicot`, `rumor_de_quiebra`, `ahorro_obsesivo` |
| Recorte en una firma | Paro | `paro_firma` |
| Idea de negocio | Se anima a emprender | `idea_de_negocio` |
| Vida familiar | Reuniones y cuidado | `reunion_familiar`, `cuidar_abuelos` |
| Casa en mal estado | Arreglo de los vecinos | `remodelar_casa` |

## 4. Pendiente

- Acciones propias de cada escenario (ESCENARIOS.md).
- Reacciones a la inflación con `fiscal`.
