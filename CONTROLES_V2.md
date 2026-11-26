# Controles: contrato entre el mundo y el gobernador (v2.0)

> La frontera entre las dos capas. El mundo (MUNDO_V2, ECONOMIA_V2, EDIFICIOS_V2, CAOS_PRENSA_V2) expone **controles**, **órdenes**, **medidas**, **indicadores** y **eventos**. La capa del gobernador (GOBERNADOR.md, ACTORES.md) y la UI solo usan esto. Si cambia un lado, el otro no se toca mientras este contrato siga igual.

---

## 1. Reglas

- **El mundo no conoce palancas ni demandas.** Solo controles, órdenes y medidas, en valores crudos.
- **Piloto automático:** sin gobernador los controles quedan en el valor del preset, no hay órdenes ni medidas, y el estado sostiene los servicios con la regla de MUNDO_V2 §9. El mundo tiene que poder correr así; es como se calibra.
- **Estado automático:** la regla de MUNDO_V2 §9 (servicios y vías) es un interruptor del preset: encendido en piloto automático, apagado cuando hay gobernador.
- **Vigencia:** un cambio de control entra al día siguiente y emite `control`. Una orden se ejecuta al momento si es válida.

## 2. Controles

| Control | Unidad | Dónde actúa |
|---|---|---|
| `tasa_impuesto` | % sobre el ingreso | ECONOMIA_V2 §3 |
| `salario_publico` | Monto por día | ECONOMIA_V2 §3 |
| `puestos[ingeniero]` | Cantidad | MUNDO_V1 §3 |
| `operacion[obras]` | Monto por período | MUNDO_V1 §7 |
| `ayuda_social` | Monto por día por desempleado o jubilado | ECONOMIA_V2 §3 |
| `garantia_pct` | % del faltante de comida | ECONOMIA_V2 §6 |
| `tope_precio` | Múltiplo de `precio_base`, o sin tope | ECONOMIA_V2 §6 |
| `flujo_exterior_pct` | −100 a 100 de la capacidad | ECONOMIA_V2 §11 |
| `fondos_prensa` | Monto por período | CAOS_PRENSA_V2 §7 |
| `tope_emision_pct` (M4) | % de los ingresos | ECONOMIA_V2 §14 |

Cada control tiene un rango válido (parámetros del preset) y el mundo acota lo que recibe.

**Valencia de cada cambio** (para el tono de la prensa): como v1: subir `tasa_impuesto` o bajar `salario_publico`, `puestos`, `operacion`, `ayuda_social` o `garantia_pct` es mala noticia; un `tope_precio` más bajo es buena; `flujo_exterior_pct` y `fondos_prensa` son neutros. Inaugurar un edificio público o una vía es buena noticia; demolerlo, mala.

## 3. Órdenes y medidas

**Órdenes** (las dará el gobernador):

| Orden | Válida si |
|---|---|
| `construir {tipo, parcela}` | La parcela es pública y libre, y la reserva cubre el costo (EDIFICIOS_V2 §3) |
| `construir_via {tipo, tramo}` | El tramo está en el suelo urbanizable, se conecta a la red construida y la reserva cubre el costo (EDIFICIOS_V2 §3b) |
| `demoler {parcela}` | La parcela tiene un edificio público |
| `habilitar {parcelas[]}` | Las parcelas están bloqueadas |

En el mundo base solo las ejecuta el estado en piloto automático para servicios, y las firmas y hogares construyen por su cuenta con sus propias reglas (no son órdenes).

**Medidas** (de actores, cuando se rechaza una demanda, capa del gobernador):

| Medida | Qué hace |
|---|---|
| `retencion_stock {firma, dias}` | La firma `agro` vende solo una parte del stock por día |
| `despido_forzado {firma, cantidad}` | Despide esa cantidad al ritmo de siempre |
| `sin_inversion {firma, dias}` | Los dueños no construyen ni compran |
| `campana {medio, tema, tono, dias}` | El medio publica con un tono fijo sobre un tema |

## 4. Indicadores

| Grupo | Indicadores |
|---|---|
| Finanzas | `reserva`, ingresos y gastos por rubro, `saldo`, `importacion`, `impago`, `inflacion` |
| Hogares | Cantidad, composición, dinero, despensa, estado (con casa o calle), alquiler pagado, meses sin pagar |
| Vivienda | Casas (dueño, capacidad, estado, alquiler, ocupación), `calle_pct`, `hacinamiento_pct`, mercado de vivienda por zona |
| Demografía | Población, pirámide de edades, natalidad, mortalidad, edad media, árbol de parentescos de la persona en foco |
| Comida | `stock` por firma y por zona, días de stock, precio por zona, despensas en resumen |
| Firmas | Cada firma: rubro, dueños con %, locales, empleados, vacantes, `factor`, ganancia, `caja`, `cuota_zona`, `periodos_en_perdida` |
| Mercado | Cuota por rubro y zona, `cuota_mayor_pct`, compras y quiebras del período, fundaciones |
| Red vial | Tramos (tipo, longitud, estado, costo, qué abre), rutas y costo de traslado entre zonas, tramos intransitables, parcelas `sin_calle` por zona y tipo, zonas `no_urbanizada`, demanda de suelo por zona y tipo |
| Ciudad | Parcelas (tipo, estado), edificios (tipo, activo, días de obra, personal, capacidad usada, estado) |
| Servicios | `seguridad`, `salud`, `infraestructura`, cobertura por rol, ocupación de cada hospital |
| Comunidad | Los derivados de MUNDO_V2 §11, también por zona y por grupo |
| Zonas | `defensa`, `orden`, `integridad` y `amenaza` de cada zona |
| Clima | Fenómenos activos y anunciados, con su origen y días restantes |
| Medios | Cada medio (firma): dueños, línea, alcance, credibilidad, dependencia, ingresos, campañas y noticias |
| Persona | La ficha completa de la persona en foco, su hogar, su familia, sus partes y la rutina de cada una (casa, trabajo, compras) |
| Historial | Las series de MUNDO_V2 §11 |
| Causas | La cadena "¿por qué pasó esto?" de cualquier evento, persona, hogar, firma o noticia |

El lugar de rutina es solo para la vista: lo deriva el motor del rol y la hora, y ninguna regla lo usa.

## 5. Eventos

Cada evento lleva `id`, día, zona, actores, `origen` y, si lo hay, `causa`. Los de v1 siguen (ataque, golpe, muerte, internacion, alta, hospital_saturado, accion_inicio/fin, reubicacion, defensa, integridad, orden, aviso, fenomeno_inicio/fin, impago, impago_fin, empresa_aumento/recorte/despido, obra_inicio/fin, demolicion, parcela_habilitada, medida, noticia, control). Nuevos:

```
nacimiento          {npc, hogar, padres[]}
pareja              {npcs[], hogar_nuevo}
separacion          {npcs[], hogares[]}
hogar_nuevo         {hogar, miembros[], motivo: independizacion | pareja | hacinamiento}
hogar_disuelto      {hogar, herederos[]}
herencia            {de, a[], dinero, partes[], casa?}
mudanza             {hogar, de_casa, a_casa}
desalojo            {hogar, casa, periodos_sin_pagar}
calle_inicio, calle_fin {hogar, zona}
casa_construida     {parcela, dueno, tipo}
via_inicio, via_fin {tramo, tipo, parcelas_abiertas[]}   // dueno: el estado
via_estado          {tramo, estado}                      // cambio por período
ruta_cortada        {tramo, parcelas_aisladas[]}         // tramo en estado 0
zona_abierta        {zona, via}
casa_estado         {casa, estado}                       // cambio diario o por período
firma_fundada       {firma, rubro, dueno}
firma_compra        {comprador, firma, precio, tipo: absorcion | filial}
firma_quiebra       {firma, cantidad_despedidos}
monopolio           {rubro, zona, firma, cuota}          // cruza el umbral de poder de precio
medio_cambio_linea  {medio, linea_anterior, linea_nueva}
medio_cierre        {medio}
```

- `control`, `obra_inicio`, `via_inicio` y `demolicion` del estado son raíces de toda cadena que empieza en una decisión del gobernador.
- Todos los eventos del mercado y de la familia tienen causa: la raíz puede ser un hecho de clima, un control, una muerte, un nacimiento o ninguna (azar).
- Todo evento tiene representación en la UI: en el mapa o, si no se ve, en el registro de hechos.
- Los eventos de la capa del gobernador (`demanda`, `demanda_aceptada`, `demanda_rechazada`, `hito`, `victoria`, `objetivo_perdido`, `fin_partida`) los emite esa capa.
