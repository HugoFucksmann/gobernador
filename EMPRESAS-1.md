# Empresas (BORRADOR v0.1)

> Cómo funcionan las dos empresas del nivel 1. Estados y reglas generales: ESTADOS.md (§2 roles, §4 alimento, §12 economía). Palancas: GOBERNADOR.md. Todo valor numérico vive en CALIBRACION.md; acá solo la forma. **[decidido]** viene de ESTADOS v0.39; **[propuesta]** es base para pulir.

---

## 1. Principios

- **[decidido]** Dos empresas por mundo, siempre presentes: **alimento** y **comercio**. No se crean ni quiebran.
- **[decidido]** No guardan caja: lo que entra paga sueldos y el resto es ganancia de los dueños en cada liquidación.
- **[decidido]** Las respuestas son reglas fijas, sin sorteo: el jugador puede prever qué pasa si aprieta.
- **[propuesta]** Una empresa solo hace tres cosas: **cobra**, **paga sueldos** y **contrata o despide**. Todo lo demás (precio, stock, despensas) está en ESTADOS §4.

## 2. Las dos empresas

| | Alimento | Comercio |
|---|---|---|
| Dueños | El empresario (1 puesto, puede estar vacante) | Los comerciantes vivos (socios, en partes iguales) |
| Empleados | Agricultores y técnicos | Obreros |
| Cobra | Su parte de cada venta de comida (precio − margen comercial) y lo que exporta | El margen comercial sobre la comida y todo el gasto de vida de los NPCs |
| Produce | Comida (al `stock`) | Nada físico: su aporte es el ingreso gravable |
| Tope de empleados | `tope_privado[agricultor]` y `tope_privado[tecnico]` | `tope_privado[obrero]` |
| Lo afecta | Clima, salud de los agricultores, `precio_maximo`, exportación | Consumo de la gente (impuesto, miedo, inflación), `precio_maximo` |

```json
{
  "alimento": {
    "dueno": "npc_44",
    "stock": 1500,
    "respuesta": null,
    "periodo": { "ingresos": 0, "sueldos": 0 },
    "ultima_ganancia": 120
  },
  "comercio": {
    "socios": ["npc_12", "npc_19", "npc_23", "npc_30"],
    "respuesta": { "tipo": "recortar_sueldos", "factor": 0.85, "dias_restantes": 4, "origen": "empresa:comercio/respuesta", "causa": "ev_201" },
    "periodo": { "ingresos": 0, "sueldos": 0 },
    "ultima_ganancia": 0
  }
}
```

Todo esto es estado y se guarda (ESTADOS §13). `ultima_ganancia` es la ganancia de la última liquidación (sirve para contratar, sección 5).

## 3. Sueldos

- **[decidido]** Sueldo de referencia de cada empleado = (min + `ingreso_pos` / 100 × (max − min)) × productividad / 100, con el rango de su rol (ESTADOS §2).
- **[propuesta]** La empresa paga el sueldo de referencia × `factor`, con `factor` = 1 sin respuesta y menor durante un recorte (sección 4).
- **[propuesta]** Los sueldos se acumulan a diario y se pagan a cada NPC a diario (así el NPC puede comprar comida), pero la empresa los compara con sus ingresos recién en la liquidación, cada `periodo_pago_dias`.
- **[propuesta]** Los sueldos no suben solos en la v1 aunque la empresa gane mucho: la ganancia va al dueño. Eso genera desigualdad, que es parte del juego (IDEA §3, pilar 5).

## 4. Liquidación y respuesta

Cada `periodo_pago_dias`, cada empresa compara lo acumulado:

1. **Si alcanza** (ingresos ≥ sueldos de referencia): ganancia = ingresos − sueldos pagados. Si había una respuesta, termina (evento `empresa_respuesta_fin`).
2. **Si no alcanza:** abre o renueva una respuesta por `dias_respuesta`:
   - `recortar_sueldos` con `factor` = max(`piso_sueldo_pct` / 100, ingresos / sueldos de referencia).
   - Si el factor quedó en el piso (con el piso tampoco alcanza): además `despedir` a los que sobran para que los sueldos al piso entren en los ingresos. Pasan a desempleados al ritmo `max_pase_desempleo_por_dia`, elegidos al azar con semilla.
   - Ganancia = 0.

**[propuesta] Qué se despide primero:** en alimento, los técnicos antes que los agricultores (sin agricultores no hay comida); en comercio, solo hay obreros.

**[decidido]** Mientras dura una respuesta, la empresa no contrata. Cada respuesta emite `empresa_respuesta` con su `origen` y `causa` (ESTADOS §8): la causa apunta al evento que más bajó los ingresos (un cambio de `precio_maximo` o de `impuesto`, un fenómeno del clima) o, si no hay uno claro, a ninguno.

## 5. Contratación

- **[decidido]** Vacantes = tope − ocupados. Un puesto solo se cubre con NPCs que cumplan los requisitos, por afinidad (ESTADOS §2).
- **[propuesta] Contrata solo si puede pagar:** sin respuesta vigente, la empresa cubre una vacante si `ultima_ganancia` alcanza para pagar el sueldo de referencia del nuevo durante un período. Hasta `max_contrataciones_por_dia` por día.
- Así se evita la oscilación "contrata, no puede pagar, despide": una empresa que no gana no crece.
- Al generar el mundo todas las vacantes iniciales ya están cubiertas y las empresas arrancan con ganancia positiva (IDEA §5: todo encaja al empezar).

## 6. Dueños

- **[decidido]** La ganancia de alimento va al empresario; la de comercio se reparte en partes iguales entre los socios. Pagan `impuesto` sobre su ganancia positiva.
- **[decidido]** Sin dueño ni socios, la empresa sigue operando y la ganancia sale del sistema.
- **[decidido]** Una acción con `fuera_de_puesto` no le quita la ganancia al dueño: es de propiedad, no de trabajo.
- **[propuesta]** Si muere un socio, su parte se reparte entre los demás desde la siguiente liquidación. Un NPC que pasa a comerciante se suma como socio en la siguiente liquidación.
- **[decidido]** El número de comerciantes no limita a la empresa de comercio: solo da la capacidad de comercio exterior (ESTADOS §12).

## 7. Producción de alimento

- **[decidido]** Producción diaria = Σ producción de cada agricultor × productividad / 100 × (1 + `k_tecnificacion` × técnicos efectivos), con técnicos efectivos = min(técnicos, agricultores × `tecnicos_por_agricultor`).
- **[decidido]** Va al `stock`, con tope `silo_dias`. El exceso se pierde, salvo lo que se exporte (GOBERNADOR §4).
- **[decidido]** Agricultores internados, con `fuera_de_puesto` o en huelga no producen. Una sequía o plaga baja la producción.

## 8. Cómo se conectan con las palancas

| Palanca | Qué le pasa a la empresa |
|---|---|
| `precio_maximo` | Baja lo que cobra alimento por unidad y el margen de comercio → menos ingresos → recorte o despido |
| `impuesto` | Baja el ingreso neto de la gente → menos gasto de vida → comercio cobra menos |
| `comercio_exterior` (exportar) | Alimento cobra más con superávit |
| `comercio_exterior` (importar) | Más stock → el precio interno baja → alimento cobra menos por unidad |
| `servicios.*` | Cada puesto público que se cubre puede sacar a un empleado privado |
| `ayuda_social`, `garantia_alimentaria` | Más plata en manos de la gente → más ventas |

## 9. Qué ve el gobernador

Siempre exacto (GOBERNADOR §7), en la ventana de Economía (UI §5): por empresa, empleados y vacantes, sueldos pagados, ganancia del último período, respuesta vigente con su factor y días restantes, y su causa ("¿por qué pasó esto?").

## 10. Eventos

```
empresa_respuesta     {empresa, tipo, factor, despidos}   // con origen y causa
empresa_respuesta_fin {empresa}
```

Los despidos individuales se registran como pase a desempleado con origen `empresa:<id>/respuesta` y la `causa` de la respuesta.

## 11. Parámetros para CALIBRACION

- `periodo_pago_dias`, `dias_respuesta`, `piso_sueldo_pct`, `max_pase_desempleo_por_dia`.
- `max_contrataciones_por_dia`.
- `margen_comercial_pct`.
- `tope_privado` por rol, `k_tecnificacion`, `tecnicos_por_agricultor`, `silo_dias`.
- Criterio de arranque: las dos empresas con ganancia positiva y sin respuesta durante los primeros períodos sin intervención del jugador.

## 12. Preguntas abiertas

1. ¿Los sueldos deberían subir con la ganancia (por ejemplo, una parte fija de la ganancia repartida entre los empleados)? La propuesta base dice que no en la v1.
2. ¿Despedir en alimento debería proteger a los agricultores, como propone la sección 4, o ser al azar entre todos?
3. ¿El dueño debería poder cubrir un faltante con su `dinero` (el viejo `absorber`)? La propuesta base lo saca para que la regla sea fija.
