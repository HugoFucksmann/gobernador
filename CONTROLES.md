# Controles: contrato entre el mundo y el gobernador (v1.0)

> La frontera entre las dos capas. El mundo (MUNDO, ECONOMIA, CAOS_PRENSA) expone **controles** que se pueden mover, **indicadores** que se pueden leer y **eventos** que avisan lo que pasó. El gobernador (GOBERNADOR.md) y la UI (UI.md) solo usan esto. Si cambia algo de un lado, el otro no se toca mientras este contrato siga igual.

---

## 1. Reglas

- **El mundo no conoce palancas.** Solo conoce controles, en valores crudos (montos, cantidades, porcentajes).
- **Una palanca es una forma de mover controles.** Puede mover uno (impuesto → tasa) o varios a la vez (nivel de salud → puestos de médico + operación de salud). El mapeo vive en GOBERNADOR.md.
- **Piloto automático:** sin gobernador, cada control queda en el valor del preset. El mundo tiene que poder correr así indefinidamente; es como se calibra.
- **Vigencia:** un cambio entra en vigencia al día siguiente (si se hizo en pausa, al reanudar) y emite el evento `control`.
- **Controles fijos:** el preset puede dejar un control fuera del alcance del gobernador (estatales y docentes en el nivel 1).

## 2. Controles

| Control | Unidad | Dónde actúa |
|---|---|---|
| `tasa_impuesto` | % sobre el ingreso | ECONOMIA §3 |
| `salario_publico` | Monto por día | ECONOMIA §3 |
| `puestos[policia]`, `puestos[medico]`, `puestos[ingeniero]` | Cantidad | MUNDO §3 |
| `puestos[estatal]`, `puestos[docente]` | Cantidad (fijos en el nivel 1) | MUNDO §3 |
| `operacion[seguridad]`, `operacion[salud]`, `operacion[obras]` | Monto por período | MUNDO §7, ECONOMIA §5 |
| `ayuda_social` | Monto por día por desempleado o jubilado | ECONOMIA §3 |
| `garantia_pct` | % del faltante de comida | ECONOMIA §6 |
| `tope_precio` | Múltiplo de `precio_base`, o sin tope | ECONOMIA §6 |
| `flujo_exterior_pct` | −100 (exportar todo) a 100 (importar todo) de la capacidad | ECONOMIA §7 |
| `fondos_prensa` | Monto por período | CAOS_PRENSA §7 |
| `tope_emision_pct` (M2) | % de los ingresos del período | ECONOMIA §9 |

Cada control tiene un rango válido (CALIBRACION). El mundo acota lo que recibe.

**Valencia de cada cambio** (para el tono de la prensa, CAOS_PRENSA §8): subir `tasa_impuesto`, o bajar `salario_publico`, puestos, operación, `ayuda_social` o `garantia_pct`, es mala noticia para la comunidad; lo contrario, buena. Un `tope_precio` más bajo es buena; `flujo_exterior_pct` y `fondos_prensa` son neutros.

## 3. Indicadores

Todo lo que se puede leer del mundo. Cuánto de esto ve el jugador, y con qué exactitud, lo decide GOBERNADOR §4.

| Grupo | Indicadores |
|---|---|
| Finanzas | `reserva`, ingresos y gastos por rubro, `saldo`, `importacion`, `impago`, `inflacion` |
| Comida | `stock`, días de stock, precio, despensas en resumen |
| Empresas | `factor`, ganancia, empleados y vacantes de cada una |
| Servicios | `seguridad`, `salud`, `infraestructura`, cobertura por rol, ocupación del hospital |
| Comunidad | Los derivados de MUNDO §11, también por zona y por grupo |
| Zonas | `defensa`, `orden`, `integridad` y `amenaza` de cada zona |
| Clima | Fenómenos activos y anunciados, con su origen y días restantes |
| Medios | Alcance, credibilidad, dependencia y noticias publicadas |
| NPC | La ficha completa de un NPC (solo el que está en foco) |
| Historial | Las seis series de MUNDO §11 |
| Causas | La cadena "¿por qué pasó esto?" de cualquier evento, NPC o noticia (MUNDO §9) |

## 4. Eventos

Cada evento lleva `id`, día, zona, actores, `origen` y, si lo hay, `causa`.

```
ataque            {zona_origen, zona_destino, resultado: repelido | golpe, npc?}
golpe             {npc, dano, origen}
muerte            {npc, causa}
internacion, alta {npc}
hospital_saturado {ocupacion_pct}
accion_inicio, accion_fin {accion, npcs[], zona_destino, origen}
reubicacion       {npcs[], de_zona, a_zona}
defensa, integridad, orden {zona, valor}        // cambio diario
aviso             {fenomeno, zona_origen, dias_restantes}
fenomeno_inicio, fenomeno_fin {fenomeno, zona_origen?}
impago            {faltante, alcanza_nomina}
impago_fin        {}
empresa_aumento, empresa_recorte {empresa, factor}
empresa_despido   {empresa, cantidad}
noticia           {noticia, medio, tema}
control           {control, valor_anterior, valor_nuevo, palanca?}   // hecho raíz
```

- `control` es la raíz de toda cadena que empieza en una decisión: `palanca` dice cuál la movió (vacío en piloto automático).
- Los eventos del objetivo (`victoria`, `objetivo_perdido`, `fin_partida`) no son del mundo: los emite la capa del gobernador (GOBERNADOR §5).
- Todo evento tiene representación en la UI: en el mundo 3D o, si no se ve, en el registro de hechos (UI §6).
