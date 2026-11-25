# Controles: contrato entre el mundo y el gobernador (v1.1)

> La frontera entre las dos capas. El mundo (MUNDO, ECONOMIA, CAOS_PRENSA, EDIFICIOS) expone **controles** continuos, **órdenes** puntuales, **medidas** de actores, **indicadores** para leer y **eventos**. El gobernador (GOBERNADOR, ACTORES) y la UI solo usan esto. Si cambia un lado, el otro no se toca mientras este contrato siga igual.

---

## 1. Reglas

- **El mundo no conoce palancas ni demandas.** Solo conoce controles, órdenes y medidas, en valores crudos.
- **Una palanca mueve uno o más controles;** una demanda pide palancas y, si se rechaza, dispara una medida. Los mapeos viven en GOBERNADOR y ACTORES.
- **Piloto automático:** sin gobernador, los controles quedan en el valor del preset y no hay órdenes ni demandas. El mundo tiene que poder correr así; es como se calibra.
- **Vigencia:** un cambio de control entra al día siguiente (o al reanudar) y emite `control`. Una orden se ejecuta al momento si es válida.

## 2. Controles

| Control | Unidad | Dónde actúa |
|---|---|---|
| `tasa_impuesto` | % sobre el ingreso | ECONOMIA §3 |
| `salario_publico` | Monto por día | ECONOMIA §3 |
| `puestos[ingeniero]` | Cantidad | MUNDO §3 |
| `operacion[obras]` | Monto por período | MUNDO §7, ECONOMIA §5 |
| `ayuda_social` | Monto por día por desempleado o jubilado | ECONOMIA §3 |
| `garantia_pct` | % del faltante de comida | ECONOMIA §6 |
| `tope_precio` | Múltiplo de `precio_base`, o sin tope | ECONOMIA §6 |
| `flujo_exterior_pct` | −100 (exportar todo) a 100 (importar todo) de la capacidad | ECONOMIA §7 |
| `fondos_prensa` | Monto por período | CAOS_PRENSA §7 |
| `tope_emision_pct` (M2) | % de los ingresos del período | ECONOMIA §9 |

Cada control tiene un rango válido (CALIBRACION) y el mundo acota lo que recibe. Los puestos de policía, médico, docente y estatal no son controles: los generan los edificios.

**Valencia de cada cambio** (para el tono de la prensa): subir `tasa_impuesto`, o bajar `salario_publico`, `puestos`, `operacion`, `ayuda_social` o `garantia_pct`, es mala noticia; lo contrario, buena. Un `tope_precio` más bajo es buena; `flujo_exterior_pct` y `fondos_prensa` son neutros. Inaugurar un edificio es buena noticia; demolerlo, mala.

## 3. Órdenes y medidas

**Órdenes** (las da el gobernador):

| Orden | Válida si |
|---|---|
| `construir {tipo, parcela}` | La parcela está libre y la reserva cubre el costo (EDIFICIOS.md) |
| `demoler {parcela}` | La parcela tiene un edificio público |
| `habilitar {parcelas[]}` | Las parcelas están bloqueadas (la usa la capa del gobernador al cumplir un hito) |

**Medidas** (las aplica un actor cuando se rechaza su demanda, o como parte de un acuerdo aceptado):

| Medida | Qué hace | Dónde |
|---|---|---|
| `retencion_stock {empresa, dias}` | Alimento vende solo una parte del stock por día | ECONOMIA §6 |
| `despido_forzado {empresa, cantidad}` | Despide esa cantidad al ritmo de siempre | ECONOMIA §4 |
| `sin_inversion {empresa, dias}` | Los dueños no construyen | MUNDO §13 |
| `campana {medio, tema, tono, dias}` | El medio publica con un tono fijo sobre un tema | CAOS_PRENSA §7 |

## 4. Indicadores

Todo lo que se puede leer. Cuánto ve el jugador y con qué exactitud: GOBERNADOR §5.

| Grupo | Indicadores |
|---|---|
| Finanzas | `reserva`, ingresos y gastos por rubro, `saldo`, `importacion`, `impago`, `inflacion` |
| Comida | `stock`, días de stock, precio, despensas en resumen |
| Empresas | `factor`, ganancia, empleados y vacantes de cada una |
| Ciudad | Parcelas (estado), edificios (tipo, activo, días de obra, personal, capacidad usada) |
| Servicios | `seguridad`, `salud`, `infraestructura`, cobertura por rol, ocupación de cada hospital |
| Comunidad | Los derivados de MUNDO §11, también por zona y por grupo |
| Zonas | `defensa`, `orden`, `integridad` y `amenaza` de cada zona |
| Clima | Fenómenos activos y anunciados, con su origen y días restantes |
| Medios | Alcance, credibilidad, dependencia, campañas y noticias publicadas |
| NPC | La ficha completa del NPC en foco y, para la vista, el lugar de rutina de cada NPC (casa, trabajo, compras) |
| Historial | Las seis series de MUNDO §11 |
| Causas | La cadena "¿por qué pasó esto?" de cualquier evento, NPC o noticia (MUNDO §9) |

El lugar de rutina es solo para la vista: lo deriva el motor del rol y la hora, y ninguna regla lo usa.

## 5. Eventos

Cada evento lleva `id`, día, zona, actores, `origen` y, si lo hay, `causa`.

```
ataque            {zona_origen, zona_destino, resultado: repelido | golpe, npc?}
golpe             {npc, dano, origen}
muerte            {npc, causa}
internacion, alta {npc, edificio}
hospital_saturado {edificio, ocupacion_pct}
accion_inicio, accion_fin {accion, npcs[], zona_destino, origen}
reubicacion       {npcs[], de_zona, a_zona}
defensa, integridad, orden {zona, valor}        // cambio diario
aviso             {fenomeno, zona_origen, dias_restantes}
fenomeno_inicio, fenomeno_fin {fenomeno, zona_origen?}
impago            {faltante, alcanza_nomina}
impago_fin        {}
empresa_aumento, empresa_recorte {empresa, factor}
empresa_despido   {empresa, cantidad}
obra_inicio, obra_fin {parcela, tipo, dueno}    // dueno: estado o la empresa
demolicion        {parcela, tipo}
parcela_habilitada {parcelas[]}
medida            {medida, actor, ...}          // causa: la demanda rechazada
noticia           {noticia, medio, tema}
control           {control, valor_anterior, valor_nuevo, palanca?}   // hecho raíz
```

- `control`, `obra_inicio` y `demolicion` del estado son raíces de toda cadena que empieza en una decisión del jugador.
- Los eventos de la capa del gobernador (`demanda`, `demanda_aceptada`, `demanda_rechazada`, `hito`, `victoria`, `objetivo_perdido`, `fin_partida`) los emite esa capa (GOBERNADOR, ACTORES).
- Todo evento tiene representación en la UI: en el mapa o, si no se ve, en el registro de hechos (UI §6).