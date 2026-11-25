# El gobernador: palancas (BORRADOR v0.25)

> Solo palancas, efectos y consecuencias. Estados, economía y reglas: ESTADOS.md. Idea: IDEA_JUEGO.md §7. Decidido salvo lo listado en la sección 8. Los valores (niveles, modos, escalones, costos) están en CALIBRACION.md; los números de los ejemplos solo ilustran la forma.

---

## 1. Principios

- Fija **condiciones**, no órdenes a NPCs ni noticias.
- Todo gasto tiene un costo visible: lo que no se gasta va a la reserva.
- Pocas palancas, cada una con un dilema claro. Nada de controles que se pisan entre sí.
- Los efectos tienen inercia.
- Los efectos sobre rasgos de personalidad (rebeldía, laboriosidad) son modificadores temporales del valor efectivo. Nunca cambian el rasgo base (ESTADOS §1 y §8).
- Las consecuencias de sus decisiones (impago, hambre) son mecánicas y no dependen de la IA (ESTADOS §7, acciones de condición).

## 2. Flujo de fondos (reglas: ESTADOS §12)

```
INGRESOS (impuesto)
 − GASTOS (nómina + pensiones + garantía alimentaria + ayuda social + operación de servicios + prensa)
 = SALDO del período → si es positivo, va a la reserva
Importaciones de alimento: salen de la reserva
Saldo negativo: reserva → [solo con la extensión `fiscal`: emisión hasta el tope → inflación] → impago
```

- No hay porcentajes que repartir ni un "disponible" que sumar a 100: cada palanca tiene su costo y el saldo dice si se gasta más de lo que entra.
- **Impago:** el faltante lo absorben primero los gastos discrecionales (prensa, operación de servicios, ayuda social), después la nómina (prorrateada) y por último las pensiones y la garantía (ESTADOS §12).

## 3. Palancas del nivel 1

```json
{
  "impuesto": 20,
  "salario_publico": 100,
  "servicios": { "seguridad": 2, "salud": 3, "obras": 2 },
  "ayuda_social": 10,
  "garantia_alimentaria": 50,
  "precio_maximo": "libre",
  "comercio_exterior": "cerrado",
  "prensa": 5
}
```

### Resumen de las 10 palancas

| Palanca | Qué se fija | Efecto principal | Costo |
|---|---|---|---|
| `impuesto` | Una tasa general sobre todo ingreso | Fondos del estado | Menos ingreso neto, consumo y satisfacción; menos productividad sobre su umbral |
| `salario_publico` | % del valor normal | Satisfacción de los empleados públicos | Más nómina y riesgo de impago |
| `servicios.seguridad` | Nivel 0 a 5 | Policías y operación: defensa, orden, menos miedo | Nómina + operación; gente que deja la producción |
| `servicios.salud` | Nivel 0 a 5 | Médicos (camas) y operación (rapidez de cura) | Nómina + operación; gente que deja la producción |
| `servicios.obras` | Nivel 0 a 5 | Ingenieros y operación: infraestructura y reparación | Nómina + operación; gente que deja la producción |
| `ayuda_social` | Monto diario por persona sin ingreso (desempleados y jubilados) | Dinero, satisfacción y menos hambre de los que no tienen ingreso | Gasto del período |
| `garantia_alimentaria` | % del faltante de comida que paga el estado | Baja el hambre de quien no puede comprar | Gasto obligatorio |
| `precio_maximo` | Modo: libre, moderado o estricto | Baja el precio de la comida y el hambre | Menos ganancia para las empresas; el stock se vacía antes |
| `comercio_exterior` | Escalón: exportar máx, exportar, cerrado, importar, importar máx | Mueve el stock de comida | Importar sale de la reserva; exportar vacía el stock |
| `prensa` | Monto al período para los medios | Más alcance de los medios | Gasto, más dependencia y menos credibilidad sobre el umbral |

**Cómo se usa la reserva:** paga las importaciones de comida y cubre el saldo negativo. Ahorrar para una crisis compite con gastar hoy.

**Fijos por preset, no son palanca:** los estatales y los docentes (cantidad fija), el indicador de educación (fuera de la v1) y la economía activa.

**Límites conocidos de la v1:**
- Un nivel de servicio no garantiza personal: depende de que haya NPCs con la educación requerida (médicos e ingenieros piden nivel 3).
- Si desaparecen los comerciantes no se puede comerciar con el exterior, y ninguna palanca los repone.
- El desempleo solo se palía (garantía, ayuda social, niveles de servicio); ninguna palanca crea empleo privado.

## 4. Detalle de cada palanca

Los valores de cada nivel, modo y escalón están en CALIBRACION.md.

- **`impuesto`:** una sola tasa sobre todo ingreso: privados, públicos sobre su salario y dueños sobre su ganancia positiva. Los sin ingreso (desempleados, jubilados, estudiantes) no pagan. Por encima de un umbral baja la productividad (factor fiscal, ESTADOS §12).
- **`salario_publico`:** % del valor normal (100 = normal). No se ajusta solo con la inflación: lo ajusta el gobernador.
- **`servicios` (seguridad, salud, obras):** cada nivel (0 a 5) fija a la vez los **puestos objetivo** del rol (policía, médico, ingeniero, como % de la población) y la **operación** (fondos por período). Nivel 0: sin puestos ni operación. Los puestos los cubren los NPCs por afinidad y requisitos (ESTADOS §2). Bajar el nivel deja gente sin puesto, que pasa a desempleada al ritmo `max_pase_desempleo_por_dia`.
- **`ayuda_social`:** monto diario por persona para desempleados y jubilados. Se paga con el resto del gasto del período. La comida de los menores la paga siempre el estado por la garantía.
- **`garantia_alimentaria`:** % del faltante de comida a cargo del estado, para los NPCs que no pueden comprar. Solo comida. Los menores siempre los cubre el estado al 100%.
- **`precio_maximo`:** tres modos. `libre` no tiene tope; `moderado` y `estricto` fijan un tope como múltiplo del `precio_base`. El precio efectivo es el menor entre el del mercado y el tope. No cuesta presupuesto, pero con el tope por debajo de lo que las empresas necesitan para pagar los sueldos, responden (ESTADOS §4). Con la comida barata la gente llena su despensa y el mercado se vacía antes.
- **`comercio_exterior`:** cinco escalones que usan −100, −50, 0, 50 o 100% de la capacidad de intercambio (depende de los comerciantes, ESTADOS §12). **Importar:** el estado compra al precio externo con la reserva y la comida se suma al stock de la empresa de alimento. **Exportar:** la empresa de alimento vende su excedente al exterior y cobra ella; el estado no compra ni revende. Sirve para sostener el precio y la ganancia de la empresa con superávit.
- **`prensa`:** monto por período que se reparte parejo entre los medios: el gobernador no puede favorecer a uno. Todos los medios son privados.
- **Cuándo rige un cambio:** el valor cambia al día siguiente (si se toca en pausa, al reanudar) y se emite el evento `palanca` (ESTADOS §14). Los gastos se acumulan a diario con el valor vigente y se pagan en cada liquidación (ESTADOS §3.1). No hay tope de cambio por período: la inercia de los indicadores y de los puestos ya frena los vaivenes.

**Palancas según la economía (ESTADOS §3.1):**

```json
{
  "base": { "activas": ["impuesto", "salario_publico", "servicios", "ayuda_social", "garantia_alimentaria", "precio_maximo", "comercio_exterior", "prensa"] },
  "fiscal": { "activas": ["tope_emision"], "agrega": ["emision", "inflacion dinamica"] }
}
```

- `tope_emision` (nivel 1.1): % de los ingresos del período que se puede cubrir imprimiendo. El gobernador autoriza el tope y el motor emite solo lo necesario.
- La comida no se reparte desde el estado: el gobernador la regula de forma indirecta con `impuesto` y `ayuda_social` (cuánta plata tienen para comprar), `garantia_alimentaria`, `comercio_exterior` y `precio_maximo`. Las palancas que no aplican a la economía activa se ocultan. El preset puede bloquear otras.

## 5. Efectos y costos

Los efectos sobre el dinero pasan por las empresas y las despensas de los NPCs (ESTADOS §4).

```json
{
  "impuesto": {
    "sube": ["fondos+"],
    "costo": ["ingreso_neto-", "consumo-", "satisfaccion- (mas con codicia)", "productividad- si la tasa pasa su umbral"]
  },
  "salario_publico": {
    "sube": ["satisfaccion(publicos)+"],
    "costo": ["nomina+", "mas riesgo de impago"]
  },
  "servicios.*": {
    "sube": ["puestos del rol+", "indicador del area+ (ESTADOS §12 Servicios)"],
    "costo": ["nomina+", "operacion+", "menos gente en produccion", "desempleo si se baja", "rendimientos decrecientes"]
  },
  "ayuda_social": {
    "sube": ["dinero(sin ingreso)+", "satisfaccion(sin ingreso)+", "hambre(sin ingreso)-"],
    "costo": ["gasto+", "menos saldo para la reserva"]
  },
  "garantia_alimentaria": {
    "sube": ["hambre-", "sin_dinero_pct-"],
    "costo": ["gasto obligatorio+ (faltante x %)"]
  },
  "precio_maximo": {
    "sube": ["precio-", "hambre-", "satisfaccion+"],
    "costo": ["ganancia de las empresas- (recortes y despidos)", "el stock se vacia antes", "no cuesta presupuesto"]
  },
  "comercio_exterior": {
    "sube": ["stock+ (importar) o ganancia de la empresa de alimento+ (exportar)"],
    "costo": ["importar sale de la reserva", "exportar puede dejar faltante", "precio externo sube con inflacion, sequia y plaga"]
  },
  "prensa": {
    "sube": ["alcance de los medios+ (rendimientos decrecientes)"],
    "costo": ["gasto+", "dependencia+ (afinidad_gobierno+ y, sobre umbral_dependencia_pct, credibilidad-)"]
  },
  "tope_emision": {
    "sube": ["cubre el saldo negativo"],
    "costo": ["inflacion+", "precio alimento+", "reserva y ahorros devaluados"]
  }
}
```

## 6. Cruces clave

- **Servicios ↔ reserva:** subir un nivel suma nómina y operación. Muchos servicios a la vez agotan la reserva y llevan al impago.
- **Servicios ↔ producción:** cada policía, médico o ingeniero sale de la producción privada.
- **Impuesto ↔ consumo:** gravar de más baja el gasto de vida de los NPCs, y con él las ventas y las ganancias de la empresa de comercio (ESTADOS §4).
- **Ayuda social ↔ garantía:** la ayuda da plata y satisfacción (apoyo); la garantía solo evita el hambre (derrota). Las dos compiten por la reserva.
- **Comida ↔ finanzas:** sequía → precio sube → más gente sin plata → garantía cuesta más → saldo negativo → impago (con `fiscal`, antes: emisión → inflación → precio sube).
- **Hambre y descontento:** si suben, se disparan acciones de condición (protesta, saqueo).
- **Plaga zombie o pandemia ↔ hospital:** los golpes llenan el hospital. Sin salud suficiente, los heridos no se curan y mueren. La seguridad reduce los golpes de la plaga zombie, no los de la pandemia.
- **Plaga zombie ↔ integridad:** los golpes que pasan la defensa dañan la zona y bajan su defensa. La reparan obreros e ingenieros, más rápido con más obras. Hay que repartir entre seguridad y obras.
- **Policía ↔ zonas:** cada policía da defensa y orden en la zona donde está. Si se mueven hacia la amenaza, dejan otras zonas con menos orden (ESTADOS §14).
- **Prensa ↔ amenaza:** la ciudadanía se entera del aviso por la prensa. Con más alcance y credibilidad, los policías se reubican antes hacia la zona de origen; con un medio desacreditado, la defensa queda mal ubicada.
- **Precio máximo ↔ empresas:** bajar el tope baja el hambre hoy, pero reduce la ganancia de las empresas. Si no alcanzan a pagar sueldos, recortan y después despiden.
- **Exportar ↔ abastecimiento:** exportar sostiene a la empresa de alimento con superávit, pero si llega una sequía el stock ya está bajo.
- **Prensa ↔ crisis:** gastar de más en prensa da alcance hoy y quita credibilidad mañana.
- **Nómina impaga → huelga:** si el impago alcanza la nómina, los públicos pierden satisfacción y productividad y se dispara la huelga (acción de condición, fuera de los límites del caos). Los servicios caen.

## 7. Qué ve el gobernador

- Siempre exacto: reserva, ingresos, gastos, saldo, inflación, días de stock de alimento, la ganancia, el factor de sueldos y el empleo de cada empresa (ECONOMIA §5), el objetivo y la derrota con su progreso (ESTADOS §11), el aviso de un fenómeno con su zona de origen (ESTADOS §5), el costo por período de cada palanca y los días que faltan para la próxima liquidación.
- Resumido: datos derivados de la comunidad (ESTADOS §10): porcentajes y conteos agregados, por zona cuando importa, sin el detalle de cada NPC (salvo la ficha del NPC en foco).
- Con sesgo: la prensa.

## 8. Preguntas abiertas

No quedan preguntas abiertas.

## 9. Para el nivel 1.1

- `tope_emision` (extensión `fiscal`).
- `presion` y `acceso` sobre la prensa.
- Educación como servicio con nivel, si las partidas son lo bastante largas para que se note.