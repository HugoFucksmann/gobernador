# Mundo

> La simulación sin gobernador: personas, hogares, casas, ciclo de vida, salud, zonas, clima, servicios y seguridad. Economía, firmas y mercado: ECONOMIA.md. Edificios y obras: EDIFICIOS.md. Territorio y rutas: MAPA.md. Caos y prensa: CAOS_PRENSA.md. Controles, indicadores y eventos: CONTROLES.md. Orden de cálculo y guardado: MOTOR.md. Escala 0-100 salvo donde se indique. Los valores son parámetros con nombre del preset. Lo marcado **[propuesta]** se pule; lo demás está decidido.

---

## 1. Principios

- La comunidad no tiene estado propio: se deriva de personas y hogares (§11).
- El mundo corre solo, con los controles en el valor del preset (piloto automático). El gobernador solo mueve controles (CONTROLES.md).
- **La población vive:** nacen, crecen, se emparejan, se independizan, envejecen, mueren y heredan. Todo hecho conserva origen y causa.
- **Cada persona tiene familia y hogar.** Cada hogar tiene casa o vive en la calle.
- **La economía es de propiedad:** las personas fundan, compran, heredan y pierden firmas y casas (ECONOMIA.md).
- Todo efecto es un modificador con origen y causa (§10).
- El motor conoce el espacio por la grilla de baldosas, lotes y zonas (MAPA.md). Las coordenadas son del motor; la UI solo las dibuja.
- Al generar el mundo todo encaja; lo desajustan el clima, el caos y el propio mercado. Si el caos se detiene, la comunidad se recupera sola.
- Escala configurable de 100 a 5.000 personas: el cálculo diario es O(N) y lo costoso corre por período (MOTOR §5).

## 2. Persona

```json
{
  "id": "npc_07", "nombre": "Marta", "apellido": "Gil", "edad": 34, "cumple_dia": 212,
  "hogar": "h_12", "pareja": "npc_09", "padres": ["npc_02", "npc_03"],
  "educacion": 1,
  "personalidad": { "valentia": 35, "laboriosidad": 80, "codicia": 60, "rebeldia": 20, "resiliencia": 55, "sociabilidad": 50 },
  "variables": { "salud": 90, "hambre": 20, "miedo": 10, "satisfaccion": 65, "lealtad": 70 },
  "economia": { "ingreso_pos": 60, "propension_gasto": 45, "propension_emprender": 30 },
  "ritmo": { "cronotipo": -1, "gustos": { "bienes": 30, "gastronomia": 40, "servicios": 10, "entretenimiento": 20 }, "habitos": ["l_club_2", "l_bar_5"] },
  "partes": [{ "firma": "f_3", "pct": 50 }],
  "rol": "comerciante", "empleador": "f_3", "zona": "este", "internado": false, "accion": null,
  "modificadores": [
    { "id": "mod_3", "afecta": { "miedo": 10, "rebeldia": 10 }, "duracion_dias": 5,
      "origen": "accion:predicar/npc_12", "causa": "ev_88", "texto": "Anda alterada desde que oyó predicar a Joaquín" }
  ]
}
```

- **Etapa** (derivada de `edad`): menor (< 18) estudia; adulto (18-64) trabaja; jubilado (65 o más) no trabaja. La edad sube en su `cumple_dia`, fijado por semilla.
- **`educacion`:** 0 sin estudios, 1 básico, 2 medio, 3 superior. Define a qué roles accede. Se fija al generar el mundo (a los menores, el nivel con el que egresan) y al egresar (§5).
- **`personalidad`:** fija. Las reglas usan el valor **efectivo** = base + modificadores, acotado a 0-100.
- **`variables`:** cambian. Salud 0 = muere.
- **`economia`:** `ingreso_pos` (posición fija en el rango de su rol), `propension_gasto` (fija, sale de la personalidad y la semilla) y `propension_emprender` (fija, sale de codicia, laboriosidad y rebeldía más la semilla). `dinero` y `despensa` son del hogar (§3).
- **`zona`:** asignada al generar el mundo según su rol. Su **zona efectiva** es la `zona_destino` de su acción si la tiene; si está internado, la zona de su hospital; si no, su `zona`. Todo lo que pasa en un lugar usa la zona efectiva.
- **`internado`:** está en el hospital (§6). Se guarda porque depende de las camas y del orden de espera.
- **`accion`:** la acción en curso (CAOS_PRENSA.md).
- **Familia:** `pareja` y `padres` dan la genealogía; los hijos se derivan de `padres`. El `apellido` se hereda por semilla.
- **`partes`:** su propiedad de firmas (ECONOMIA §5). No son un rol: un desempleado puede ser dueño y un empresario puede estar sin partes.
- **`empleador`:** la firma donde trabaja, si es empleado privado.
- **Personalidad y rutina:** cada rasgo tiene efecto en el día a día (detalle en MOTOR §7). Los rasgos y el `ritmo` salen de la semilla y se mezclan al nacer.

| Rasgo / dato | Efecto |
|---|---|
| `laboriosidad` | puntualidad, productividad, emprender |
| `codicia` | ahorro frente a gasto, comprar firmas, aceptar un alquiler caro |
| `valentia` | riesgo, emprender, salir de noche |
| `rebeldia` | faltazgos, protesta (caos) |
| `resiliencia` | velocidad de recuperación de la satisfacción |
| `sociabilidad` | ocio fuera de casa, visitas, pareja, hijos |
| `ritmo.cronotipo` | desfase de horas (−2 a +2) en salida y regreso; derivado de la semilla y la edad |
| `ritmo.gustos` | pesos por categoría de gasto: dispersan el consumo |
| `ritmo.habitos` | 2-3 lugares de ocio y compras habituales |

## 3. Hogar

```json
{ "id": "h_12", "miembros": ["npc_07", "npc_09", "npc_21"], "casa": "c_8",
  "dinero": 140, "despensa": 9, "estado": "con_casa", "periodos_sin_pagar": 0 }
```

- **Unidad de consumo, vivienda y herencia.** Cobra el ingreso de todos sus miembros y paga comida, alquiler, mantenimiento propio y gasto de vida (ECONOMIA §3).
- **Estados:** `con_casa`, `calle` o `acogida`.
- **Composición:** al menos un adulto. Un menor sin adulto en su hogar pasa al hogar de un pariente (hermano, abuelo, tío, por `padres`). Sin pariente, pasa a un **hogar de acogida** **[propuesta]**: lo paga el estado y no ocupa casa.
- **Despensa:** días de comida de todos sus miembros; se conserva solo con casa.
- Los hogares se crean al generar el mundo, por pareja, por independización o por separación por hacinamiento (§5), y se disuelven cuando mueren todos sus miembros.

## 4. Casa y vivienda

- **Casa:** ocupa un lote residencial. Tiene `capacidad` de personas, `estado` (0-100), `dueno` (un hogar, una persona o una firma inmobiliaria) y `alquiler` por período. Catálogo: EDIFICIOS §2.
- **Habitar:** un hogar vive en una casa si es dueño o paga el alquiler. Una casa solo aloja a un hogar. Un hogar mayor que la capacidad está **hacinado**: baja la satisfacción y, pasado un tiempo, se parte en dos hogares si hay casa libre y ingreso.
- **Estado de la casa:** decae con el tiempo; el dueño la repara pagando a una firma de construcción (con el alquiler o con su dinero). Con estado bajo, la casa pierde capacidad útil y sube el malestar de quien vive ahí.
- **Mercado de vivienda** (cada día de pago, ECONOMIA §7): los hogares sin casa, hacinados o con un alquiler que supera `pct_alquiler_max` de su ingreso se postulan a las casas libres; cada casa va al postulante que más puede pagar (empate: sorteo con semilla).
- **Calle:** el hogar sin casa ocupa espacio público de una zona (la de su último hogar o la de su trabajo).
  - Efectos: satisfacción y salud bajan, la despensa no se conserva, la comida le cuesta más y le cuesta conseguir empleo (productividad y contratación reducidas).
  - Se sale de la calle con una casa libre que pueda pagar. No hay refugio ni vivienda pública en el mundo base **[propuesta]**.
- **Desalojo:** tras `periodos_sin_pagar_alquiler` consecutivos el hogar pierde la casa y pasa a calle.
- **Casa vacía:** sale al mercado; si nadie la toma y no se repara, se deteriora. Las condiciones extremas pueden dejar una ocupación (acción `ocupacion`, ACCIONES.md).

## 5. Ciclo de vida

Cada evento que cambia la composición de un hogar genera un evento con origen (CONTROLES §5).

- **Mortalidad por edad:** probabilidad diaria que crece con la edad (casi nula hasta la adultez, alta en la vejez), más las causas de §6 (golpes, hambre crítica). No es evitable por el estado: no suma `culpa`.
- **Educación:** al egresar a los 18, el nivel sale de la aptitud (laboriosidad, resiliencia), del ingreso de su hogar y de los edificios educativos al alcance por ruta **[propuesta]**: el nivel 2 pide una `escuela` al alcance y el nivel 3 una `universidad`. Sin ellas, el tope es 1 y 2 respectivamente. No hay carreras ni pipeline por oficio.
- **Parejas:** cada período demográfico, adultos solteros se emparejan por cercanía de zona, edades próximas y afinidad de personalidad. La pareja se muda a un solo hogar (el que tenga casa más grande; si ninguno tiene, a calle o al hogar de los padres).
- **Nacimientos:** cada período demográfico, un hogar con una pareja en edad fértil (`edad_fertil`), casa con lugar y satisfacción sobre `umbral_natalidad` tira un nacimiento. La probabilidad baja con ingreso insuficiente o falta de espacio; hay un `tope_natalidad` global por período. El bebé nace menor, en ese hogar, con rasgos mezclados de sus padres más la semilla.
- **Independización:** a partir de `edad_independizacion`, un hijo con ingreso suficiente y una casa libre que pueda pagar forma hogar propio; si no, se queda.
- **Separaciones:** una pareja puede separarse (probabilidad baja, sube con la pobreza y el hacinamiento). Los bienes y los hijos se reparten por regla fija **[propuesta]**.
- **Muerte y herencia:** al morir una persona, su `dinero` es del hogar. Sus partes de firma pasan al cónyuge y a los hijos en partes iguales (ECONOMIA §9). Si muere el último miembro, el hogar se disuelve y todo (dinero, casa, partes) va a sus hijos adultos (cada uno a su hogar), o a un pariente, o al estado si no hay nadie.
- **Migración [propuesta]:** cada período demográfico, si hay casas libres y vacantes, llegan hasta `max_llegadas` hogares nuevos (personas generadas por semilla) con `dinero_migrante`, que entra como dinero del exterior (ECONOMIA §12). Se van los hogares sin casa propia ni partes de firma que llevan más de `periodos_para_emigrar` en la calle o con satisfacción bajo `umbral_emigrar` sostenida; su dinero sale del mundo. Eventos `migracion_llegada` y `migracion_salida` con causa. Es la válvula contra la extinción en mundos chicos; `max_llegadas` en 0 la apaga.
- **Capacitación:** si un puesto crítico (médico, docente, policía, ingeniero u otro con `educ_min`) queda vacante más de `periodos_vacante_critica` y nadie cumple la educación pedida, un adulto de aptitud alta (laboriosidad, resiliencia) y menos de `edad_max_capacitacion` se capacita durante `periodos_capacitacion`: no trabaja ese tiempo, su hogar paga `costo_capacitacion` y al terminar sube un nivel de `educacion` hasta el máximo que permiten las escuelas y universidades al alcance. Eventos `capacitacion_inicio` y `capacitacion_fin` con causa. Permite que un mundo chico cubra un rol que le falta sin esperar una generación. Como el nivel 3 exige una `universidad` al alcance, el generador siempre crea una (§12), también en mundos de 100 personas.
- **Longevidad del mundo:** con las reglas correctas, la población se sostiene o se acomoda a la economía; no hay tope artificial salvo `tope_natalidad`.

## 6. Salud

Solo estas causas restan salud, cada una con su forma de combatirla:

1. **Golpes** de la plaga zombie y la pandemia (§9): seguridad (zombis) y hospital (los dos).
2. **Hambre crítica:** daño diario con el hambre sobre su umbral; se combate con la comida (ECONOMIA §6).
3. **Vulnerabilidad por edad:** menores y mayores de 65 reciben más daño por golpe (`k_vulnerabilidad`) y los jubilados arrancan con menos salud **[propuesta]**.
4. **Deriva diaria:** `salud` baja con la edad, la calle (recargo diario y cura natural frenada) y el hambre. No hay subsistema de enfermedad común: al caer bajo el umbral de internación la persona va al hospital, así que el hospital trabaja aunque no haya golpes.

Orden diario: golpes → deriva y hambre crítica → internación → cura → muerte (salud 0).

- **Hospital:** pide cama quien tiene salud < `umbral_hospital`. Camas de cada hospital = min(camas del edificio, sus médicos × `pacientes_por_medico`); un hospital de campaña suma sus camas sin médicos, con la mitad de la cura. Se interna primero a los de menor salud, en el hospital con cama libre más cercano por ruta (su zona pasa a ser la zona efectiva); el resto espera en su casa. El internado no produce ni recibe ataques, se cura `cura_base` × (0,5 + 0,5 × indicador `salud`/100) por día y sale con salud ≥ `alta`.
- **Cura natural:** quien no está internado se cura `cura_natural` por día si su hambre está bajo su umbral.
- **Muerte:** sale de su hogar y de la población, su puesto queda vacante, si era columnista sale de su medio y se abre la herencia (§5). La mortalidad por edad es una causa más.
- **Duelo:** cada muerte baja la satisfacción (−`duelo`) en su hogar y su zona. Si murió por una causa que el estado pudo evitar (esperando cama, hambre crítica o golpe zombie), suma también un modificador de lealtad (−`culpa`) en toda la ciudad, con causa en la muerte. Una comunidad que pierde gente lo siente y se lo cobra al gobierno.

## 7. Roles

```json
[
  { "id": "estudiante",   "edad": [0, 24],   "educ_min": 0, "estudia": true },
  { "id": "agricultor",   "edad": [18, 64],  "educ_min": 0, "afinidad": "laboriosidad", "rubro": "agro" },
  { "id": "tecnico",      "edad": [18, 64],  "educ_min": 2, "afinidad": "laboriosidad", "rubro": "agro|industria", "produce": "tecnificacion" },
  { "id": "obrero",       "edad": [18, 64],  "educ_min": 0, "afinidad": "laboriosidad", "rubro": "agro|industria|comercio|gastronomia|servicios|entretenimiento|construccion" },
  { "id": "comerciante",  "edad": [18, 64],  "educ_min": 1, "afinidad": "codicia",      "rubro": "comercio|gastronomia|servicios|entretenimiento", "produce": "comercio" },
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

- **Privados:** trabajan en una firma (`empleador`) y cobran según ECONOMIA §5. El `empresario` gerencia: dirige una firma y suele ser su dueño; si no tiene partes, cobra sueldo de gerente **[propuesta]**. Los puestos los dan los locales de las firmas (EDIFICIOS §4); los técnicos, hasta `tecnicos_por_agricultor` por agricultor.
- **Públicos:** cobran `salario_publico`. Los puestos los dan los edificios del estado (EDIFICIOS §3); los de ingeniero, el nivel de obras (CONTROLES §2). Los estatales solo cuentan en la nómina.
- **Técnico:** sube la producción de `agro` e `industria`. **Comerciante:** su cantidad da la capacidad de comercio exterior (ECONOMIA §11). **Periodista:** columnista de un medio; limita cuánto publica (CAOS_PRENSA §8).
- **Grupos** (para resúmenes y ayuda social): `sin_ingreso` (estudiante, desempleado, jubilado), `publico` (policía, estatal, docente, médico, ingeniero) y los privados por el rubro de su firma.

**Cambios de rol**

- El menor es `estudiante`. Egresa cuando `edad` ≥ 18 (se evalúa cada día) y elige rol.
- Un adulto puede cambiar, cada cierto tiempo, a un rol con vacante para el que cumpla edad y educación. Elige por afinidad.
- **Vacantes** = puestos − ocupados. Las firmas contratan según ECONOMIA §5; las públicas se cubren primero con desempleados. Un empleado privado solo pasa a un puesto público si no hay desempleado que cumpla los requisitos, y como máximo `max_pase_a_publico_por_periodo` por período.
- El **desempleado** busca puestos en firmas con vacantes dentro de `ruta_max_trabajo` y, si tiene ahorro y propensión, puede **emprender** (ECONOMIA §8).
- Si bajan los puestos de un rol, los que sobran pasan a desempleados al ritmo `max_pase_desempleo_por_dia`.
- Pasado el tope de edad de su rol sin llegar a 65, pasa a desempleado. A los 65, a jubilado.
- Estar desempleado y estar en la calle bajan la satisfacción.

## 8. Zonas y parcelas

> El territorio es una grilla de baldosas con calles y lotes (MAPA.md). "Parcela" y "lote" son lo mismo. Las zonas son regiones de baldosas, su vecindad se deriva de la contigüidad y la red de rutas sale de las baldosas de vía.

- **Cantidad de zonas activas al empezar** = `poblacion_inicial` ÷ `personas_por_zona`, redondeada y acotada entre 4 y 12 (más zonas con escala alta solo si el preset sube el tope). Así ninguna zona nace casi vacía: con 100 personas salen 4 zonas, con 500 y más se llega a 8-12. Más las zonas `no_urbanizada` que traiga el preset. Un mundo de una zona es solo para el perfil `minimo` de pruebas.
- **Distancia entre zonas** = número de pasos entre vecinas (en un empate, el primero de la configuración). La usan el clima, los ataques y el orden.
- **Tipos de parcela:** `residencial`, `comercial`, `agricola`, `industrial`, `publica` y `especial`. Cada zona define cuántas de cada tipo y en qué orden. `especial` reserva puntos de interés del mapa (plaza, puerto, muelle de comercio exterior) y no se edifica.
- **Estados:** `sin_calle` (existe en el suelo urbanizable pero no tiene acceso), `libre`, `en_obra`, `ocupada`. Una parcela `sin_calle` no admite obra.
- **Carácter de zona [propuesta]:** centro con comercios y edificios públicos, anillo residencial, periferia con campos. Los precios de alquiler y la demanda de comercio varían por zona.
- **La ciudad se expande solo por vías:** no hay parcelas nuevas sin una vía que las abra (EDIFICIOS §3b, MAPA §7). Solo el estado construye vías; los hogares y las firmas construyen sobre lo que el estado abre. El estado paga el mantenimiento de cada tramo el día de pago: sin pago el `estado` del tramo baja, y con él la `infraestructura` de la zona y la capacidad de venta de los locales de su frente.
- **Red de rutas y distancia entre parcelas:** MAPA §6. Un tramo en estado 0 es intransitable: si hay otra ruta se usa (más larga y cara); si no, la parcela queda aislada.
- **Dónde se usa la distancia por ruta:** elección de vendedor y de casa, búsqueda de trabajo (hasta `ruta_max_trabajo`), hospital más cercano y la rutina que dibuja la UI. Ataques, clima y orden usan la distancia entre zonas.
- **Traslado:** la productividad baja con el costo de la ruta casa-trabajo (`k_traslado`) **[propuesta]**. Cortar o deteriorar un tramo clave alarga rutas, baja ventas y productividad, y aparece en las noticias de obras.
- **Demanda de suelo:** indicador por zona y tipo de parcela = demanda (hogares sin casa, firmas con caja para un local o campo) ÷ parcelas libres. Es lo que dispara la obra de vías en piloto automático (§9).
- Las parcelas libres son compartidas: las ocupan firmas, hogares y el estado. Quien llega primero según el orden de ejecución de ese día la ocupa.

## 9. Clima, servicios, seguridad y estado

### Clima

```json
{ "fenomenos": [ { "tipo": "sequia", "intensidad": 60, "inicio_dia": 140, "duracion_dias": 30, "aviso_dias": 5, "origen": null, "crecimiento_dia": 0 } ] }
```

| Tipo | Efecto | Protección |
|---|---|---|
| `sequia` | Baja la producción de comida y sube el precio (interno y externo) | — |
| `plaga` | Igual que la sequía | — |
| `pandemia` | Golpes de salud a personas individuales | Ninguna (se enfrenta con el hospital) |
| `plaga_zombie` | Golpes de salud y miedo; su intensidad crece. No crea zombis como agentes | `defensa` de las zonas del camino |

- **`aviso_dias`:** anticipación del anuncio. La prensa lo cuenta (CAOS_PRENSA §8) y así se entera la gente.
- **`origen`:** zona de donde vienen los ataques. Sin origen, actúa parejo en toda la ciudad.
- **`crecimiento_dia`:** suba diaria de intensidad, con tope 100. Las hordas son fenómenos `plaga_zombie` adicionales, cortos e intensos.
- **Ataques:** cada día, cada fenómeno con daño tira por cada persona viva no internada, con probabilidad `exposicion_max` × intensidad/100 × `atenuacion`^distancia (desde el origen a su zona efectiva). Si el tipo tiene protección, el ataque tiene que pasar cada zona del camino, incluida la suya: cada una lo repele con probabilidad `proteccion_max` × `defensa`/100. Si pasa todas, es un **golpe**: resta salud al azar dentro de `dano`, por la vulnerabilidad de su edad. Un golpe de `plaga_zombie` también daña la integridad de la zona.
- En el mundo base los fenómenos del preset se usan con prudencia (con M2).

### Servicios

Indicadores de servicio: `seguridad`, `salud` (calidad de atención, no la salud de la gente) e `infraestructura`.

- **Cobertura** = min(1, profesionales del rol ÷ profesionales de referencia). La referencia se calcula sobre la **población actual** de cada zona, así los nacimientos y las muertes ajustan sin desbalancear.
- **Inversión** = fondos pagados al área (mantenimiento u operación) ÷ costo base del área (proporcional a la población), con rendimientos decrecientes sobre 1.
- Indicador += cobertura × inversión − decaimiento.
- Seguridad y salud dependen de lo construido: los puestos salen de comisarías y hospitales, y la inversión es su mantenimiento, que el estado paga en cada día de pago (si no lo paga, el indicador cae). Infraestructura depende del nivel de obras (puestos de ingeniero y operación) y del estado de las vías.
- **Cobertura baja:** si la de policía o médico cae bajo un umbral, suma un recargo gradual de miedo (policía) o malestar (médicos).

| Indicador | Qué hace |
|---|---|
| `seguridad` | Baja el miedo y, repartida por zona como `defensa`, frena los ataques zombie |
| `salud` | Rapidez de cura en el hospital (las camas las dan los médicos) |
| `infraestructura` | Sube la productividad, acelera la reparación de las zonas y acorta los días de obra |

### Seguridad por zona

- **Policía:** cada policía da defensa y orden en la zona donde está. Los nuevos arrancan en la zona de una comisaría. La defensa solo frena fenómenos con protección; el orden frena el caos espontáneo. La tensión está en dónde están.
- **Reubicación:** cada día un % de los policías se muda a una zona sorteada con peso según su necesidad total = amenaza percibida + necesidad de orden, con necesidad de orden = min(100, % de la zona con acción espontánea + % de descontentos). Si todas valen 0, no se mueven. La **calle** suma miedo y necesidad de orden en su zona.
- **Amenaza percibida** (derivada): el mayor entre el aviso (en la zona de origen, el mejor alcance × credibilidad/100 de las noticias de aviso vigentes) y los golpes recientes en la zona (tope 100). La gente percibe, no sabe: un aviso tardío o poco creíble deja a la policía mal ubicada.
- **Defensa** (derivada) = min(100, `seguridad` × (1 − c + c × n × parte)) + bonus de comisaría y muralla de la zona (EDIFICIOS §3 y §5), todo × (1 − `k_integridad` × (1 − integridad/100)) y con tope 100, con parte = policías de la zona ÷ policías totales (1/n sin policías), n = cantidad de zonas y c = `movilidad_defensa`.
- **Orden** (derivado) = min(100, 100 × (policías de la zona ÷ población de la zona) ÷ `objetivo_orden`), con la población por zona efectiva. Frena el contagio espontáneo (CAOS_PRENSA §4).
- **Integridad** (estado, 0-100, arranca en 100): cuánto aguanta la zona. Cada golpe de `plaga_zombie` le resta `dano_integridad`; una integridad baja reduce la defensa, así que el daño se acumula. Reparación diaria = `rep_por_npc` × reparadores × (0,5 + 0,5 × `infraestructura`/100), con tope 100. Reparadores: obreros e ingenieros de esa zona efectiva, no internados ni fuera de su puesto.

### Estado en piloto automático

Sin gobernador, el estado sostiene el mundo con reglas fijas que existen solo para calibrar y desaparecen cuando entra el gobernador. Son un interruptor del preset (CONTROLES §1). Corren el día de pago, después del mercado (MOTOR §2, paso 10), en este orden:

1. **Ajuste fiscal:** si hay impago, o la reserva queda bajo `reserva_min_dias` de gasto corriente, sube `tasa_impuesto` un paso; si supera `reserva_max_dias`, la baja un paso. Un paso por `periodos_ajuste_fiscal` y siempre dentro de [`tasa_min_auto`, `tasa_max_auto`]. Emite `control` con origen `estado_automatico`. No toca salarios ni ayuda. Si en el tope de la banda el impago sigue (huelga, servicios que caen), el mundo lo sufre: es una señal de calibración, no un error del motor.
2. **Freno de obra:** no ordena una obra si tras pagarla la reserva queda bajo `reserva_min_dias`, ni si el mantenimiento total (edificios y vías) proyectado supera `pct_mant_max` de los ingresos del estado en el período. Esto evita que lo construido hunda al estado.
3. **Servicios [propuesta]:** cuando la cobertura de policía, médico, escuela o universidad cae bajo la referencia y el freno de obra lo permite, construye una comisaría, un hospital, una escuela o una universidad en un lote público libre (la cobertura de escuela se mide sobre los menores y la de universidad sobre los jóvenes de la zona y su entorno). No demuele nunca; el freno de obra es lo que acota el crecimiento.
4. **Vías [propuesta]:** cuando la demanda de suelo de un tipo de parcela en una zona supera `umbral_demanda_suelo` durante `periodos_demanda_suelo` y el freno de obra lo permite, construye el tramo que abre más parcelas de ese tipo (calle dentro de la zona; camino o puente hacia una zona no urbanizada si la zona se llenó), el de menor costo por parcela abierta. Si no puede, espera: la salida es el ajuste fiscal del punto 1, que repone la reserva.

Las obras del estado se pagan a firmas de construcción; si no hay ninguna con capacidad, rige la **obra directa** (ECONOMIA §10). Las viviendas y los locales no son del estado en el mundo base.

## 10. Modificadores, causas y variables

### Modificadores y causas

- Todo efecto (acción, rumor, clima, noticia, control) es un **modificador**: a estas personas, esta variable o rasgo cambia tanto, por tanto tiempo. Puede ser instantáneo (golpes, curas). Nunca cambia un rasgo base; los efectos decaen.
- **`origen`:** causa directa, con la forma `tipo:id[/detalle]` (`accion:predicar/npc_12`, `clima:plaga_zombie`, `noticia:n_41`, `firma:f_3/respuesta`).
- **`causa`:** id del evento o modificador que lo provocó. Un hecho raíz (clima, cambio de control) no tiene. Si un efecto viene de un estado acumulado, apunta al último cambio de control que más influyó; si no hay uno claro, a ninguno.
- **"¿Por qué pasó esto?":** el motor sigue `causa` hacia atrás hasta 5 pasos y entrega la cadena.
- Un rumor es un modificador con origen `rumor`; no tiene estado propio.

### Variables de la persona

- **Productividad** (0-100) = laboriosidad × salud × satisfacción × clima × infraestructura × factor impositivo × modificadores (variables normalizadas a 0-1; clima, infraestructura y factor impositivo, cerca de 1). El factor impositivo vale 1 hasta una tasa umbral y baja por encima. En la calle baja. Fuera de su puesto o internado, no produce.
- **Hambre:** sube con la despensa vacía y baja al comer.
- **Miedo:** con `plaga_zombie` tiende a intensidad × `atenuacion`^distancia × (1 − defensa/100) × (1 − 0,5 × valentía/100), con el fenómeno más alto. Las noticias alarmistas lo suben.
- **Satisfacción:** baja con hambre, miedo, mala salud, desempleo, poco poder adquisitivo, impuesto (más con codicia), inflación, calle (−−), hacinamiento, casa en mal estado, alquiler que pesa en el ingreso, pérdida de un familiar (con inercia) e hijos con comida insuficiente; sube con la ayuda social, casa propia y hijos o pareja en el hogar (leve). Tiene inercia (resiliencia).
- **Lealtad:** sigue a la satisfacción con retraso; la rebeldía amplifica las caídas.

## 11. Comunidad (derivada)

```json
{
  "poblacion": 640, "poblacion_pct": 104, "satisfaccion_media": 58, "apoyo_pct": 54,
  "descontentos_pct": 17, "hambre_critica_pct": 4, "sin_dinero_pct": 12, "desempleo_pct": 7, "hospital_ocupacion_pct": 40,
  "hogares": 210, "calle_pct": 6, "hacinamiento_pct": 4, "alquiler_carga_media_pct": 28,
  "natalidad": 1.2, "mortalidad": 1.0, "edad_media": 38, "pct_menores": 22, "pct_jubilados": 14,
  "defensa": { "centro": 40 }, "orden": { "centro": 60 }, "amenaza": { "centro": 0 },
  "productividad_total": 6800, "roles": { "agricultor": 120 },
  "mercado": { "firmas": 38, "cuota_mayor_pct": 31, "quiebras_periodo": 1, "fundaciones_periodo": 2 }
}
```

- `apoyo_pct`: electores con lealtad ≥ 50. `descontentos_pct`: satisfacción < 30. `hambre_critica_pct`: hambre > 80. `sin_dinero_pct`: electores que no pueden pagar su comida. `desempleo_pct`: adultos desempleados.
- `poblacion_pct` = vivos ÷ población inicial × 100 (puede pasar de 100).
- `calle_pct` = hogares en calle ÷ hogares. `hacinamiento_pct` = hogares hacinados ÷ hogares con casa. `natalidad` y `mortalidad` = por cada 100 personas, por año de juego.
- **Denominadores:** sobre las personas vivas, salvo `apoyo_pct` y `sin_dinero_pct`, que van sobre los **electores** (vivos de 18 o más, jubilados incluidos). Sin electores, `apoyo_pct` = 0.
- `hospital_ocupacion_pct` = (internados + en espera) ÷ camas (mínimo 1). Más de 100 es hospital saturado.
- **Historial:** cada día el motor agrega un punto a las series de `reserva`, `inflacion`, `satisfaccion_media`, `hambre_critica_pct`, `apoyo_pct`, `poblacion_pct`, `calle_pct`, `edad_media` y `cuota_mayor_pct`. Ninguna regla las usa; pasado `historial_max_dias`, lo viejo se compacta por semana.

## 12. Generación del mundo

El generador (con semilla) arma un mundo consistente y cierra las cuentas de ECONOMIA §16:

1. **Terreno** por semilla (MAPA §3b), núcleo en el mayor claro, zonas, vecindad y parcelas por tipo.
2. Pirámide de edades y hogares por familias: parejas, hijos, abuelos, solos, con `padres` y `pareja` coherentes.
3. Educación, roles y personalidad de cada persona.
4. Casas: se asignan una por hogar según capacidad y se reparte la propiedad entre hogares, personas e inmobiliarias; algunos hogares empiezan en la calle.
5. **Suelo urbanizable y red vial inicial:** parcelas `sin_calle`, zonas `no_urbanizada` y los tramos posibles con lo que abre cada uno; solo la red inicial está construida.
6. Firmas por rubro, sus locales y dueños (por `partes`), medios con columnistas, y los edificios públicos iniciales: **como mínimo un hospital, una comisaría, una escuela y una universidad** en la zona central, y las oficinas públicas del preset. Siempre hay al menos `n_constructoras_inicial` firmas de `construccion` con su oficina (y una inmobiliaria si alguna casa tiene una firma por dueña), con capacidad de obra para el primer año; sin ellas el mundo no puede crecer ni reparar.
7. Valores iniciales: reserva, stock, dinero de los hogares, caja de las firmas.

El mundo arranca equilibrado; lo desajustan el clima, el caos y el propio mercado.

## 13. Niveles del mundo

Cada nivel suma sin cambiar los controles (CONTROLES §2):

| Nivel | Qué tiene |
|---|---|
| **M0** | Hogares, casas, ciclo de vida, familias, calle y mercado de vivienda, con la economía mínima (dos firmas fijas); terreno por semilla, migración y agenda con turnos y ritmo |
| **M1** | + firmas genéricas, propiedad, emprender, comprar, crecer, quebrar, alquiler y publicidad |
| **M2** | + zonas completas, clima, salud, servicios, seguridad y estado en piloto automático |
| **M3** | + caos y prensa con medios como firmas |
| **M4** | + extensión `fiscal` (emisión e inflación; sin banco ni crédito) |
| Futuro | Zombis como agentes, edificios con integridad propia, coordenadas y combate (promoción por necesidad, MOTOR §8) |
