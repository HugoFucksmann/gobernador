# Caos y prensa (v2.0)

> Qué hacen los NPCs por su cuenta (director de caos), cómo se cuenta lo que pasa (prensa) y la IA opcional. Lo que no cambia respecto de v1 se cita como **CAOS_PRENSA_V1 §n**. Tabla de acciones: ACCIONES_V2.md. Los medios pasan a ser firmas (ECONOMIA_V2 §4). Lo marcado **[propuesta]** se pule.

---

## 1. Principios

Como CAOS_PRENSA_V1 §1: el juego funciona completo sin IA; el motor decide qué pasa y cuánto, el texto nunca cambia la simulación; una acción es un disfraz más efectos de un catálogo cerrado; la prensa cuenta hechos ya ocurridos (salvo el aviso del clima) y todo número sale de los datos del hecho.

## 2. Acciones

Formato y campos como CAOS_PRENSA_V1 §2. Cambia el efecto de algunas acciones sobre el **hogar** (comida, dinero) en lugar de la persona. Catálogo de acciones en ACCIONES_V2.

## 3. Acciones de condición

Como CAOS_PRENSA_V1 §3 (el motor decide si pasan, el director solo elige entre las válidas), con estas condiciones:

| Acción | Disparador |
|---|---|
| `huelga` | Impago del estado que alcanza la nómina (puede reabrirse mientras dure) |
| `paro_firma` | `empresa_recorte` o `empresa_despido` de una firma, sobre su umbral de recorte |
| `protesta` | `descontentos_pct` sobre su umbral |
| `saqueo` | `hambre_critica_pct` sobre su umbral |
| `ocupacion` | `calle_pct` sobre su umbral y casas vacías disponibles |
| `boicot` | `cuota_zona` de una firma sobre `umbral_poder_precio` y precio de la comida sobre su umbral |

Reglas de v1: no cuentan contra `max_acciones_por_periodo`, no las frena el respiro, su contagio no se modifica por orden ni satisfacción. El origen registra quién eligió.

## 4. Contagio

Como CAOS_PRENSA_V1 §4: una fuente, una exposición, un freno y una tirada diaria por persona; contagio efectivo = `contagio` × (1 − `k_orden` × orden/100) × (1 − `k_satisfaccion` × satisfacción de la zona/100). Los contagiados no cuentan contra `max_acciones_por_periodo` pero sí contra los topes de efecto. Origen `accion:<id>/contagio`.

## 5. Catálogo de efectos

Los de v1 (CAOS_PRENSA_V1 §5) y estos nuevos, acotados y reversibles:

| Efecto | Qué hace | A quién | Límite |
|---|---|---|---|
| `ocupa` | Ocupa una casa vacía sin pagar alquiler mientras dure | Hogar del participante | Solo acciones de condición; `max_ocupaciones_por_periodo` |
| `boicotea` | Desvía sus compras lejos de una firma | Hogar del participante | `max_pct_hogares_boicot`; solo acciones de condición |
| `emprendedor` | Sube su probabilidad de emprender el próximo período | Participante | Intensidad; decae |

- Los efectos que tocan dinero o comida (`gasta`, `ahorra`, `acapara`, `comparte`, `toma`) actúan sobre el **hogar** de la persona.
- El caos espontáneo nunca roba ni ocupa.
- Fuera del mundo base: `resguarda`, `vandaliza` y la acción `disturbios` (como v1).

## 6. Director de caos

Como CAOS_PRENSA_V1 §6 (ritmo, a quién, qué elige, límites), con estos cambios **[propuesta]**:

- **Interés** = 1 + `k_extremo` × rasgos extremos + `k_descontento` × (satisfacción < 30) + `k_reciente` × (modificador nuevo, **incluidos hechos de familia o de bienes**: nacimiento, muerte de un familiar, desalojo, quiebra de su firma, herencia, compra de una firma). El caos le pasa más a quien tiene historia.
- Las candidatas se filtran por requisitos, contexto y **estado del hogar** (por ejemplo, `compras_compulsivas` pide dinero en el hogar).
- Los límites del caos siguen siendo parámetros del mundo.

## 7. Medios

Los medios son **firmas de rubro `medio`** (ECONOMIA_V2 §4). Hay de 0 a muchos; la cantidad evoluciona con el mundo.

```json
{ "id": "f_21", "rubro": "medio", "nombre": "El Heraldo",
  "partes": [{ "npc": "npc_31", "pct": 100 }],
  "linea_editorial": { "afinidad_gobierno": 40, "sensacionalismo": 70 },
  "credibilidad": 65, "alcance_pct": 80, "columnistas": ["npc_58", "npc_62"],
  "ingresos": { "publicidad": 30, "fondos_estado": 20, "dependencia_pct": 40 }, "caja": 15 }
```

- **Dueños y línea editorial [propuesta]:** la línea inicial sale de los dueños (su lealtad media da la afinidad con el gobierno; su rebeldía, codicia y valentía dan el sensacionalismo). Al cambiar los dueños, la línea se mueve de a poco hacia la nueva (`k_linea` por período).
- **Ingresos:** `publicidad` (las firmas la pagan, ECONOMIA_V2 §5, repartida por alcance × credibilidad) y `fondos_estado` (el control de prensa, repartido parejo entre los medios, CONTROLES_V2 §2). Con los ingresos se pagan sueldos de columnistas; el resto va a dueños o caja.
- **Alcance:** crece con los ingresos propios (rendimientos decrecientes) y con los fondos del estado. Los lectores se reparten entre medios según personalidad, lealtad y el alcance de cada uno (**consumo** como v1: da burbujas sin relaciones entre NPCs).
- **Dependencia** = fondos del estado ÷ (publicidad + fondos). Con más dependencia, la afinidad con el gobierno sube sola; sobre `umbral_dependencia_pct` la credibilidad cae y bajo él se recupera de a poco.
- **Fundar, comprar y quebrar:** una persona o firma puede fundar un medio, comprarlo a sus dueños (ECONOMIA_V2 §9) o fusionarlo con otro. Un medio con caja negativa `periodos_para_quebrar` períodos **cierra** y sus columnistas quedan desempleados.
- **Monopolio de medios:** con un solo medio o una cuota alta, la información de la ciudad pasa por una línea; sin alternativa la credibilidad cae despacio si el sensacionalismo es alto **[propuesta]**. Con cero medios nadie se entera del aviso del clima: la policía queda mal ubicada.
- **Campaña** (medida de actor): por unos días el medio publica con un tono fijo sobre un tema (capa del gobernador).

## 8. Noticias

Como CAOS_PRENSA_V1 §8 (relevancia, cola del día, qué publica cada medio, tono, efecto y plantillas), con temas nuevos:

| Tema | Eventos | Relevancia | Valencia |
|---|---|---|---|
| `vivienda` | `calle_pct` sobre su umbral, `desalojo` en masa, casa nueva | Alta | Mala o buena |
| `firmas` | `firma_fundada`, `firma_compra`, `firma_quiebra`, `monopolio` | Media a alta | Mala o buena |
| `demografia` | Nacimiento o muerte relevante, hito de población, ola de muertes | Baja a alta | Neutra o mala |
| `familia` | Herencia grande, pareja o nacimiento destacado | Baja | Neutra |

- El tema `obras` incluye `via_fin` y `zona_abierta` (valencia buena).
- Los de v1 siguen (aviso, clima, ataque, salud, hambre, precio, impago, conflicto, empresas, gobierno, obras, presiones, vecinos, objetivo), salvo que `empresas` se amplía a firmas.
- **Culpa:** el hecho es del gobierno si su cadena de causas llega a un evento `control`. Los hechos de firmas y familias no son culpa del gobierno salvo que la cadena llegue a un control.
- **Capacidad diaria** = columnistas vivos × `noticias_por_columnista`. Elige por relevancia × su interés (el sensacionalismo pesa `ataque`, `conflicto`, `hambre`, `vecinos` y `vivienda`). Autor: un columnista al azar.
- **Tono, efecto y alcance:** como v1; el efecto actúa sobre quienes leen ese medio (magnitud = base del tono × alcance/100 × credibilidad/100 × factor de repetición).
- Plantillas: variables nuevas `{firma}`, `{dueno}`, `{hogar}`, `{familia}`, además de las de v1.

## 9. IA opcional

Como CAOS_PRENSA_V1 §9: clasificador (`elegirAccion`) y generativo (`pedirTexto`), asíncronos, con versión mecánica por defecto. El clasificador recibe además algunos hechos del hogar (sin cifras). Los textos nunca cambian la simulación.

## 10. Pruebas (agente de prototipo)

Las de CAOS_PRENSA_V1 §10, más:

- Cada acción de condición aparece al forzar su disparador; `ocupacion` y `boicot` no pasan sus topes.
- Un medio dependiente pierde credibilidad; un medio sin ingresos cierra; con cero medios, el aviso llega mal.
- Un cambio de dueños mueve la línea editorial de a poco, sin saltos.
- Las noticias de vivienda y firmas aparecen cuando hay calle o fusiones y no hay bucles entre noticias y efectos.
