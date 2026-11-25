# Economía completa (BORRADOR v0.2)

> El circuito del dinero y de la comida del nivel 1, de punta a punta: NPCs, empresas, estado, medios y exterior. Reemplaza el borrador EMPRESAS.md. Estados: ESTADOS.md. Palancas: GOBERNADOR.md. Valores: CALIBRACION.md. **[decidido]** viene de ESTADOS v0.39; **[propuesta]** es base para pulir.

---

## 1. Principios

1. **Todo peso tiene origen y destino.** El dinero solo entra o sale del mundo por puntos fijos (sección 9). Todo lo demás circula. El motor puede verificarlo cada día: dinero total de hoy = dinero de ayer + entradas − salidas.
2. **Un solo calendario [decidido].** Lo que pasa cada día (producir, comer, gastar) y lo que pasa en el **día de pago**, cada `periodo_dias` (cobrar sueldos, pagar impuestos, liquidar). Reemplaza a `periodo_fiscal_dias` y `periodo_pago_dias`: es el mismo período para todos.
3. **Nadie paga lo que no tiene.** Ni el estado, ni las empresas, ni los NPCs se endeudan. Si no alcanza, se recorta según una regla fija.
4. **Lo que se ahorra vuelve.** El NPC que acumula dinero de más lo gasta de a poco (sección 4). Sin esto, el dinero se estanca y la economía se seca sola.
5. **Cada actor reacciona con una regla simple.** De esas reacciones encadenadas salen las crisis, sin guiones.

## 2. Actores y dónde está el dinero

| Actor | Dónde guarda el dinero | De dónde le entra | A dónde le sale |
|---|---|---|---|
| NPC | `dinero` | Sueldo, salario público, pensión, ayuda social, ganancia (dueños), garantía | Impuesto, comida, gasto de vida |
| Empresa de alimento | Ventas del período (se vacían en cada día de pago) | Su parte de la venta de comida, exportación | Sueldos (agricultores, técnicos), ganancia (empresario) |
| Empresa de comercio | Ventas del período | Margen de la comida, gasto de vida, operación de servicios | Sueldos (obreros), ganancia (comerciantes) |
| Estado | `reserva` | Impuesto | Nómina, pensiones, ayuda social, garantía, comida de los menores, operación de servicios, prensa, importación |
| Medios | No guardan (nivel 1) | Ingresos propios (exterior), prensa (estado) | Sueldo de los periodistas; el resto sale |
| Exterior | — | Importación, lo que no gastan los medios, ganancia sin dueño | Exportación, ingresos propios de los medios |

## 3. Calendario

**Cada día**, en este orden:

1. **Producción:** los agricultores producen comida al `stock` (sección 7).
2. **Comercio exterior:** importación (el estado paga de la `reserva`) o exportación (la empresa de alimento cobra), según el escalón.
3. **Precio:** se recalcula con el stock, el clima y el tope (ESTADOS §4).
4. **Compras de comida:** cada NPC que necesita recompra su despensa con su `dinero`. Si no le alcanza, la garantía paga su parte del faltante desde la `reserva`. La comida de los menores la paga el estado. Todo el dinero de la comida va a las empresas: el margen a comercio y el resto a alimento.
5. **Gasto de vida:** cada NPC gasta en otros bienes (sección 4). Va a comercio.
6. **Consumo:** cada NPC come un día de su despensa; si no tiene, sube el hambre.

**Cada día de pago** (cada `periodo_dias`), en este orden:

1. **Empresas:** contratan si pueden, reparten lo vendido en el período entre sueldos y ganancia, y despiden si hace falta (sección 5).
2. **Estado:** paga nómina, pensiones, ayuda social, operación de servicios y prensa desde la `reserva`, en el orden de la sección 6.
3. **Impuesto:** se retiene en cada pago (sueldo, salario público, ganancia) y entra a la `reserva` en el mismo momento.
4. **Medios:** cobran prensa e ingresos propios y pagan a los periodistas (sección 8).
5. **Evaluaciones:** impago (sección 6).

## 4. El NPC

**Ingreso del período** según su rol (ESTADOS §12): sueldo de su empresa, salario público, pensión, ayuda social o ganancia. Lo cobra en el día de pago, ya con el impuesto retenido.

**Gasto diario** **[propuesta]**, en este orden:

1. **Comida:** recompra de despensa (ESTADOS §4). Es lo primero.
2. **Gasto de vida** = `propension_gasto` / 100 × ingreso neto diario (el del último período ÷ `periodo_dias`) + `k_riqueza` × (`dinero` − colchón), con el segundo término solo si es positivo.
   - **Colchón** = `colchon_dias` × lo que gasta en comida por día. Es la plata que el NPC quiere tener guardada.
   - El término de riqueza es lo que hace que lo ahorrado vuelva a circular: el dueño que gana mucho gasta más, y eso vuelve a comercio como ventas y como sueldos de obreros.
   - Nunca gasta más de lo que tiene y nunca toca la plata de la comida del día.
3. **Ahorro:** lo que sobra queda en `dinero`.

**Cuando no le alcanza para la comida:** la garantía paga el % fijado del faltante. El resto no se compra y la despensa baja. Con la despensa en 0, el hambre sube.

**Qué siente:** el `poder_adquisitivo` (ESTADOS §3.1) sale de su `dinero` y su ingreso neto frente al precio de la comida, y entra en la satisfacción.

## 5. Las empresas

**[decidido]** Dos empresas, siempre presentes: **alimento** (dueño: el empresario) y **comercio** (socios: los comerciantes, en partes iguales).

**Sueldo de referencia** de cada empleado = (min + `ingreso_pos` / 100 × (max − min)) × productividad / 100, con el rango de su rol (ESTADOS §2). Es el peso de cada uno en el reparto, no un monto fijo.

**Sueldos: reparto de las ventas [decidido].** Cada empresa destina una parte fija de lo que vende a sueldos (`parte_sueldos`, una por empresa) y el resto es de los dueños. Así los sueldos suben y bajan con las ventas, en las dos direcciones, y la empresa nunca paga más de lo que tiene.

En cada día de pago:

1. **Fondo de sueldos** = `parte_sueldos` × ventas del período.
2. **Contratación:** si hay vacantes y el fondo alcanza para pagar a todos su referencia más la referencia de uno nuevo, contrata de a uno mientras le alcance, hasta `max_contrataciones_por_periodo` y el tope del rol. Los nuevos cobran desde el período siguiente.
3. **`factor`** = fondo de sueldos ÷ sueldos de referencia de los empleados actuales, con tope `factor_max`.
4. Cada empleado cobra su referencia × `factor`.
5. **Ganancia** = ventas − sueldos pagados. Va a los dueños; sin dueños, sale del mundo. Nunca es negativa.
6. Las ventas del período vuelven a 0: la empresa no guarda caja.

**Qué ve el mundo según el `factor`** (regla fija, sin sorteo):

| `factor` | Qué pasa | Evento |
|---|---|---|
| > 1 | **Aumento**: cobran más que su referencia. Antes contrató si podía | `empresa_aumento {empresa, factor}` (solo cuando cambia de tramo) |
| = 1 | Normal | — |
| < 1 | **Recorte**: cobran menos. No contrata | `empresa_recorte {empresa, factor}` |
| < `piso_sueldo_pct` / 100 | **Despido**: los que sobran para que el próximo período el factor quede sobre el piso pasan a desempleados, al ritmo `max_pase_desempleo_por_dia` | `empresa_despido {empresa, cantidad}` |

- **Orden en el auge:** primero contrata (baja el desempleo) y solo lo que sobra sube los sueldos. Con `factor_max`, lo que pasa de ese tope va a los dueños y vuelve por el término de riqueza.
- **Al generar el mundo** el generador fija `parte_sueldos` de cada empresa para que el `factor` inicial sea 1 (sección 11).
- En alimento se despide primero a los técnicos (sin agricultores no hay comida).
- Cada evento lleva `origen` `empresa:<id>/respuesta` y su `causa` (ESTADOS §8): el evento que más movió las ventas (cambio de `precio_maximo` o de `impuesto`, fenómeno del clima) o ninguno si no hay uno claro.
- No hacen falta `dias_respuesta`, caja ni tabla de respuestas: cada día de pago se recalcula todo.

**Qué vende cada una:**

- **Alimento:** su parte de cada venta de comida (precio − margen comercial) y lo que exporta.
- **Comercio:** el margen sobre cada venta de comida, todo el gasto de vida y la operación de servicios del estado (los insumos de policía, hospital y obras se compran acá) **[propuesta]**.

## 6. El estado

**Entra:** el impuesto, retenido en cada pago a un NPC (sueldos, salarios públicos, ganancias). Los sin ingreso no pagan.

**Sale a diario** (desde la `reserva`): la garantía alimentaria, la comida de los menores y las importaciones.

**Sale en el día de pago,** en este orden de prioridad:

1. Pensiones.
2. Nómina (salario público × puestos cubiertos).
3. Ayuda social.
4. Operación de servicios (a comercio).
5. Prensa (a los medios).

**Si la reserva no alcanza:**

- **En el día de pago:** se paga en ese orden hasta donde alcance y lo que queda se prorratea. El faltante emite `impago {faltante, alcanza_nomina}` (ESTADOS §12). Si alcanza la nómina, se dispara la huelga.
- **En un día cualquiera:** la importación se reduce a lo que cubre la reserva. La garantía se prorratea y su faltante suma al impago del período. La comida de los menores se paga siempre: si hace falta, sale antes que cualquier otro gasto del período.
- El impago dura hasta el primer día de pago sin faltante (`impago_fin`).

**Saldo del período** = ingresos − todos los gastos del período (sin las importaciones, que se ven aparte). Es lo que muestra la barra superior.

## 7. La comida

- **Producción diaria** = Σ producción de cada agricultor × productividad / 100 × (1 + `k_tecnificacion` × técnicos efectivos), con técnicos efectivos = min(técnicos, agricultores × `tecnicos_por_agricultor`). Va al `stock`, con tope `silo_dias`.
- **Consumo:** un día de despensa por NPC por día, incluidos los menores.
- **Precio:** ESTADOS §4 (escasez según `dias_stock`, clima, inflación y el tope de `precio_maximo`).
- **Corridas:** el miedo sube el objetivo de despensa, la gente compra de más, el stock baja y el precio sube (ESTADOS §4).
- **Exportar** saca stock y le da plata a alimento; nunca deja el stock por debajo de `stock_min_exportar_dias`. **Importar** suma stock pagado con la reserva.

## 8. Los medios

- **[propuesta]** Cada día de pago, cada medio cobra sus `ingresos_propios` (vienen del exterior) y su parte de la palanca `prensa`, y paga los sueldos de sus periodistas (rango de su rol). Lo que sobra sale del mundo; si no alcanza, los sueldos se prorratean.
- Así la palanca `prensa` tiene un efecto económico chico (sostiene a los periodistas) además del alcance y la dependencia (ESTADOS §6).

## 9. Entradas y salidas del mundo

| Entra | Sale |
|---|---|
| Exportación de comida (a alimento) | Importación de comida (desde la reserva) |
| Ingresos propios de los medios | Lo que los medios no gastan |
| Emisión (solo con `fiscal`) | Ganancia de una empresa sin dueño |

Todo lo demás circula. Si el dinero total deriva, se corrige calibrando, no con una regla nueva.

## 10. Cadenas que hacen sentir vivo al mundo

Cada una sale de las reglas de arriba, sin código especial:

- **Recorte que se contagia:** subir el `impuesto` → menos gasto de vida → comercio vende menos → recorta a los obreros → ellos gastan menos → comercio vende todavía menos.
- **El estado como cliente:** bajar el nivel de un servicio ahorra nómina y operación, pero comercio pierde ventas y los empleados públicos que quedan sin puesto pasan a desempleados.
- **Precio máximo:** comida barata hoy → la gente llena la despensa → el stock se vacía → alimento cobra menos por unidad → recorta a los agricultores → producen menos (menos satisfacción, menos productividad).
- **Sequía:** menos producción → precio sube → los que tienen poco no llegan → la garantía cuesta más → la reserva baja → si se agota, impago y huelga.
- **Pánico:** noticia alarmista → miedo → corrida de compras → precio sube → más gente sin plata para comer → descontento → protesta.
- **Auge:** buen período → empresas contratan → menos desempleo → más consumo → más recaudación → el gobernador puede subir servicios.
- **Desigualdad:** los dueños acumulan; si la ganancia de comercio crece mucho y los obreros no, la satisfacción se separa por grupo (visible en los resúmenes por sector).

## 11. Arranque balanceado

Al generar el mundo, todo encaja (IDEA §5). El generador ajusta `precio_base`, los rangos de sueldo, la `pension_base` y la operación de cada nivel para que se cumplan estas cuentas en el primer período, sin intervención del jugador:

1. **Alimento:** ventas de comida × (1 − margen) ≥ sueldos de agricultores y técnicos, con ganancia positiva.
2. **Comercio:** margen de la comida + gasto de vida + operación ≥ sueldos de obreros, con ganancia positiva.
3. **Estado:** impuesto ≈ nómina + pensiones + ayuda + comida de los menores + operación + prensa, con un saldo chico positivo.
4. **NPC empleado:** ingreso neto diario > comida diaria, con margen para gasto de vida.
5. **Comida:** producción diaria ≈ consumo diario, con stock inicial cerca de su objetivo.
6. **Dinero inicial:** cada NPC arranca con su colchón, para llegar al primer día de pago.

Chequeo del agente de prototipo: 30 días sin tocar nada, sin clima ni caos → sin recortes, sin impago, dinero total estable y stock estable.

## 12. Qué valida el agente de prototipo

- Que el dinero total se conserve (sección 9) y que el dinero de los NPCs se estabilice con el término de riqueza.
- Que el arranque cumpla la sección 11 durante 30 días sin intervención.
- Que un cambio de `impuesto`, `precio_maximo` o nivel de servicio mueva los sueldos y el empleo en el sentido de la sección 10.
- Que el porcentaje de empleados públicos y jubilados del preset no obligue a un impuesto desproporcionado para cerrar la cuenta del estado.

## 13. Cambios para CALIBRACION

- **Sale:** `periodo_fiscal_dias`, `periodo_pago_dias` y `dias_respuesta`.
- **Entra:** `periodo_dias`, `k_riqueza`, `colchon_dias`, `parte_sueldos` (por empresa, la fija el generador), `factor_max`, `max_contrataciones_por_periodo` y `stock_min_exportar_dias`.
- **Sigue:** `piso_sueldo_pct`, `max_pase_desempleo_por_dia`, `margen_comercial_pct`, `tope_privado`, `k_tecnificacion`, `tecnicos_por_agricultor`, `silo_dias`, `pension_base` y los rangos de sueldo.

## 14. Preguntas abiertas

Ninguna. Cerrado en esta versión: un solo período de pago para todos y sueldos como reparto de las ventas (suben y bajan con ellas).
