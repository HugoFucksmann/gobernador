# Mundo (v2.0)

> La simulación sin gobernador: personas, hogares, casas, ciclo de vida, zonas, clima, salud, servicios y seguridad. Economía, firmas y mercado: ECONOMIA_V2.md. Edificios y parcelas: EDIFICIOS_V2.md. Caos y prensa: CAOS_PRENSA_V2.md. Controles, indicadores y eventos: CONTROLES_V2.md. Orden de cálculo y guardado: MOTOR_V2.md. Las reglas que no cambian respecto de v1 se citan como **MUNDO_V1 §n** (los docs v1 se conservan con ese nombre). Escala 0-100 salvo donde se indique. Lo marcado **[propuesta]** se pule; lo demás está decidido.

---

## 1. Principios

- La comunidad no tiene estado propio: se deriva de personas y hogares (sección 11).
- El mundo corre solo, con los controles en el valor del preset (piloto automático). El gobernador solo mueve controles (CONTROLES_V2.md).
- **La población vive:** nacen, crecen, se emparejan, se independizan, envejecen, mueren y heredan. Todo hecho conserva origen y causa.
- **Cada persona tiene familia y hogar.** Cada hogar tiene casa o vive en la calle.
- **La economía es de propiedad:** las personas fundan, compran, heredan y pierden firmas y casas (ECONOMIA_V2).
- Todo efecto es un modificador con origen y causa (MUNDO_V1 §9).
- El motor conoce el espacio por zonas y parcelas. Coordenadas, rutas y dibujo son de la UI.
- Escala configurable de 100 a 5.000 personas: el cálculo diario es O(N) y lo costoso corre por período (MOTOR_V2 §5).

## 2. Persona

```json
{
  "id": "npc_07", "nombre": "Marta", "apellido": "Gil", "edad": 34, "cumple_dia": 212,
  "hogar": "h_12", "pareja": "npc_09", "padres": ["npc_02", "npc_03"],
  "educacion": 1,
  "personalidad": { "valentia": 35, "laboriosidad": 80, "codicia": 60, "rebeldia": 20, "resiliencia": 55 },
  "variables": { "salud": 90, "hambre": 20, "miedo": 10, "satisfaccion": 65, "lealtad": 70 },
  "economia": { "ingreso_pos": 60, "propension_gasto": 45, "propension_emprender": 30 },
  "partes": [{ "firma": "f_3", "pct": 50 }],
  "rol": "comerciante", "empleador": "f_3", "zona": "este", "internado": false, "accion": null,
  "modificadores": []
}
```

- Etapa, `educacion`, `personalidad`, `variables`, `zona efectiva`, `internado`, `accion` y `modificadores` como MUNDO_V1 §2.
- **Familia:** `pareja` y `padres` dan la genealogía; los hijos se derivan de `padres`. El `apellido` se hereda por semilla.
- **`dinero` y `despensa` pasan al hogar** (sección 3). La persona conserva `ingreso_pos`, `propension_gasto` y `propension_emprender` (fija, sale de codicia, laboriosidad y rebeldía más la semilla).
- **`partes`:** su propiedad de firmas (ECONOMIA_V2 §5). Las partes no son un rol: un desempleado puede ser dueño y un empresario puede estar sin partes.
- **`empleador`:** la firma donde trabaja, si es empleado privado.

## 3. Hogar

```json
{ "id": "h_12", "miembros": ["npc_07", "npc_09", "npc_21"], "casa": "c_8",
  "dinero": 140, "despensa": 9, "estado": "con_casa", "periodos_sin_pagar": 0 }
```

- **Unidad de consumo, vivienda y herencia.** Cobra el ingreso de todos sus miembros y paga comida, alquiler, mantenimiento propio y gasto de vida (ECONOMIA_V2 §3).
- **Estados:** `con_casa` o `calle`.
- **Composición:** al menos un adulto. Un menor sin adulto en su hogar pasa al hogar de un pariente (hermano, abuelo, tío por `padres`). Sin pariente, pasa a un **hogar de acogida** **[propuesta]**: lo paga el estado y no ocupa casa.
- **Despensa:** días de comida de todos sus miembros; se conserva solo con casa.
- Los hogares se crean al generar el mundo, por pareja, por independización o por separación por hacinamiento (sección 5), y se disuelven cuando mueren todos sus miembros.

## 4. Casa y vivienda

- **Casa:** ocupa una parcela residencial. Tiene `capacidad` de personas, `estado` (0-100), `dueno` (un hogar, una persona o una firma inmobiliaria) y `alquiler` por período. Catálogo: EDIFICIOS_V2 §2.
- **Habitar:** un hogar vive en una casa si es dueño o paga el alquiler. Una casa solo aloja a un hogar. Un hogar mayor que la capacidad está **hacinado**: baja la satisfacción y, pasado un tiempo, se parte en dos hogares si hay casa libre y ingreso.
- **Estado de la casa:** decae con el tiempo; el dueño la repara pagando a una firma de construcción (con el alquiler, o con su dinero). Con estado bajo, la casa pierde capacidad útil y sube el malestar de quien vive ahí.
- **Mercado de vivienda** (cada día de pago, ECONOMIA_V2 §7): los hogares sin casa, hacinados o con un alquiler que supera `pct_alquiler_max` de su ingreso se postulan a las casas libres; cada casa va al postulante que más puede pagar (empate: sorteo con semilla).
- **Calle:** el hogar sin casa ocupa espacio público de una zona (la de su último hogar o la de su trabajo).
  - Efectos: satisfacción y salud bajan, la despensa no se conserva, la comida le cuesta más y le cuesta conseguir empleo (productividad y contratación reducidas).
  - **Se sale de la calle** con una casa libre que pueda pagar. No hay refugio ni vivienda pública en el mundo base **[propuesta]**.
- **Desalojo:** tras `periodos_sin_pagar_alquiler` consecutivos el hogar pierde la casa y pasa a calle.
- **Casa vacía:** sale al mercado; si nadie la toma y no se repara, se deteriora. Las condiciones extremas pueden dejar una ocupación (acción de condición, ACCIONES_V2).

## 5. Ciclo de vida

Cada evento que cambia la composición de un hogar genera un evento con origen (CONTROLES_V2 §5).

- **Etapas** como v1: menor (< 18), adulto (18-64), jubilado (65 o más). La edad sube en su `cumple_dia`.
- **Mortalidad por edad:** probabilidad diaria que crece con la edad (casi nula hasta la adultez, alta en la vejez), más las causas de MUNDO_V1 §6 (golpes, hambre crítica). No es evitable por el estado: no suma `culpa`.
- **Educación:** al egresar a los 18, el nivel sale de la aptitud (laboriosidad, resiliencia), del ingreso de su hogar y de la oferta educativa de su zona **[propuesta]**; no hay educación como servicio en el mundo base.
- **Parejas:** cada período demográfico, adultos solteros se emparejan por cercanía de zona, edades próximas y afinidad de personalidad. La pareja se muda a un solo hogar (el que tenga casa más grande; si ninguno tiene, a calle o al hogar de los padres).
- **Nacimientos:** cada período demográfico, un hogar con una pareja en edad fértil (`edad_fertil`), casa con lugar y satisfacción sobre `umbral_natalidad` tira un nacimiento. La probabilidad baja con ingreso insuficiente o falta de espacio; hay un `tope_natalidad` global por período. El bebé nace menor, en ese hogar, con rasgos mezclados de sus padres más la semilla.
- **Independización:** a partir de `edad_independizacion`, un hijo con ingreso suficiente y una casa libre que pueda pagar forma hogar propio; si no, se queda.
- **Separaciones:** una pareja puede separarse (probabilidad baja, sube con la pobreza y el hacinamiento). Los bienes y los hijos se reparten por regla fija **[propuesta]**.
- **Muerte y herencia:** al morir una persona, su `dinero` es del hogar. Sus partes de firma pasan al cónyuge y a los hijos en partes iguales (ECONOMIA_V2 §9). Si muere el último miembro, el hogar se disuelve y todo (dinero, casa, partes) va a sus hijos adultos (cada uno a su hogar), o a un pariente, o al estado si no hay nadie.
- **Duelo:** como MUNDO_V1 §6: baja la satisfacción en su hogar y su zona, más lealtad solo en muertes evitables.
- **Longevidad del mundo:** con las reglas correctas, la población se sostiene o se acomoda a la economía; no hay tope artificial salvo `tope_natalidad`.

## 6. Salud

Como MUNDO_V1 §6 (golpes, hambre crítica, vulnerabilidad por edad, hospital, cura, muerte), con estos cambios:

- La **calle** suma un recargo diario de daño y frena la cura natural.
- La **mortalidad por edad** es una causa más.
- Al morir: sale de su hogar, su puesto queda vacante, si era columnista sale de su medio y se abre la herencia (sección 5).

## 7. Roles

```json
[
  { "id": "estudiante",   "edad": [0, 24],   "educ_min": 0, "estudia": true },
  { "id": "agricultor",   "edad": [18, 64],  "educ_min": 0, "afinidad": "laboriosidad", "rubro": "agro" },
  { "id": "tecnico",      "edad": [18, 64],  "educ_min": 2, "afinidad": "laboriosidad", "rubro": "agro", "produce": "tecnificacion" },
  { "id": "obrero",       "edad": [18, 64],  "educ_min": 0, "afinidad": "laboriosidad", "rubro": "comercio|construccion" },
  { "id": "comerciante",  "edad": [18, 64],  "educ_min": 1, "afinidad": "codicia",      "rubro": "comercio", "produce": "comercio" },
  { "id": "constructor",  "edad": [18, 64],  "educ_min": 1, "afinidad": "laboriosidad", "rubro": "construccion" },
  { "id": "inmobiliario", "edad": [18, 64],  "educ_min": 2, "afinidad": "codicia",      "rubro": "inmobiliaria" },
  { "id": "empresario",   "edad": [18, 64],  "educ_min": 2, "afinidad": "codicia",      "gerencia": true },
  { "id": "periodista",   "edad": [18, 64],  "educ_min": 2, "afinidad": "rebeldia",     "rubro": "medio", "produce": "informacion" },
  { "id": "policia",      "edad": [18, 64],  "educ_min": 1, "afinidad": "valentia",     "publico": true, "produce": "seguridad" },
  { "id": "medico",       "edad": [18, 64],  "educ_min": 3, "afinidad": "laboriosidad", "publico": true, "produce": "salud" },
  { "id": "ingeniero",    "edad": [18, 64],  "educ_min": 3, "afinidad": "laboriosidad", "publico": true, "produce": "infraestructura" },
  { "id": "estatal",      "edad": [18, 64],  "educ_min": 1, "afinidad": "laboriosidad", "publico": true },
  { "id": "docente",      "edad": [18, 64],  "educ_min": 2, "afinidad": "laboriosidad", "publico": true },
  { "id": "desempleado",  "edad": [18, 64],  "educ_min": 0 },
  { "id": "jubilado",     "edad": [65, null], "educ_min": 0 }
]
```

- **Privados:** trabajan en una firma (empleador) y cobran según ECONOMIA_V2 §5. El `empresario` gerencia: es quien dirige una firma y suele ser su dueño; si no tiene partes, cobra sueldo de gerente **[propuesta]**.
- **Públicos y grupos:** como MUNDO_V1 §3. Los puestos públicos los dan los edificios del estado (EDIFICIOS_V2 §3).
- **Puestos privados:** los dan los locales de las firmas (EDIFICIOS_V2 §4).
- **Cambios de rol:** el egreso de estudiante, el cambio por afinidad entre roles con vacante, el pase a puestos públicos y la regla de desempleo siguen MUNDO_V1 §3. Además, el adulto **desempleado** busca puestos en firmas con vacantes y, si tiene ahorro y propensión, puede **emprender** (ECONOMIA_V2 §8).
- **Vacantes:** puestos − ocupados. Las firmas contratan según ECONOMIA_V2 §5; las vacantes públicas, por MUNDO_V1 §3.
- Estar desempleado y en la calle bajan la satisfacción.

## 8. Zonas y parcelas

- **8 a 12 zonas** (más con escala alta), con vecindad dibujable sin cruces y distancia en pasos como MUNDO_V1 §4.
- **Tipos de parcela:** `residencial`, `comercial`, `agricola`, `publica` y `especial`. Cada zona define cuántas de cada tipo y en qué orden. `especial` reserva puntos de interés del mapa (plaza, puerto, muelle de comercio exterior) y no se edifica.
- **Estados:** `bloqueada` (se habilita más adelante por hitos, capa del gobernador), `libre`, `en_obra`, `ocupada`.
- Cada parcela tiene un lugar fijo en el terreno (UI); sus eventos se ven ahí.
- **Carácter de zona [propuesta]:** centro con comercios y edificios públicos, anillo residencial, periferia con campos. Los precios de alquiler y la demanda de comercio varían por zona.
- Las parcelas libres son compartidas: las ocupan firmas, hogares y el estado (sección 9). Quien llega primero según el orden de ejecución de ese día la ocupa.

## 9. Clima, servicios, seguridad y estado

- **Clima:** como MUNDO_V1 §5. Los fenómenos del preset siguen igual; en el mundo base se usan con prudencia (con M2).
- **Servicios, seguridad, defensa, orden e integridad:** como MUNDO_V1 §7 y §8, con estos cambios:
  - La referencia de cobertura se calcula sobre la **población actual** de cada zona (no la inicial), así los nacimientos y las muertes ajustan sin desbalancear.
  - La **calle** suma miedo y necesidad de orden en su zona.
- **Estado en piloto automático [propuesta]:** sin gobernador, el estado sostiene los servicios con una regla fija: cuando la cobertura de policía o médico cae bajo la referencia y la reserva alcanza, construye una comisaría u hospital en una parcela pública libre; cuando sobra capacidad por mucho tiempo, no demuele. Esta regla existe solo para calibrar y desaparece cuando entra el gobernador (CONTROLES_V2 §1).
- **Viviendas y locales** no son del estado en el mundo base.

## 10. Variables de la persona

Como MUNDO_V1 §10 (productividad, hambre, miedo, satisfacción, lealtad), más:

- **Satisfacción** suma: casa propia (+), calle (−−), hacinamiento (−), casa en mal estado (−), alquiler que pesa en el ingreso (−), hijos o pareja en el hogar (+ leve), pérdida de un familiar (− con inercia), hijos con comida insuficiente (−).
- **Productividad:** en la calle, baja. Fuera de su puesto o internado, no produce (como v1).

## 11. Comunidad (derivada)

```json
{
  "poblacion": 640, "poblacion_pct": 104, "satisfaccion_media": 58, "apoyo_pct": 54,
  "descontentos_pct": 17, "hambre_critica_pct": 4, "sin_dinero_pct": 12, "hospital_ocupacion_pct": 40,
  "hogares": 210, "calle_pct": 6, "hacinamiento_pct": 4, "alquiler_carga_media_pct": 28,
  "natalidad": 1.2, "mortalidad": 1.0, "edad_media": 38, "pct_menores": 22, "pct_jubilados": 14,
  "defensa": { "centro": 40 }, "orden": { "centro": 60 }, "amenaza": { "centro": 0 },
  "productividad_total": 6800, "roles": { "agricultor": 120 },
  "mercado": { "firmas": 38, "cuota_mayor_pct": 31, "quiebras_periodo": 1, "fundaciones_periodo": 2 }
}
```

- Como MUNDO_V1 §11 (denominadores, `apoyo_pct`, `poblacion_pct`, `hospital_ocupacion_pct`), más los de hogares, vivienda, demografía y mercado.
- `poblacion_pct` = vivos ÷ población inicial × 100 (puede pasar de 100).
- `calle_pct` = hogares en calle ÷ hogares. `hacinamiento_pct` = hogares hacinados ÷ hogares con casa. `natalidad` y `mortalidad` = por cada 100 personas, por año de juego.
- **Historial:** las seis series de v1 más `poblacion`, `calle_pct`, `edad_media` y `cuota_mayor_pct`. Ninguna regla las usa.

## 12. Generación del mundo

El generador (con semilla) arma un mundo consistente y cierra las cuentas de ECONOMIA_V2 §14:

1. Zonas, vecindad y parcelas por tipo.
2. Pirámide de edades y hogares por familias: parejas, hijos, abuelos, solos, con `padres` y `pareja` coherentes.
3. Educación, roles y personalidad de cada persona.
4. Casas: se asignan una por hogar según capacidad y se reparte la propiedad entre hogares, personas e inmobiliarias; algunos hogares empiezan en la calle.
5. Firmas por rubro, sus locales y dueños (por `partes`), medios con columnistas, y los edificios públicos iniciales.
6. Valores iniciales: reserva, stock, dinero de los hogares, caja de las firmas.

El mundo arranca equilibrado; lo desajustan el clima, el caos y el propio mercado.

## 13. Niveles del mundo

Cada nivel suma sin cambiar los controles (CONTROLES_V2 §2):

| Nivel | Qué tiene |
|---|---|
| **M0** | Hogares, casas, ciclo de vida, familias, calle y mercado de vivienda, con la economía de v1 (dos firmas fijas) |
| **M1** | + firmas genéricas, propiedad, emprender, comprar, crecer, quebrar, alquiler y publicidad |
| **M2** | + zonas completas, clima, salud, servicios, seguridad y estado en piloto automático |
| **M3** | + caos y prensa con medios como firmas |
| **M4** | + extensión `fiscal` y crédito |
| Futuro | Zombis como agentes, edificios con integridad propia, coordenadas y combate (promoción por necesidad, MOTOR_V2 §7) |
