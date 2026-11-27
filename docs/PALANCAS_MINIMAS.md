# Palancas mínimas para la obra pública

> Revisión de qué necesita el jugador para que el mundo funcione con obra pública. Es un insumo para el rediseño final de las palancas de GOBERNADOR.md; lo ya decidido está marcado. Obra pública = edificios del estado (hospital, comisaría), vías (calle, camino, puente) y, más adelante, las obras de suceso (EDIFICIOS §5).

---

## 1. Qué pide la obra pública al jugador

La obra pública tiene tres partes: **decidir qué se construye**, **conseguir la plata** y **sostener lo construido** (mantenimiento y personal). Sin gobernador, la regla de piloto automático (MUNDO §9) hace las tres con valores fijos; con gobernador, hay que devolverle al jugador lo mínimo para hacerlas.

## 2. Mínimo indispensable

| Qué | Tipo | Por qué no se puede sacar |
|---|---|---|
| `construir {tipo, parcela}` | Orden | Hospitales, comisarías, escuelas y universidades son los servicios que se construyen (la oficina pública viene con el preset). Sin la orden no hay forma de cubrir la demanda de salud y seguridad |
| `construir_via {tipo, tramo}` | Orden | Es la única forma de expandir la ciudad: sin vías no hay parcelas nuevas |
| `demoler {parcela}` | Orden | Libera parcelas públicas y deja de pagar mantenimiento. Es la salida cuando se construyó de más |
| `impuesto` (`tasa_impuesto`) | Palanca | Es la única entrada de plata del estado. Sin ella la obra pública no se puede financiar |

Con estas cuatro, el jugador ya puede decidir qué construir, dónde y cuánto cobrar para pagarlo.

## 3. Necesarias para que el gasto no rompa el sistema

| Qué | Tipo | Por qué hace falta |
|---|---|---|
| `nivel_obras` (`puestos[ingeniero]` y `operacion[obras]`) | Palanca | Sube la infraestructura: acorta los días de obra, acelera la reparación y mantiene las vías y los edificios. Sin ella, el costo de mantener lo construido no se puede ajustar |
| `salario_publico` | Palanca | Los edificios funcionan con personal público (médicos, policías, ingenieros). Si el sueldo queda fijo y el estado construye mucho, la nómina crece sin control y lleva al impago y la huelga |

## 4. Redes de seguridad (no son de obra, pero el gasto en obra las tensa)

| Qué | Por qué |
|---|---|
| `ayuda_social` | Gastar en obra y subir impuesto lleva gente al desempleo y la calle; la ayuda amortigua |
| `garantia_alimentaria` | Mismo caso con el hambre |

Son las del nivel G1 (GOBERNADOR §7). Se pueden dejar fijas en el preset si se quiere un jugador de obra más puro.

## 5. No necesarias para la obra pública

`precio_maximo`, `comercio_exterior` y `prensa` no afectan lo que el estado construye ni cómo lo paga. Pueden esperar al diseño final de palancas.

## 6. Resumen de la propuesta mínima

- **3 palancas:** `impuesto`, `nivel_obras`, `salario_publico`.
- **3 órdenes:** `construir`, `construir_via`, `demoler`.
- **Opcionales:** `ayuda_social`, `garantia_alimentaria`.

## 7. Decisiones y pendientes

1. **Hitos contra vías. [Decidido]** La expansión es solo por vías: `sin_calle` reemplaza a `bloqueada`, y los hitos ya no habilitan parcelas (la orden `habilitar` y el estado `bloqueada` se retiran). Los hitos pueden seguir existiendo en la capa del gobernador como metas, sin tocar el suelo.
2. **La obra pública mueve a las constructoras. [Pendiente]** Ahora el estado paga las obras a firmas de construcción (ECONOMIA §10). Gastar mucho las engorda; dejar de construir las puede fundir y dejar obreros sin trabajo. El jugador tiene que ver esto en un indicador (ventas y estado de las constructoras).
3. **Mantenimiento que se acumula. [Pendiente]** Cada edificio y cada tramo suma un gasto fijo por período. No hay palanca que lo recorte sin demoler o sin bajar `nivel_obras`. Conviene decidir si alcanza con eso.
4. **Indicadores que el jugador necesita para decidir. [Pendiente]** Demanda de suelo por zona y tipo, parcelas `sin_calle`, red vial y tramos en mal estado, reserva en semanas de gasto, mantenimiento total por período, cobertura de policía y médico, y estado de las constructoras. Todos ya existen en CONTROLES §4, salvo el de constructoras y el mantenimiento total, que hay que agregar.
5. **Interruptor del estado automático. [Decidido]** Es un parámetro del preset (CONTROLES §1): apagado cuando entra el gobernador, para que el estado no construya solo y pise al jugador.
6. **Orden de las obras en cola. [Decidido]** Con poca reserva y varias obras posibles, el estado automático ordena por costo por parcela abierta. Con gobernador, el jugador elige; no hay cola ni prioridades que resolver.
