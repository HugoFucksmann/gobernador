# Economía

> El circuito del dinero y la comida con hogares, firmas, propiedad y vivienda. Personas y hogares: MUNDO.md. Edificios: EDIFICIOS.md. Medios: CAOS_PRENSA.md. Lo que el gobernador mueve: CONTROLES.md. Los valores son parámetros con nombre del preset; no se calibran acá. Lo marcado **[propuesta]** se pule; lo demás está decidido.

---

## 1. Principios

1. **Todo peso tiene origen y destino.** Entra o sale del mundo solo por los puntos de la sección 12; el resto circula, incluidas herencias, compras, alquileres y quiebras. El motor lo verifica cada día.
2. **Un solo calendario:** lo diario (producir, comer, gastar) y el **día de pago** cada `periodo_dias`, igual para firmas, estado y hogares con alquiler.
3. **Nadie paga lo que no tiene y nadie se endeuda** (en la base). Si no alcanza, se recorta con una regla fija. El crédito no existe (§14).
4. **Lo que se ahorra vuelve:** el hogar con plata de más la gasta de a poco.
5. **Propiedad de personas:** firmas y casas tienen dueños que cobran, heredan, compran, venden y pierden.

## 2. Actores

| Actor | Guarda | Le entra | Le sale |
|---|---|---|---|
| Hogar | `dinero` | Ingresos de sus miembros, ganancias de sus partes, alquileres que cobra, herencias, venta de bienes | Impuesto, comida, alquiler, gasto de vida, mantenimiento de casas, compras de firmas y casas |
| Firma | `caja` | Ventas, exportación (agro e industria), publicidad (medios), fondos del estado (medios) | Sueldos, ganancias a dueños, inversión, compras, publicidad, mantenimiento de locales |
| Estado | `reserva` | Impuesto | Nómina, pensiones, ayuda, garantía, acogida, obras, mantenimiento público, importación, fondos de prensa |

**Calendario diario:** producción → comercio exterior → precio → compras de comida → gasto de vida → consumo.

**Día de pago** (orden único, el mismo de MOTOR §2 paso 10):

1. **Estado paga**, con el orden de prioridad de §10: pensiones, nómina y ayuda (a hogares), mantenimiento y operación de obras (a constructoras) y fondos de prensa (a medios). Usa la reserva que dejó el período anterior; el impuesto retenido en este día de pago entra a la reserva y se usa desde el siguiente. Si falta plata, evalúa el impago (§10).
2. **Firmas liquidan** sueldos y ganancias, con las ventas del período y lo que cobraron del estado en el paso 1.
3. **Hogares pagan** alquileres y mantenimiento de sus casas.
4. Mercado de vivienda → mercado de compras → quiebras → inversión, emprendimientos y construcción.
5. Piloto automático del estado, si está encendido (MUNDO §9) → medios (ingresos, línea editorial, cierre).

Las obras se pagan en el momento de ordenarlas (§10), no el día de pago.

## 3. Hogar

**Ingreso del período:** suma de lo que cobra cada miembro el día de pago, con el impuesto retenido.

| Rol | Ingreso |
|---|---|
| Empleado privado | Su sueldo de la firma (§5) |
| Dueño | Su % de la ganancia de la firma, aunque no trabaje en ella o esté fuera de su puesto |
| Gerente sin partes | Sueldo de gerente de su firma **[propuesta]** |
| Dueño de casa | Alquileres cobrados |
| Público | `salario_publico` (no se ajusta solo con la inflación) |
| Periodista | Sueldo de su medio, sin productividad |
| Jubilado | `pension_base` + ayuda social |
| Desempleado | Ayuda social |
| Menor | Nada: su comida la paga el hogar (el estado si el hogar no puede, o acogida) |

**Impuesto:** una tasa sobre todo ingreso, salvo pensiones y ayuda social. Los dueños pagan sobre su ganancia y sobre los alquileres. La herencia no paga impuesto en la base.

**Gasto diario del hogar,** en este orden:

1. **Comida:** recompra de despensa (§6). Si no alcanza, la garantía paga su % del faltante; el resto no se compra.
2. **Gasto de vida** = `propension_gasto` ponderada de sus adultos / 100 × ingreso neto diario del último período + `k_riqueza` × (`dinero` − colchón), con el segundo término solo si es positivo. Colchón = `colchon_dias` × gasto diario en comida. Se reparte entre categorías de gasto y va a las firmas que las venden, según precio y costo de ruta (§6b).
3. **Ahorro:** lo que sobra queda en `dinero`.

El **alquiler** y el mantenimiento de la casa propia se pagan el día de pago (§7). El hogar en **calle** no conserva despensa y paga `recargo_calle` más por la comida.

**Poder adquisitivo** (0-100): sale de `dinero` e ingreso neto del hogar frente al precio y el alquiler; entra en la satisfacción de sus miembros.

## 4. Firmas

Una sola entidad para todos los rubros.

```json
{ "id": "f_3", "rubro": "comercio", "nombre": "Kiosco Pepe",
  "partes": [{ "npc": "npc_12", "pct": 70 }, { "firma": "f_9", "pct": 30 }],
  "gerente": "npc_12", "locales": ["p_este_3"], "empleados": ["npc_30"],
  "ventas": 0, "caja": 80, "factor": 1.0, "cuota_zona": 0.12, "periodos_en_perdida": 0 }
```

| Rubro | Qué hace | Puestos que genera |
|---|---|---|
| `agro` | Campos: producen comida y la venden o exportan; son dueñas del `stock` | Agricultores, técnicos |
| `industria` | Fábricas: producen bienes y los venden a comercio o los exportan | Obreros, técnicos |
| `comercio` | Almacenes, supermercados, tiendas y kioscos: venden comida y bienes | Obreros, comerciantes |
| `gastronomia` | Restoranes y bares: venden gastronomía | Obreros, comerciantes |
| `servicios` | Peluquerías, talleres y gimnasios: venden servicios | Obreros, comerciantes |
| `entretenimiento` | Cines, teatros y clubes: venden entretenimiento | Obreros, comerciantes |
| `construccion` | Levanta casas, locales, vías y obras; repara casas | Obreros, constructores |
| `inmobiliaria` | Es dueña de casas y cobra alquiler | Inmobiliarios |
| `medio` | Publica noticias (CAOS_PRENSA §7) | Periodistas |

- Los **locales** de la firma son sus parcelas (EDIFICIOS §4). Una firma sin locales no vende.
- Las `partes` suman 100 y pueden tenerlas personas u otras firmas (holding o compra parcial **[propuesta]**). Una firma sin dueño pasa al estado (§9).

## 5. Ventas, sueldos y ganancia

Cada día de pago, por firma:

1. **Fondo de sueldos** = `parte_sueldos` × ventas del período.
2. **Contrata** de a uno si hay vacantes (los puestos los dan los locales) y el fondo alcanza para pagar la referencia de todos más la del nuevo, hasta `max_contrataciones_por_periodo`. El nuevo cobra desde el período siguiente.
3. `factor` = fondo ÷ sueldos de referencia, con tope `factor_max`. Referencia = (min + `ingreso_pos`/100 × (max − min)) × productividad/100, con el rango del rol.
4. Cada empleado cobra referencia × `factor`.
5. **Ganancia** = ventas − sueldos. Se reparte: `pct_reinversion` queda en la **caja** y el resto va a los dueños por su `pct`. Una firma sin dueños la deja entera en la caja.
6. Las ventas vuelven a 0.

| `factor` | Qué pasa | Evento |
|---|---|---|
| > 1 | Aumento (antes contrató si pudo) | `empresa_aumento` |
| < 1 | Recorte; no contrata | `empresa_recorte` |
| < `piso_sueldo_pct`/100 | Despide a los que sobran para quedar sobre el piso, al ritmo `max_pase_desempleo_por_dia` (en `agro`, primero los técnicos) | `empresa_despido` |

- **Sin ganancia:** si ventas < sueldos mínimos, la firma paga con su caja el faltante del fondo; si la caja no alcanza, el recorte es el de la tabla.
- **Producción de agro:** Σ producción de cada agricultor × productividad/100 × (1 + `k_tecnificacion` × técnicos efectivos), con técnicos efectivos = min(técnicos, agricultores × `tecnicos_por_agricultor`). Va al `stock` de la firma que la produjo.
- **Mantenimiento de locales:** lo paga la firma de su caja el día de pago, a firmas de construcción. Sin pago, el local pierde estado y puestos.
- **Publicidad:** cada firma (salvo los medios) destina `pct_publicidad` de sus ventas a medios, repartido por alcance × credibilidad (CAOS_PRENSA §7). Es plata que circula.
- **Gerente:** el empresario que dirige. Si no tiene partes, cobra sueldo de gerente de la firma.
- Cada evento lleva origen `firma:<id>/respuesta` y como causa el evento que más movió las ventas (clima, precio, compra, quiebra de un cliente, control) o ninguno.

## 6. Comida y mercado

- **Stock:** la producción va al `stock` de cada firma `agro`, con tope `silo_dias` de consumo de la zona (más `silo_extra_dias` por cada silo, EDIFICIOS §5); lo que excede se pierde.
- **Despensa del hogar:** cada persona consume un día por día. Su objetivo = `objetivo_base_dias` × (1 + `k_prudencia` × (1 − valentía/100) + `k_miedo` × miedo/100), con tope `despensa_max_dias`; la acción `acapara` le suma días. Con la despensa bajo `umbral_recompra_dias`, el hogar recompra hasta el objetivo. Si el stock no alcanza para todos, se reparte parejo. De acá salen las corridas: miedo → compra de más → stock bajo → precio sube.
- **Dónde compra:** cada hogar elige vendedor entre las firmas de comercio de su zona y las cercanas por precio y costo de ruta (MAPA §6). La firma cobra y paga su parte a las `agro` por la comida que vendió, con `margen_comercial_pct`; el resto es de comercio.
- **Precio** de cada firma = min(precio de mercado de su zona, tope), con precio de mercado = `precio_base` × escasez (según días de stock de la zona) × clima × (1 + inflación/100) × (1 + `margen_poder` de la firma). El tope es un control (`tope_precio`).
- **Poder de precio:** el `margen_poder` de una firma sube con su cuota en la zona sobre `umbral_poder_precio`, hasta `margen_max`. Es el efecto del monopolio (§9).
- **Competencia:** si una firma sube su precio, los hogares compran más en otras; si el precio de todas sube, caen el gasto de vida y el consumo. Si el margen del rubro es alto, el mercado atrae emprendimientos (§8).
- **Retención:** una medida de actor (ACTORES.md) puede hacer que una firma `agro` venda solo `pct_retencion` de su stock por día; el precio sube por escasez aunque haya comida guardada.
- **Quién paga la comida de quien no puede:** el hogar la de sus menores; si no alcanza, el estado; la de los adultos, la garantía en su %.

## 6b. Categorías de gasto y bienes

- **Categorías del gasto de vida:** `bienes`, `gastronomia`, `servicios` y `entretenimiento`. La comida va aparte (§6).
- **Reparto del hogar:** el gasto de vida se reparte con pesos base del preset, desplazados por la riqueza: con más ingreso y `dinero` el hogar gasta más en gastronomía y entretenimiento (`k_lujo`) y menos en bienes básicos. La personalidad lo ajusta (más codicia, más ahorro; más resiliencia, más entretenimiento) **[propuesta]**.
- **Quién vende cada categoría:** bienes → comercio (tienda, supermercado, kiosco); gastronomía → restoranes y bares; servicios → peluquerías, talleres y gimnasios; entretenimiento → cines, teatros y clubes. Cada hogar elige vendedor por precio y costo de ruta, limitado por la capacidad diaria de ventas de los locales.
- **Cadena de bienes:** una fábrica produce bienes hasta su capacidad (obreros × productividad × técnicos efectivos) y los vende a comercio con `margen_comercial_pct`, o los exporta. Si la industria local no alcanza, el comercio **importa** bienes al precio externo (el dinero sale del mundo, §12). Servicios, gastronomía y entretenimiento no tienen insumos: pagan sueldos y reparten ganancia.
- **Demanda no cubierta:** la categoría con demanda sin vendedor, o con margen alto y cuota baja, atrae emprendimientos (§8). Si una categoría no tiene oferta, el gasto de vida de esa categoría se ahorra.

## 7. Vivienda: alquiler, compra y mantenimiento

- **Alquiler** de una casa = `alquiler_base` × estado de la casa/100 × índice de demanda de la zona **[propuesta]**. Lo paga el hogar al dueño el día de pago; circula.
- **Mantenimiento:** el dueño paga la reparación de la casa a una firma de construcción (de su dinero o su caja). Con la casa en mal estado baja el alquiler y la satisfacción.
- **Propietario habitante:** no paga alquiler, solo mantenimiento.
- **Mercado de vivienda (cada día de pago):**
  1. Los hogares que buscan casa (calle, hacinados, con alquiler sobre `pct_alquiler_max` de su ingreso) se postulan a las casas libres de su zona o vecinas.
  2. Cada casa va al postulante que más puede pagar; si no hay postulante, el dueño baja el alquiler un `paso_alquiler` por período.
  3. El hogar que no paga acumula `periodos_sin_pagar`; al llegar a `periodos_sin_pagar_alquiler`, desalojo (evento `desalojo`).
- **Compra de casa:** un hogar con ahorro suficiente le compra la casa a su dueño (precio = `multiplo_casa` × alquiler anual), o a otro dueño. El dinero circula.
- **Venta forzada:** un dueño sin caja ni dinero que no puede mantener sus casas las vende a firmas inmobiliarias o a hogares.

## 8. Crecer, emprender y construir

- **Crecer:** una firma con `factor` > 1 durante `periodos_para_invertir` y caja suficiente construye un local o un campo en una parcela libre comercial o agrícola. Lo hace una firma de construcción y la paga su caja.
- **Emprender:** una persona (adulta, con ahorro sobre `ahorro_min_emprender` y alta `propension_emprender`) abre una firma chica en un rubro con demanda no cubierta (por categoría de gasto, margen alto, cuota baja) en una parcela libre del tipo correcto de su zona o vecina. Ella es la dueña y gerente. Puede ser desempleada, empleada o jubilada.
- **Construir vivienda:** si `calle_pct` o el hacinamiento de una zona superan su umbral, una firma de construcción o inmobiliaria levanta casas en parcelas residenciales libres, si el alquiler esperado recupera la inversión en `periodos_recupero`. Una firma o un hogar rico construyen también para su propio uso.
- **Construcción sin capacidad:** si la obra directa (§10) o la demanda de obras sin atender supera `umbral_obra_sin_capacidad` durante `periodos_obra_sin_capacidad`, cuenta como demanda no cubierta del rubro `construccion` y atrae emprendimientos, igual que una categoría de gasto sin vendedor.
- **Fundar un medio:** una persona con formación de periodista y ahorro, o una firma con caja alta, funda un medio. La línea editorial sale de sus dueños (CAOS_PRENSA §7).
- **Suelo [propuesta]:** los lotes `libre` son del estado. Quien construye lo compra al `precio_lote` = `precio_base_lote`[clase] × (1 + `k_acceso` × accesibilidad), con accesibilidad 0-1 según la cercanía por ruta al centro comercial de la ciudad. El pago entra a la reserva. Sin mercado de suelo ni especulación en esta etapa; el lote se vende junto con su edificio.
- **Costo de obra por terreno:** el costo de construir en un lote se multiplica por el factor de su terreno (MAPA §3b).
- Cada hecho tiene origen y causa (por ejemplo, "abrió un restorán porque la zona tenía un solo almacén y margen alto").

## 9. Compras, monopolio, fusión y quiebra

**Compra de una firma** (solo el día de pago, por zona):

1. Una persona, hogar o firma con dinero o caja suficiente hace una oferta por una firma ajena de su rubro o de otro.
2. **Precio** = `multiplo_compra` × ganancia media de los últimos `periodos_valuacion`; si la ganancia es cero, un múltiplo de la caja y el valor de sus locales.
3. **Acepta** quien pierde menos vendiendo frente a seguir. Con varias ofertas, gana la mayor.
4. El comprador paga a los dueños (el dinero circula) y hereda locales, empleados y contratos, con deuda cero. Puede **fusionar** (absorber a la firma) o dejarla como filial.
5. Tope: cada comprador hace como máximo `max_compras_por_periodo`.

**Monopolio:** la `cuota_zona` es la cuota de ventas por rubro y zona. Pasado `umbral_poder_precio`, el margen del vendedor sube hasta `margen_max`. No hay tope automático. **La fricción es del mercado:** al subir el margen, los hogares recortan gasto de vida, el rubro atrae emprendedores y las firmas rivales se fortalecen; un monopolista también paga más sueldos de referencia y más locales a mantener. Un monopolio de medios se trata en CAOS_PRENSA §7.

**Quiebra:** con `caja` negativa durante `periodos_para_quebrar` períodos, la firma cierra:

1. Despide a todos, al ritmo `max_pase_desempleo_por_dia`.
2. Los dueños pierden sus partes.
3. La caja restante, si hay, va a los empleados como indemnización proporcional a su sueldo; si no hay caja, no hay deuda ni acreedores.
4. Sus locales quedan libres o salen a remate (los compra otra firma o el estado, a valor de parcela). Si era la última constructora con capacidad, el estado pasa a obra directa (§10).
5. Emite `firma_quiebra` con causa en el evento que más bajó sus ventas.

**Herencia de partes:** al morir un dueño, sus partes pasan al cónyuge y los hijos en partes iguales; sin herederos, al estado, que las vende por remate (a hogares o firmas).

**Firma sin dueño:** su ganancia va a la caja; si la caja supera `caja_max_sin_dueno`, el excedente pasa a la reserva del estado.

## 10. Estado

- **Entra:** el impuesto, más herencias sin herederos, remates de firmas y locales, excedente de firmas sin dueño y venta de lotes.
- **Sale cada día** (de la `reserva`): garantía, importaciones y la comida de menores solo si el hogar no puede o el menor está en acogida (costo diario de acogida).
- **Sale al ordenar una obra:** su costo, de una vez, a una firma de construcción. Si la reserva no alcanza, no se puede ordenar. Rige para edificios y vías (EDIFICIOS §3 y §3b).
- **Obra directa:** si no hay ninguna firma de construcción con capacidad de obra libre (quebraron o están saturadas), el estado ejecuta la obra por su cuenta con costo × `k_obra_directa` (mayor que 1) y días × `k_dias_obra_directa`. El pago no sale del mundo: se reparte como jornales entre los hogares con adultos desempleados. Es el plan B; la obra directa sostenida atrae emprendimientos de construcción (§8).
- **Sale el día de pago** (paso 1 de §2), en este orden de prioridad: pensiones → nómina → ayuda social → mantenimiento de edificios y vías y operación de obras (a firmas de construcción) → fondos de prensa (a los medios).
- **Si no alcanza:** se paga en ese orden y lo que queda se prorratea. Una importación se reduce a lo que cubre la reserva; la garantía se prorratea; la comida de menores en acogida se paga siempre, antes que nada.
- **Impago:** cualquier faltante emite `impago {faltante, alcanza_nomina}` y dura hasta el primer día de pago sin faltante (`impago_fin`). Si alcanza la nómina, los públicos pierden satisfacción y productividad y se dispara la huelga (CAOS_PRENSA §3).
- **Saldo del período** = ingresos − gastos, sin las importaciones (se ven aparte).
- **Banco central:** el estado es el banco central: la reserva y la emisión (`fiscal`) son su única función monetaria. No hay bancos privados ni crédito.
- **Sin gobernador:** rige el piloto automático (MUNDO §9): ajusta `tasa_impuesto` dentro de una banda, frena la obra según la reserva y el mantenimiento, y sostiene servicios y vías. No toca salarios ni ayuda.

## 11. Comercio exterior

- **Capacidad diaria** = comerciantes × `intercambio_por_comerciante`. **Precio externo** = `precio_base` × (1 + inflación/100) × factor de clima; comprar cuesta más que vender.
- **Importar:** el estado compra comida al precio externo, sin tope, con la reserva; la comida va al stock. El comercio importa bienes cuando la industria local no alcanza (§6b).
- **Exportar:** las firmas `agro` e `industria` venden y cobran ellas, sin bajar de `stock_min_exportar_dias`.
- Los medios no cobran del exterior: viven de publicidad y fondos del estado.

## 12. Entradas y salidas del mundo

| Entra | Sale |
|---|---|
| Exportación (agro e industria) | Importación del estado |
| Emisión (solo `fiscal`) | Importación privada de bienes del comercio |
| Dinero que traen los migrantes | Dinero que se llevan los emigrantes |

Todo lo demás circula: fondos del estado a los medios, sueldos, alquileres, compras, herencias, publicidad, indemnizaciones y remates. El dinero de un hogar sin herederos y el excedente de una firma sin dueño **no salen del mundo**: pasan a la reserva del estado. Si el dinero total deriva, se corrige calibrando.

## 13. Cadenas que salen solas

- **Recorte que se contagia:** más impuesto → menos gasto de vida → comercio recorta → los obreros gastan menos.
- **El estado como cliente:** obras y mantenimiento le dan ventas a las constructoras; dejar de construir las puede fundir y dejar obreros sin trabajo.
- **Comida barata:** tope bajo → despensas llenas → stock vacío → `agro` recorta → menos producción.
- **Sequía:** menos producción → precio sube → garantía más cara → reserva baja → impago y huelga.
- **Pánico:** noticia alarmista → miedo → corrida → precio sube → hambre → protesta.
- **Auge:** buen período → contratan → menos desempleo → más consumo → más recaudación.
- **Desigualdad:** los dueños acumulan y la satisfacción se separa por grupo.
- **Calle que se contagia:** desempleo → no paga alquiler → desalojo → calle → salud y productividad bajan → más desempleo.
- **Burbuja inmobiliaria:** demanda sube → alquiler sube → menos hogares pueden pagar → más calle y hacinamiento → construcción responde → alquiler baja.
- **Fusión que crece:** firma con caja compra a otras → cuota sube → margen sube → comida cara → hogares gastan menos → nacen competidores.
- **Industria que se cae:** la fábrica quiebra → el comercio importa bienes más caros → el dinero sale del mundo → menos gasto de vida local.
- **Ruta cortada:** una vía deteriorada alarga rutas → los hogares compran en otro lado y llegan tarde al trabajo → ventas y productividad bajan en su frente.
- **Quiebra en cadena:** una firma grande cierra → despidos → menos gasto de vida → otras firmas recortan o quiebran → los dueños pierden sus bienes.
- **Concentración por herencia:** las partes pasan entre generaciones y la riqueza se concentra o se reparte según las familias.
- **Ciudad que no se expande:** parcelas libres escasas → alquiler y precio del suelo suben → más calle y menos negocios nuevos → el estado abre vías (si le alcanza la reserva) → la oferta de suelo responde.
- **Baby boom:** buena economía y casas libres → natalidad sube → más menores → más gasto en comida y presión de vivienda.
- **Emprendimiento anticíclico:** la gente sin empleo abre kioscos → bajan el desempleo y la calle → compiten con firmas grandes.
- **Medios que quiebran:** menos ventas → menos publicidad → un medio cierra → la gente se informa menos → un aviso llega peor (CAOS_PRENSA §7).

## 14. Extensión `fiscal` (M4)

Agrega la emisión y la inflación dinámica. Con saldo negativo, antes del impago se emite hasta el tope autorizado (`tope_emision_pct`). La inflación sube con la emisión relativa a la economía y decae sin ella; encarece la comida y devalúa la reserva y el dinero. Sin `fiscal`, la inflación es el valor fijo del preset.

El crédito queda fuera hasta especificarlo: no hay rubro `banco` ni `oficina_banco` en el catálogo.

## 15. Lo que el resto del juego lee

```ts
interface SalidaEconomica {
  accesoComida: Record<hogarId, number>        // 0 a 1
  poderAdquisitivo: Record<hogarId, number>    // 0 a 100
  precioAlimento: Record<zonaId, number>
  alquilerMedio: Record<zonaId, number>
  cuotaMercado: Record<`${rubro}:${zonaId}`, { firma: string, cuota: number }>
  saldo: number
  inflacion: number
}
```

## 16. Arranque y validación

El generador (MUNDO §12) ajusta `precio_base`, los rangos de sueldo, `pension_base`, `parte_sueldos`, `alquiler_base`, el mantenimiento de los locales y casas y `pct_publicidad` para que el primer período cierre: todas las firmas con factor 1 y caja ≥ 0, el estado con saldo chico positivo, cada hogar con ingreso por encima de su comida y su alquiler, producción por encima del consumo con margen para absorber nacimientos e internaciones, y cada hogar con su colchón.

El agente de prototipo valida **que el mundo se sostiene**, sin calibrar valores finos:

- 30 días sin tocar nada, sin clima ni caos: sin quiebras, sin desalojos, dinero total y stock estables.
- 50 años de juego: población que se sostiene o se ajusta sola, calle acotada, dinero que no deriva.
- Cada cadena de la sección 13 aparece al forzar su causa.
- Ninguna firma queda con todo el mercado en pocos años, sin fricción que lo impida.
- La demanda de suelo dispara la construcción de vías: la ciudad crece cuando hace falta y no se frena sin causa explicable.
- Los medios sobreviven, o cierran por una causa explicable.
- **Piloto automático sostenible:** en 50 años sin gobernador la reserva no cae a impago sostenido salvo que la tasa esté en el tope de la banda; el mantenimiento total no pasa `pct_mant_max`; si todas las constructoras quiebran, la obra directa mantiene la reparación y la expansión.
- El tamaño del sector público y de los jubilados del preset no obliga a un impuesto desproporcionado.
