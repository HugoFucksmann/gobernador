# Controles: contrato entre el mundo y el gobernador

> La frontera entre las dos capas. El mundo (MUNDO, ECONOMIA, EDIFICIOS, CAOS_PRENSA) expone **controles**, **órdenes**, **medidas**, **indicadores** y **eventos**. La capa del gobernador (GOBERNADOR.md, ACTORES.md) y la UI solo usan esto. Si cambia un lado, el otro no se toca mientras este contrato siga igual.

---

## 1. Reglas

- **El mundo no conoce palancas ni demandas.** Solo controles, órdenes y medidas, en valores crudos.
- **Piloto automático:** sin gobernador los controles quedan en el valor del preset (salvo `tasa_impuesto`, que el ajuste fiscal de MUNDO §9 mueve dentro de una banda y emite `control` con origen `estado_automatico`), no hay órdenes ni medidas, y el estado sostiene servicios y vías con las reglas de MUNDO §9. El mundo tiene que poder correr así; es como se calibra.
- **Estado automático:** las reglas de MUNDO §9 (ajuste fiscal, freno de obra, servicios y vías) son un interruptor del preset: encendido en piloto automático, apagado cuando hay gobernador.
- **Vigencia:** un cambio de control entra al día siguiente y emite `control`. Una orden se ejecuta al momento si es válida.

## 2. Controles

| Control | Unidad | Dónde actúa |
|---|---|---|
| `tasa_impuesto` | % sobre el ingreso | ECONOMIA §3 |
| `salario_publico` | % del valor base (50-150) | ECONOMIA §3 |
| `nivel_obras` (fija `puestos[ingeniero]` y `operacion[obras]`) | Nivel 0..5 | MUNDO §7 y §9 |
| `ayuda_social` | Monto por día por desempleado o jubilado | ECONOMIA §3 |
| `garantia_pct` | % del faltante de comida | ECONOMIA §6 |
| `tope_precio` | Modo: `libre`, `moderado` (1,25×) o `estricto` (0,6×) el `precio_base` | ECONOMIA §6 |
| `flujo_exterior_pct` | −100 a 100 de la capacidad | ECONOMIA §11 |
| `fondos_prensa` | Monto por período | CAOS_PRENSA §7 |
| `tope_emision_pct` (M4) | % de los ingresos | ECONOMIA §14 |

Cada control tiene un rango válido (parámetros del preset) y el mundo acota lo que recibe.

**Unidades del motor (decididas; la tabla de arriba ya las refleja):**
- `salario_publico`: % del valor base (`salarioBasePublico`), rango 50-150. La UI muestra también el monto diario equivalente.
- `puestos[ingeniero]` y `operacion[obras]`: el motor los expone juntos como un único nivel de obras 0..5; el contrato conserva los dos controles y el nivel los fija a la vez.
- `tope_precio`: tres modos (`libre` = sin tope, `moderado` = 1,25×, `estricto` = 0,6× el `precio_base`).

**Valencia de cada cambio** (para el tono de la prensa): subir `tasa_impuesto`, o bajar `salario_publico`, `puestos`, `operacion`, `ayuda_social` o `garantia_pct`, es mala noticia; lo contrario, buena. Un `tope_precio` más bajo es buena; `flujo_exterior_pct` y `fondos_prensa` son neutros. Inaugurar un edificio público o una vía es buena noticia; demolerlo, mala.

## 3. Órdenes y medidas

**Órdenes** (las da el gobernador):

| Orden | Válida si |
|---|---|
| `construir {tipo, parcela}` | La parcela es pública y libre, y la reserva cubre el costo (EDIFICIOS §3) |
| `construir_via {tipo, tramo}` | El tramo está en el suelo urbanizable, se conecta a la red construida y la reserva cubre el costo (EDIFICIOS §3b) |
| `demoler {parcela}` | La parcela tiene un edificio público |

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
| Hogares | Cantidad, composición, dinero, despensa, estado (`con_casa`, `calle` o `acogida`), alquiler pagado, meses sin pagar |
| Vivienda | Casas (dueño, capacidad, estado, alquiler, ocupación), `calle_pct`, `hacinamiento_pct`, mercado de vivienda por zona |
| Demografía | Población, pirámide de edades, natalidad, mortalidad, edad media, árbol de parentescos de la persona en foco |
| Comida | `stock` por firma y por zona, días de stock, precio por zona, despensas en resumen |
| Firmas | Cada firma: rubro, dueños con %, locales, empleados, vacantes, `factor`, ganancia, `caja`, `cuota_zona`, `periodos_en_perdida` |
| Mercado | Cuota por rubro y zona, `cuota_mayor_pct`, compras y quiebras del período, fundaciones |
| Red vial | Tramos (tipo, longitud, estado, costo, qué abre), rutas y costo de traslado entre zonas, tramos intransitables, parcelas `sin_calle` por zona y tipo, zonas `no_urbanizada`, demanda de suelo por zona y tipo |
| Ciudad | Parcelas (tipo, estado), edificios (tipo, activo, días de obra, personal, capacidad usada, estado) |
| Servicios | `seguridad`, `salud`, `infraestructura`, cobertura por rol, ocupación de cada hospital |
| Comunidad | Los derivados de MUNDO §11, también por zona y por grupo |
| Zonas | `defensa`, `orden`, `integridad` y `amenaza` de cada zona |
| Clima | Fenómenos activos y anunciados, con su origen y días restantes |
| Medios | Cada medio (firma): dueños, línea, alcance, credibilidad, dependencia, ingresos, campañas y noticias |
| Mapa | La grilla (terreno, vías, zonas), los lotes con su estado y la red de rutas con sus tramos y costos |
| Persona | La ficha completa de la persona en foco, su hogar, su familia, sus partes y su **agenda** del día (lote de cada franja) |
| Historial | Las series de MUNDO §11 |
| Causas | La cadena "¿por qué pasó esto?" de cualquier evento, persona, hogar, firma o noticia |
| Lectura | Indicadores de vistazo con estado, tendencia, serie y causas; alertas priorizadas; informe periódico; personas notables e interlocutores (LECTURA) |

La **agenda** (dónde está cada persona en cada franja del día) la deriva el motor del rol, la etapa, el hogar y la hora (MOTOR §7) y la UI solo la anima por la red de rutas. Las reglas usan el costo de ruta (compra, trabajo, traslado), no la posición minuto a minuto.

## 5. Eventos

Cada evento lleva `id`, día, zona, actores, `origen` y, si lo hay, `causa`.

```
# Clima, salud y seguridad
ataque              {zona_origen, zona_destino, resultado: repelido | golpe, npc?}
golpe               {npc, dano, origen}
muerte              {npc, causa}
internacion, alta   {npc, edificio}
hospital_saturado   {edificio, ocupacion_pct}
aviso               {fenomeno, zona_origen, dias_restantes}
fenomeno_inicio, fenomeno_fin {fenomeno, zona_origen?}
reubicacion         {npcs[], de_zona, a_zona}
defensa, integridad, orden {zona, valor}          // cambio diario
accion_inicio, accion_fin {accion, npcs[], zona_destino, origen}

# Estado y economía
impago              {faltante, alcanza_nomina}
impago_fin          {}
empresa_aumento, empresa_recorte {firma, factor}
empresa_despido     {firma, cantidad}
firma_fundada       {firma, rubro, dueno}
firma_compra        {comprador, firma, precio, tipo: absorcion | filial}
firma_quiebra       {firma, cantidad_despedidos}
monopolio           {rubro, zona, firma, cuota}   // cruza el umbral de poder de precio

# Obras y territorio
obra_inicio, obra_fin {parcela, tipo, dueno}      // dueno: el estado, una firma o un hogar
demolicion          {parcela, tipo}
casa_construida     {parcela, dueno, tipo}
via_inicio, via_fin {tramo, tipo, parcelas_abiertas[]}   // dueno: el estado
via_estado          {tramo, estado}               // cambio por período
ruta_cortada        {tramo, parcelas_aisladas[]}  // tramo en estado 0
zona_abierta        {zona, via}

# Vida, familia y vivienda
nacimiento          {npc, hogar, padres[]}
pareja              {npcs[], hogar_nuevo}
separacion          {npcs[], hogares[]}
hogar_nuevo         {hogar, miembros[], motivo: independizacion | pareja | hacinamiento}
hogar_disuelto      {hogar, herederos[]}
herencia            {de, a[], dinero, partes[], casa?}
mudanza             {hogar, de_casa, a_casa}
desalojo            {hogar, casa, periodos_sin_pagar}
calle_inicio, calle_fin {hogar, zona}
casa_estado         {casa, estado}                // cambio diario o por período
migracion_llegada   {hogar, personas[], dinero}
migracion_salida    {hogar, personas[], causa}
capacitacion_inicio {npc, rol_objetivo}
capacitacion_fin    {npc, educacion}

# Prensa y control
noticia             {noticia, medio, tema}
medio_cambio_linea  {medio, linea_anterior, linea_nueva}
medio_cierre        {medio}
medida              {medida, actor, ...}          // causa: la demanda rechazada
control             {control, valor_anterior, valor_nuevo, palanca?}   // hecho raíz
```

- `control`, `obra_inicio`, `via_inicio` y `demolicion` del estado son raíces de toda cadena que empieza en una decisión del gobernador.
- Todos los eventos del mercado y de la familia tienen causa: la raíz puede ser un hecho de clima, un control, una muerte, un nacimiento o ninguna (azar).
- Los eventos de la capa del gobernador (`demanda`, `demanda_aceptada`, `demanda_rechazada`, `hito`, `victoria`, `objetivo_perdido`, `fin_partida`) los emite esa capa (GOBERNADOR.md, ACTORES.md).
- Todo evento tiene representación en la UI: en el mapa o, si no se ve, en el registro de hechos.
