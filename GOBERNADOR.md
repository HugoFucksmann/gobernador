# El gobernador: palancas (BORRADOR v0.10)

> Solo palancas, efectos y consecuencias. Estados, economía y reglas: ESTADOS.md. Idea: IDEA_JUEGO.md §7. Decidido salvo lo listado en la sección 8; números placeholder.

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
 − OBLIGATORIOS (nómina + pensiones + garantía alimentaria + compras de alimento)
 = DISPONIBLE → presupuesto + subsidios + prensa (sobrante → reserva)
Déficit: reserva → [solo `fiscal`: emisión hasta el tope → inflación] → impago
```

## 3. Palancas (ejemplo con `individual` y `fiscal` activos)

Presupuesto, subsidios y prensa son % del **disponible** y su suma es ≤ 100. El resto de las palancas son valores directos, cada una con su rango (sección 4).

```json
{
  "recaudacion": {
    "impuesto": { "agro": 20, "industria": 25, "comercio": 30, "publico": 15 }
  },
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
    "garantia_alimentaria": 80,
    "intercambio": 0
  },
  "finanzas": {
    "tope_emision": 10
  },
  "cupos": { "policia": 5, "estatal": 4, "docente": 4, "medico": 5, "ingeniero": 3 },
  "prensa": {
    "medio_1": { "financiamiento": 100, "regulacion": 20 }
  }
}
```

## 4. Rangos y límites

```json
{
  "impuesto": [0, 60],
  "salario_publico": [50, 150],
  "racion": [50, 150],
  "garantia_alimentaria": [0, 100],
  "intercambio": [-100, 100],
  "tope_emision": [0, 30],
  "regulacion": [0, 100],
  "cambio_max_por_periodo_pct": 20
}
```

- `intercambio`: -100 vende, 100 compra. Limitado por la cobertura de comerciantes.
- `garantia_alimentaria`: % del faltante de comida a cargo del estado. Solo comida.
- `salario_publico` y `racion`: % del valor normal (100 = normal). El salario público no se ajusta solo con la inflación: lo ajusta el gobernador.
- `tope_emision`: % de los ingresos del período que se puede cubrir imprimiendo. El gobernador autoriza el tope y el motor emite solo lo necesario.
- `cambio_max_por_periodo_pct`: cambio máximo por período fiscal, como % del rango de la palanca.
- `gasto.prensa`: % del disponible para prensa. `financiamiento` por medio: reparto de ese monto entre medios, suma 100. Todos los medios son privados: el estado solo los financia.
- `cupos`: tope de puestos de los roles públicos. El NPC elige por afinidad y requisitos. Los roles privados no tienen cupo del gobernador (ESTADOS §2).
- `subsidios`: apuntan a un grupo de roles (inyección directa). Subsidiar servicios queda para v2.
- `presion` y `acceso` (rango 0-100): fuera de la v1, quedan para la v1.1.

**Palancas según el módulo de economía (ESTADOS §3.1):**

```json
{
  "simple": {
    "activas": ["impuesto", "salario_publico", "presupuesto", "subsidios", "racion", "intercambio", "cupos", "prensa"],
    "traduccion": {
      "impuesto": "un solo valor para todos los grupos",
      "subsidios": "suben la satisfacción del grupo directamente",
      "racion": "reparto gratuito del almacén común; hace de garantía alimentaria"
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

Las palancas que no aplican al módulo activo se ocultan. El preset puede bloquear otras.

## 5. Efectos y costos

Con todos los módulos activos. En `simple`, los efectos sobre dinero se traducen directamente a satisfacción y hambre.

```json
{
  "impuesto": {
    "sube": ["fondos+"],
    "costo": ["ingreso_neto(grupo)-", "satisfaccion(grupo)-", "productividad(grupo)- si la tasa pasa de 40"]
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
- **Plaga o pandemia ↔ hospital:** los golpes llenan el hospital. Sin médicos suficientes (cupo) y sin inversión en salud, los heridos no se curan y mueren. La seguridad reduce los golpes de la plaga zombie, no los de la pandemia.
- **Prensa ↔ amenaza:** la ciudadanía se entera del aviso por la prensa. Con más alcance y credibilidad, los policías se reubican antes hacia la zona de origen; con un medio desacreditado, la defensa queda mal ubicada.
- **Prensa ↔ crisis:** inflar un medio da control hoy y le quita credibilidad mañana.
- **Nómina impaga → huelga:** los públicos pierden satisfacción y productividad (regla del motor) y se dispara la huelga (acción de condición, fuera de los límites del caos). Los servicios caen.

## 7. Qué ve el gobernador

- Siempre exacto: reserva, ingresos, gastos, déficit, inflación, días de stock de alimento, el objetivo y la derrota con su progreso (ESTADOS §11), y el aviso de un fenómeno con su zona de origen (ESTADOS §5).
- Resumido: datos derivados de la comunidad (ESTADOS §10).
- Con sesgo: la prensa.

## 8. Preguntas abiertas

Ninguna por ahora.
