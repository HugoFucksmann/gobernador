# Economía (v1.0)

> El circuito del dinero y de la comida: NPCs, empresas, estado, medios y exterior. NPCs y roles: MUNDO.md. Lo que el gobernador mueve: CONTROLES.md. Valores: CALIBRACION.md.

---

## 1. Principios

1. **Todo peso tiene origen y destino.** El dinero entra o sale del mundo solo por los puntos de la sección 8; el resto circula. El motor puede verificarlo cada día.
2. **Un solo calendario:** lo diario (producir, comer, gastar) y el **día de pago** cada `periodo_dias`, igual para empresas, estado y medios.
3. **Nadie paga lo que no tiene.** Nadie se endeuda: si no alcanza, se recorta con una regla fija.
4. **Lo que se ahorra vuelve:** el NPC con plata de más la gasta de a poco (sección 3).

## 2. Actores

| Actor | Guarda | Le entra | Le sale |
|---|---|---|---|
| NPC | `dinero` | Sueldo, salario público, pensión, ayuda social, ganancia, garantía | Impuesto, comida, gasto de vida; los dueños, sus locales y campos |
| Empresa de alimento | Ventas del período | Su parte de la venta de comida, exportación | Sueldos (agricultores, técnicos), ganancia (empresario) |
| Empresa de comercio | Ventas del período | Margen de la comida, gasto de vida, obras y mantenimiento (públicos y privados) | Sueldos (obreros), ganancia (comerciantes) |
| Estado | `reserva` | Impuesto | Nómina, pensiones, ayuda, garantía, comida de menores, obras, mantenimiento, operación de obras, prensa, importación |
| Medios | Nada | Ingresos propios (exterior), fondos de prensa | Sueldos de periodistas; el resto sale |

**Calendario.** Cada día: producción → comercio exterior → precio → compras de comida (con garantía y comida de menores) → gasto de vida → consumo. Cada día de pago: empresas → estado → medios → evaluación del impago. El impuesto se retiene en cada pago a un NPC.

## 3. El NPC

**Ingreso del período**, cobrado el día de pago con el impuesto retenido:

| Rol | Ingreso |
|---|---|
| Empleado privado | Su parte del fondo de sueldos de su empresa (sección 4) |
| Comerciante, empresario | Su parte de la ganancia de su empresa (propiedad: la cobra aunque esté fuera de su puesto) |
| Público | `salario_publico` (igual para todos; no se ajusta solo con la inflación) |
| Periodista | Su sueldo, pagado por su medio (sección 7) |
| Jubilado | `pension_base` + ayuda social |
| Desempleado | Ayuda social |
| Menor | Nada: el estado paga su comida |

**Impuesto:** una tasa sobre todo ingreso, salvo pensiones y ayuda social. Los dueños pagan sobre su ganancia.

**Gasto diario,** en este orden:

1. **Comida:** recompra de despensa (sección 6). Si no le alcanza, la garantía paga su % del faltante; el resto no se compra.
2. **Gasto de vida** = `propension_gasto`/100 × ingreso neto diario del último período + `k_riqueza` × (`dinero` − colchón), con el segundo término solo si es positivo. Colchón = `colchon_dias` × gasto diario en comida. Va a la empresa de comercio.
3. **Ahorro:** lo que sobra queda en `dinero`.

**Inversión de los dueños:** cuando su empresa construye un local o un campo (MUNDO §13), los dueños pagan el costo con su `dinero`, en partes iguales. Si no les alcanza, no se construye. El pago va a comercio.

**Poder adquisitivo** (0-100): sale del `dinero` y del ingreso neto frente al precio de la comida, y entra en la satisfacción.

## 4. Empresas

Dos, siempre presentes. **Alimento:** dueño el empresario (puesto que puede quedar vacante), emplea agricultores y técnicos, es dueña del `stock`. **Comercio:** socios los comerciantes vivos, en partes iguales; emplea obreros.

```json
{ "alimento": { "dueno": "npc_44", "stock": 1500, "factor": 1.0 },
  "comercio": { "socios": ["npc_12", "npc_19"], "factor": 1.0 } }
```

**Sueldos: reparto de las ventas.** Cada empresa destina `parte_sueldos` de lo que vende a sueldos; el resto es de los dueños. El generador fija `parte_sueldos` para que el factor inicial sea 1. Cada día de pago:

1. Fondo de sueldos = `parte_sueldos` × ventas del período.
2. **Contrata** de a uno si hay vacantes (los puestos los dan sus locales o campos, MUNDO §13) y el fondo alcanza para pagar la referencia de todos más la del nuevo, hasta `max_contrataciones_por_periodo`. El nuevo cobra desde el período siguiente.
3. `factor` = fondo ÷ sueldos de referencia, con tope `factor_max`. Sueldo de referencia = (min + `ingreso_pos`/100 × (max − min)) × productividad/100, con el rango del rol.
4. Cada empleado cobra referencia × `factor`. La ganancia (ventas − sueldos) va a los dueños; sin dueños, sale del mundo.
5. Las ventas vuelven a 0: la empresa no guarda caja.

| `factor` | Qué pasa | Evento |
|---|---|---|
| > 1 | Aumento (antes contrató si pudo) | `empresa_aumento` |
| < 1 | Recorte; no contrata | `empresa_recorte` |
| < `piso_sueldo_pct`/100 | Despide a los que sobran para quedar sobre el piso, al ritmo `max_pase_desempleo_por_dia`. En alimento, primero los técnicos | `empresa_despido` |

Cada evento lleva origen `empresa:<id>/respuesta` y como causa el evento que más movió las ventas (control, clima) o ninguno.

**Producción diaria** = Σ producción de cada agricultor × productividad/100 × (1 + `k_tecnificacion` × técnicos efectivos), con técnicos efectivos = min(técnicos, agricultores × `tecnicos_por_agricultor`).

## 5. Estado

- **Entra:** el impuesto.
- **Sale cada día** (de la `reserva`): garantía, comida de los menores e importaciones.
- **Sale al ordenar una obra:** su costo, de una vez. Si la reserva no alcanza, no se puede ordenar.
- **Sale el día de pago,** en este orden: pensiones → nómina → ayuda social → mantenimiento de edificios y operación de obras (se le compran a comercio) → prensa (a los medios).
- **Si no alcanza:** se paga en ese orden y lo que queda se prorratea. Una importación se reduce a lo que cubre la reserva; la garantía se prorratea; la comida de los menores se paga siempre, antes que nada.
- **Impago:** cualquier faltante emite `impago {faltante, alcanza_nomina}` y dura hasta el primer día de pago sin faltante (`impago_fin`). Si alcanza la nómina, los públicos pierden satisfacción y productividad y se dispara la huelga (CAOS_PRENSA §3).
- **Saldo del período** = ingresos − gastos, sin las importaciones (se ven aparte).

```json
{ "reserva": 4200, "inflacion": 0, "impago": false,
  "finanzas": { "ingresos": 0, "nomina": 0, "pensiones": 0, "garantia": 0, "comida_menores": 0, "ayuda_social": 0, "obras": 0, "mantenimiento": 0, "operacion_obras": 0, "prensa": 0, "saldo": 0, "importacion": 0 } }
```

## 6. Comida

- **Stock:** la producción va al `stock` de la empresa de alimento, con tope `silo_dias` días de consumo; lo que excede se pierde.
- **Despensa:** cada NPC consume un día por día. Su **objetivo** = `objetivo_base_dias` × (1 + `k_prudencia` × (1 − valentía/100) + `k_miedo` × miedo/100), con tope `despensa_max_dias`; la acción `acapara` le suma días. Con la despensa bajo `umbral_recompra_dias`, recompra hasta el objetivo. Si el stock no alcanza para todos, se reparte parejo. De acá salen las corridas: miedo → compra de más → stock bajo → precio sube.
- **Venta:** pasa por comercio con `margen_comercial_pct`; el resto va a alimento. No depende de cuántos comerciantes haya.
- **Retención:** durante una medida de actor (ACTORES.md), alimento vende solo `pct_retencion` del stock por día; el precio sube por escasez aunque haya comida guardada.
- **Precio** = min(precio de mercado, tope), con precio de mercado = `precio_base` × escasez (según días de stock) × clima × (1 + inflación/100). El tope es un control.
- **Quién paga la comida de quien no puede:** la de los menores, siempre el estado; la de los demás, la garantía en su %.

## 7. Comercio exterior y medios

**Comercio exterior.** Capacidad diaria = comerciantes × `intercambio_por_comerciante`. Precio externo = `precio_base` × (1 + inflación/100) × factor de clima; comprar cuesta más que vender.

- **Importar:** el estado compra al precio externo, sin tope, con la reserva; la comida va al stock.
- **Exportar:** la empresa de alimento vende y cobra ella, sin bajar de `stock_min_exportar_dias`.

**Medios.** Cada día de pago cobran sus `ingresos_propios` y su parte de los fondos de prensa, y pagan a sus periodistas. Lo que sobra sale del mundo; si falta, los sueldos se prorratean.

## 8. Entradas y salidas del mundo

| Entra | Sale |
|---|---|
| Exportación | Importación |
| Ingresos propios de los medios | Lo que los medios no gastan |
| Emisión (solo `fiscal`) | Ganancia de una empresa sin dueño |

Si el dinero total deriva, se corrige calibrando.

## 9. Extensión `fiscal` (M2)

Agrega la emisión y la inflación dinámica. Con saldo negativo, antes del impago se emite hasta el tope autorizado. La inflación sube con la emisión relativa a la economía y decae sin ella; encarece la comida y devalúa la reserva y el dinero. Sin `fiscal`, la inflación es el valor fijo del preset.

## 10. Lo que el resto del juego lee

```ts
interface SalidaEconomica {
  accesoComida: Record<npcId, number>      // 0 a 1
  poderAdquisitivo: Record<npcId, number>  // 0 a 100
  saldo: number
  precioAlimento: number
  inflacion: number
}
```

## 11. Cadenas que salen solas

- **Recorte que se contagia:** más impuesto → menos gasto de vida → comercio recorta → los obreros gastan menos.
- **El estado como cliente:** construir y mantener edificios le da ventas a comercio; demoler o no pagar el mantenimiento ahorra, pero comercio vende menos y los públicos sin puesto quedan desempleados.
- **Inversión privada:** comercio vende bien → los socios construyen un local → más puestos → menos desempleo → más consumo.
- **Comida barata:** tope bajo → despensas llenas → stock vacío → alimento recorta → menos producción.
- **Sequía:** menos producción → precio sube → garantía más cara → reserva baja → impago y huelga.
- **Pánico:** noticia alarmista → miedo → corrida → precio sube → hambre → protesta.
- **Auge:** buen período → contratan → menos desempleo → más consumo → más recaudación.
- **Desigualdad:** los dueños acumulan y la satisfacción se separa por grupo.

## 12. Arranque y validación

El generador ajusta `precio_base`, los rangos de sueldo, `pension_base`, `parte_sueldos`, el mantenimiento de los edificios y la operación de obras para que el primer período cierre: las dos empresas con factor 1 y ganancia positiva, el estado con un saldo chico positivo, cada empleado con ingreso neto por encima de su comida, producción ≈ consumo y cada NPC con su colchón.

El agente de prototipo valida:

- 30 días sin tocar nada, sin clima ni caos: sin recortes, sin impago, dinero total y stock estables.
- El dinero de los NPCs se estabiliza con el término de riqueza.
- Cada cadena de la sección 11 aparece al forzar su causa.
- El tamaño del sector público y de los jubilados del preset no obliga a un impuesto desproporcionado.
