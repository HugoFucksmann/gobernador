# El gobernador: palancas (BORRADOR v0.15)

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
INGRESOS (impuestos, único en `simple` y por grupo desde `individual`; venta de alimento)
 − OBLIGATORIOS (nómina + pensiones + garantía alimentaria)
 = DISPONIBLE → presupuesto + subsidios + prensa (sobrante → reserva)
Compras de alimento (intercambio): salen de la reserva, no del disponible
Déficit: reserva → [solo `fiscal`: emisión hasta el tope → inflación] → impago
```

## 3. Palancas (ejemplo con `simple`, el nivel 1)

Presupuesto, subsidios y prensa son % del **disponible** y su suma es ≤ 100. El resto de las palancas son valores directos, cada una con su rango (sección 4). Las palancas de `individual` y `fiscal` están en la sección 4.

```json
{
  "recaudacion": { "impuesto": 20 },
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
    "racion": 100,
    "intercambio": 0
  },
  "cupos": { "policia": 5, "estatal": 4, "docente": 4, "medico": 5, "ingeniero": 3 }
}
```

`financiamiento` y `regulacion` son por medio: viven en `intervencion` de cada medio (ESTADOS §6).

## 4. Rangos y límites

Cada palanca tiene un rango y un cambio máximo por período fiscal (`cambio_max_por_periodo_pct`). Los rangos (`impuesto`, `salario_publico`, `racion`, `garantia_alimentaria`, `intercambio`, `tope_emision`, `regulacion`, `presupuesto`, `subsidios`, `gasto_prensa`, `financiamiento`), el tope de cupos (`cupo_max_pct_poblacion`) y el cambio máximo por período están en CALIBRACION.md.

- `intercambio`: -100 vende, 100 compra. Limitado por la cobertura de comerciantes. Las compras salen de la reserva (§2).
- `garantia_alimentaria`: % del faltante de comida a cargo del estado. Solo comida.
- `salario_publico` y `racion`: % del valor normal (100 = normal). El salario público no se ajusta solo con la inflación: lo ajusta el gobernador.
- `tope_emision`: % de los ingresos del período que se puede cubrir imprimiendo. El gobernador autoriza el tope y el motor emite solo lo necesario.
- `cambio_max_por_periodo_pct`: cambio máximo por período fiscal, como % del rango de la palanca.
- Presupuesto (por área), subsidios (por grupo), `gasto.prensa` y `financiamiento` van de 0 a 100, y presupuesto + subsidios + prensa suman a lo sumo 100. Los `cupos` van de 0 a `cupo_max_pct_poblacion` % de la población; el cambio máximo por período se mide sobre ese rango.
- **Cuándo rige un cambio:** el valor cambia al día siguiente (si se toca en pausa, al reanudar) y se emite el evento `palanca` (ESTADOS §14). El máximo se mide contra el valor al inicio del período fiscal y el margen se reinicia en cada liquidación. Presupuesto, subsidios y prensa se reparten en cada liquidación con el valor vigente ese día (ESTADOS §3.1).
- `gasto.prensa`: % del disponible para prensa. `financiamiento` por medio: reparto de ese monto entre medios, suma 100. Todos los medios son privados: el estado solo los financia.
- `cupos`: tope de puestos de los roles públicos. El NPC elige por afinidad y requisitos. Los roles privados no tienen cupo del gobernador (ESTADOS §2).
- `subsidios`: apuntan a un grupo de roles (inyección directa). Subsidiar servicios queda para el nivel 2 (HOJA_DE_RUTA §4).
- `presion` y `acceso`: fuera del nivel 1, quedan para el nivel 1.1.

**Palancas según el módulo de economía (ESTADOS §3.1):**

```json
{
  "simple": {
    "activas": ["impuesto", "salario_publico", "presupuesto", "subsidios", "racion", "intercambio", "cupos", "gasto_prensa"],
    "traduccion": {
      "impuesto": "un solo valor para todos los grupos",
      "subsidios": "suben la satisfacción del grupo directamente",
      "racion": "reparto gratuito del almacén común; hace de garantía alimentaria",
      "salario_publico": "sube el poder adquisitivo de los públicos, además de la nómina"
    }
  },
  "individual": {
    "activas": ["impuesto por grupo", "subsidios como transferencia", "garantia_alimentaria"],
    "reemplaza": ["racion"]
  },
  "fiscal": {
    "activas": ["tope_emision"],
    "agrega": ["emision", "inflacion dinamica"]
  }
}
```

Las palancas que no aplican al módulo activo se ocultan. El preset puede bloquear otras. Las de `individual` y `fiscal` (impuesto por grupo, garantía alimentaria, tope de emisión) llegan en el nivel 1.1 (HOJA_DE_RUTA §3).

## 5. Efectos y costos

Con todos los módulos activos. En `simple`, los efectos sobre dinero se traducen directamente a satisfacción y hambre.

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
    "costo": ["disponible-", "inflacion+ si hay deficit"]
  },
  "racion": {
    "sube": ["acceso a comida del almacen comun (ESTADOS §12 Alimento)"],
    "costo": ["recortarla sube el hambre", "consumo del almacen+ (menos dias de stock)"]
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
- **Comida ↔ finanzas:** sequía → precio sube → más gente sin plata → garantía cuesta más → déficit → emisión → inflación → precio sube.
- **Hambre y descontento:** si suben, se disparan acciones de condición (protesta, saqueo).
- **Plaga zombie o pandemia ↔ hospital:** los golpes llenan el hospital. Sin médicos suficientes (cupo) y sin inversión en salud, los heridos no se curan y mueren. La seguridad reduce los golpes de la plaga zombie, no los de la pandemia.
- **Plaga zombie ↔ integridad:** los golpes que pasan la defensa dañan la zona y bajan su defensa. La reparan obreros e ingenieros, más rápido con inversión en infraestructura. Hay que repartir entre más policía y más infraestructura.
- **Policía ↔ orden y defensa:** los policías se reparten solos entre defender la zona y frenar el contagio de las acciones espontáneas (ESTADOS §14). Más cupos ayudan a las dos cosas pero suben la nómina, y en una plaga zombie lo que se dedica a defensa deja menos para el orden.
- **Prensa ↔ amenaza:** la ciudadanía se entera del aviso por la prensa. Con más alcance y credibilidad, los policías se reubican antes hacia la zona de origen; con un medio desacreditado, la defensa queda mal ubicada.
- **Prensa ↔ crisis:** inflar un medio da control hoy y le quita credibilidad mañana.
- **Nómina impaga → huelga:** los públicos pierden satisfacción y productividad (regla del motor) y se dispara la huelga (acción de condición, fuera de los límites del caos). Los servicios caen.

## 7. Qué ve el gobernador

- Siempre exacto: reserva, ingresos, gastos, déficit, inflación, días de stock de alimento, el objetivo y la derrota con su progreso (ESTADOS §11), el aviso de un fenómeno con su zona de origen (ESTADOS §5), y el margen de cambio que le queda a cada palanca en el período con los días que faltan para la próxima liquidación (§4).
- Resumido: datos derivados de la comunidad (ESTADOS §10): porcentajes y conteos agregados, por zona cuando importa, sin el detalle de cada NPC (salvo la ficha del NPC en foco).
- Con sesgo: la prensa.

## 8. Preguntas abiertas

1. **Ración mayor a 100:** el rango es 50 a 150, pero ESTADOS §12 solo define el efecto del recorte (ración < 100). Falta definir qué pasa por encima de 100 (por ejemplo, si baja el hambre por debajo de su nivel normal, si consume el almacén sin beneficio o si el rango debería terminar en 100).
2. **Palanca de prioridad policial (orden público):** inclinaría el reparto entre defensa y orden (ESTADOS §14). No entra en el nivel 1: primero se simula el reparto automático y se decide según cuánto caos entra. El nivel donde entre se define en HOJA_DE_RUTA.