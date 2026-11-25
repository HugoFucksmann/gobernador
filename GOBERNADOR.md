# El gobernador: palancas (BORRADOR v0.21)

> Solo palancas, efectos y consecuencias. Estados, economía y reglas: ESTADOS.md. Idea: IDEA_JUEGO.md §7. Decidido salvo lo listado en la sección 8. Los valores (rangos, topes, márgenes) están en CALIBRACION.md; los números de los ejemplos solo ilustran la forma.

---

## 1. Principios

- Fija **condiciones**, no órdenes a NPCs ni noticias.
- Todo gasto tiene un uso alternativo.
- Los efectos tienen inercia.
- Los efectos sobre rasgos de personalidad (rebeldía, laboriosidad) son modificadores temporales del valor efectivo. Nunca cambian el rasgo base (ESTADOS §1 y §8).
- Las consecuencias de sus decisiones (impago, hambre) son mecánicas y no dependen de la IA (ESTADOS §7, acciones de condición).

## 2. Flujo de fondos (reglas: ESTADOS §12)

```
INGRESOS (impuestos por grupo; venta de alimento al exterior)
 − OBLIGATORIOS (nómina + pensiones + garantía alimentaria)
 = DISPONIBLE → presupuesto + subsidios + prensa (sobrante → reserva)
Compras de alimento (intercambio): salen de la reserva, no del disponible
Déficit: reserva → [solo con la extensión `fiscal`: emisión hasta el tope → inflación] → impago
```

## 3. Palancas (ejemplo del nivel 1)

Presupuesto, subsidios y prensa son % del **disponible** y su suma es ≤ 100. El resto de las palancas son valores directos, cada una con su rango (sección 4). Las de la extensión `fiscal` están en la sección 4.

```json
{
  "recaudacion": { "impuesto": { "agro": 15, "industria": 20, "comercio": 25, "publico": 20 } },
  "gasto": {
    "salario_publico": 100,
    "presupuesto": { "salud": 20, "seguridad": 10, "infraestructura": 20, "educacion": 15 },
    "prensa": 5,
    "subsidios": [
      { "grupo": "sin_ingreso", "pct": 10 },
      { "grupo": "agro", "pct": 5 }
    ]
  },
  "alimento": {
    "precio_maximo": 150,
    "garantia_alimentaria": 50,
    "intercambio": 0
  },
  "cupos": { "policia": 5, "estatal": 4, "docente": 4, "medico": 5, "ingeniero": 3 }
}
```

`financiamiento` y `regulacion` son por medio: viven en `intervencion` de cada medio (ESTADOS §6).

## 4. Rangos y límites

Cada palanca tiene un rango y un cambio máximo por período fiscal (`cambio_max_por_periodo_pct`). Los rangos (`impuesto`, `salario_publico`, `precio_maximo`, `garantia_alimentaria`, `intercambio`, `tope_emision`, `regulacion`, `presupuesto`, `subsidios`, `gasto_prensa`, `financiamiento`), el tope de cupos (`cupo_max_pct_poblacion`) y el cambio máximo por período están en CALIBRACION.md.

- `intercambio`: -100 vende, 100 compra. Limitado por la capacidad de los comerciantes (ESTADOS §12). Al vender, el estado le compra el excedente a la empresa de alimento. Las compras salen de la reserva (§2), se pagan al precio externo (sin el tope de `precio_maximo`) y la comida se suma al stock de la empresa de alimento (ESTADOS §4).
- `salario_publico`: % del valor normal (100 = normal). No se ajusta solo con la inflación: lo ajusta el gobernador.
- `precio_maximo`: tope al precio de la comida, como % del `precio_base` (rango y valor "sin tope" en CALIBRACION). El precio efectivo es el menor entre el del mercado y el tope. No cuesta presupuesto, pero con el tope por debajo de lo que las empresas necesitan para pagar los sueldos, bajan sus ganancias y se activa su tabla de respuestas (ESTADOS §4). Además, con la comida barata la gente llena su despensa y el mercado se vacía antes.
- `garantia_alimentaria`: % del faltante de comida a cargo del estado, para los NPCs que no pueden comprar. Solo comida. Los menores siempre los cubre el estado al 100%.
- `tope_emision`: % de los ingresos del período que se puede cubrir imprimiendo. El gobernador autoriza el tope y el motor emite solo lo necesario.
- `cambio_max_por_periodo_pct`: cambio máximo por período fiscal, como % del rango de la palanca.
- Presupuesto (por área), subsidios (por grupo), `gasto.prensa` y `financiamiento` van de 0 a 100, y presupuesto + subsidios + prensa suman a lo sumo 100. Los `cupos` van de 0 a `cupo_max_pct_poblacion` % de la población; el cambio máximo por período se mide sobre ese rango.
- **Cuándo rige un cambio:** el valor cambia al día siguiente (si se toca en pausa, al reanudar) y se emite el evento `palanca` (ESTADOS §14). El máximo se mide contra el valor al inicio del período fiscal y el margen se reinicia en cada liquidación. Presupuesto, subsidios y prensa se reparten en cada liquidación con el valor vigente ese día (ESTADOS §3.1).
- `gasto.prensa`: % del disponible para prensa. `financiamiento` por medio: reparto de ese monto entre medios, suma 100. Todos los medios son privados: el estado solo los financia.
- `cupos`: tope de puestos de los roles públicos. El NPC elige por afinidad y requisitos. Los roles privados no tienen cupo del gobernador (ESTADOS §2).
- `subsidios`: apuntan a un grupo de roles (inyección directa). Subsidiar servicios queda para el nivel 2 (HOJA_DE_RUTA §4).
- `presion` y `acceso`: fuera del nivel 1, quedan para el nivel 1.1.

**Palancas según la economía (ESTADOS §3.1):**

```json
{
  "base": {
    "activas": ["impuesto por grupo", "salario_publico", "presupuesto", "subsidios como transferencia", "garantia_alimentaria", "precio_maximo", "intercambio", "cupos", "gasto_prensa"]
  },
  "fiscal": {
    "activas": ["tope_emision"],
    "agrega": ["emision", "inflacion dinamica"]
  }
}
```

La comida no se reparte desde el estado: el gobernador la regula de forma indirecta con `impuesto` y `subsidios` (cuánta plata tienen para comprar), `garantia_alimentaria` (el estado paga parte de lo que le falta a quien no puede comprar), `intercambio` (importar o vender) y `precio_maximo`. Las palancas que no aplican a la economía activa se ocultan. El preset puede bloquear otras. La de `fiscal` (tope de emisión) llega en el nivel 1.1 (HOJA_DE_RUTA §3).

## 5. Efectos y costos

Los efectos sobre el dinero pasan por las empresas y las despensas de los NPCs (ESTADOS §4).

```json
{
  "impuesto": {
    "sube": ["fondos+"],
    "costo": ["ingreso_neto(grupo)-", "satisfaccion(grupo)-", "productividad(grupo)- si la tasa pasa de su umbral"]
  },
  "salario_publico": {
    "sube": ["satisfaccion(publicos)+"],
    "costo": ["nomina+", "mas riesgo de impago"]
  },
  "presupuesto.*": {
    "sube": ["indicador del area+ (ESTADOS §12 Servicios)"],
    "costo": ["disponible- para las otras areas", "rendimientos decrecientes"]
  },
  "subsidios": {
    "sube": ["dinero(grupo)+", "satisfaccion(grupo)+", "hambre(grupo)-"],
    "costo": ["disponible-", "inflacion+ si hay deficit (con `fiscal`)"]
  },
  "precio_maximo": {
    "sube": ["acceso a comida (precio-)", "hambre-", "satisfaccion+"],
    "costo": ["ganancia de las empresas- (se activan sus respuestas: despidos, recortes)", "el stock se vacia antes (despensas llenas) y puede haber faltante", "no cuesta presupuesto"]
  },
  "garantia_alimentaria": {
    "sube": ["hambre-", "sin_dinero_pct-"],
    "costo": ["gasto obligatorio+ (faltante x precio)"]
  },
  "intercambio": {
    "sube": ["stock de alimento+ (compra) o fondos+ (venta)"],
    "costo": ["precio externo sube con inflacion y sequia", "compra mas cara que venta"]
  },
  "tope_emision": {
    "sube": ["cubre el deficit"],
    "costo": ["inflacion+", "precio alimento+", "reserva y ahorros devaluados"]
  },
  "cupos": {
    "sube": ["cobertura del servicio+"],
    "costo": ["nomina+ (publicos)", "menos gente en produccion", "desempleo si se baja"]
  },
  "prensa": {
    "financiamiento": { "sube": ["alcance del medio+"], "costo": ["dependencia+ -> credibilidad- si se nota"] },
    "regulacion": { "sube": ["sensacionalismo-"], "costo": ["credibilidad-", "rebeldia+"] }
  }
}
```

## 6. Cruces clave

- **Nómina vs operación:** más cupos públicos → más nómina → menos disponible para operar los servicios.
- **Impuesto ↔ grupo:** gravar un grupo baja su plata, humor y producción. Un subsidio al mismo grupo lo compensa.
- **Comida ↔ finanzas:** sequía → precio sube → más gente sin plata → garantía cuesta más → déficit → impago (con `fiscal`, antes: emisión → inflación → precio sube).
- **Hambre y descontento:** si suben, se disparan acciones de condición (protesta, saqueo).
- **Plaga zombie o pandemia ↔ hospital:** los golpes llenan el hospital. Sin médicos suficientes (cupo) y sin inversión en salud, los heridos no se curan y mueren. La seguridad reduce los golpes de la plaga zombie, no los de la pandemia.
- **Plaga zombie ↔ integridad:** los golpes que pasan la defensa dañan la zona y bajan su defensa. La reparan obreros e ingenieros, más rápido con inversión en infraestructura. Hay que repartir entre más policía y más infraestructura.
- **Policía ↔ orden y defensa:** los policías se reparten solos entre defender la zona y frenar el contagio de las acciones espontáneas (ESTADOS §14). Más cupos ayudan a las dos cosas pero suben la nómina, y en una plaga zombie lo que se dedica a defensa deja menos para el orden.
- **Prensa ↔ amenaza:** la ciudadanía se entera del aviso por la prensa. Con más alcance y credibilidad, los policías se reubican antes hacia la zona de origen; con un medio desacreditado, la defensa queda mal ubicada. La necesidad de orden, en cambio, no depende de la prensa (ESTADOS §14).
- **Precio máximo ↔ empresas:** bajar el tope baja el hambre hoy, pero reduce la ganancia de las empresas. Si no alcanzan a pagar sueldos, responden (recortan, despiden) y la gente tiene menos plata. Además la comida barata llena las despensas y vacía el stock antes.
- **Impuesto ↔ consumo:** gravar de más baja el gasto de vida de los NPCs, y con él las ventas y las ganancias de las comerciales (ESTADOS §4).
- **Prensa ↔ crisis:** inflar un medio da control hoy y le quita credibilidad mañana.
- **Nómina impaga → huelga:** los públicos pierden satisfacción y productividad (regla del motor) y se dispara la huelga (acción de condición, fuera de los límites del caos). Los servicios caen.

## 7. Qué ve el gobernador

- Siempre exacto: reserva, ingresos, gastos, déficit, inflación, días de stock de alimento, la ganancia y la respuesta vigente de cada empresa (ESTADOS §4), el objetivo y la derrota con su progreso (ESTADOS §11), el aviso de un fenómeno con su zona de origen (ESTADOS §5), y el margen de cambio que le queda a cada palanca en el período con los días que faltan para la próxima liquidación (§4).
- Resumido: datos derivados de la comunidad (ESTADOS §10): porcentajes y conteos agregados, por zona cuando importa, sin el detalle de cada NPC (salvo la ficha del NPC en foco).
- Con sesgo: la prensa.

## 8. Preguntas abiertas

1. **Palanca de prioridad policial (orden público):** inclinaría el reparto entre defensa y orden (ESTADOS §14). No entra en el nivel 1: primero se simula el reparto automático y se decide según cuánto caos entra. El nivel donde entre se define en HOJA_DE_RUTA.
