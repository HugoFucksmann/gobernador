# Mundo (v1.0)

> La simulación sin gobernador: NPCs, roles, zonas, clima, salud, servicios y seguridad. Economía: ECONOMIA.md. Caos y prensa: CAOS_PRENSA.md. Entradas y salidas del mundo: CONTROLES.md. Orden de cálculo y guardado: MOTOR.md. Valores: CALIBRACION.md. Escala 0-100 salvo donde se indique; los números de los ejemplos solo ilustran la forma.

---

## 1. Principios

- La comunidad no tiene estado propio: se deriva de los NPCs (sección 10).
- El mundo corre solo. El gobernador solo mueve sus controles (CONTROLES.md); sin él, los controles quedan en los valores del preset.
- Al generar el mundo todo encaja; lo desajustan el clima y el caos. Si el caos se detiene, la comunidad se recupera sola.
- Todo efecto es un modificador con origen y causa (sección 9), así todo hecho puede explicarse.
- El motor conoce el espacio solo por zonas. Coordenadas, movimiento y dibujo son de la UI.

## 2. NPC

```json
{
  "id": "npc_07", "nombre": "Marta", "edad": 34, "cumple_dia": 212,
  "educacion": 1,
  "personalidad": { "valentia": 35, "laboriosidad": 80, "codicia": 60, "rebeldia": 20, "resiliencia": 55 },
  "variables": { "salud": 90, "hambre": 20, "miedo": 10, "satisfaccion": 65, "lealtad": 70 },
  "economia": { "ingreso_pos": 60, "dinero": 40, "despensa": 6, "propension_gasto": 45 },
  "rol": "agricultor", "zona": "este", "internado": false, "accion": null,
  "modificadores": [
    { "id": "mod_3", "afecta": { "miedo": 10, "rebeldia": 10 }, "duracion_dias": 5,
      "origen": "accion:predicar/npc_12", "causa": "ev_88", "texto": "Anda alterada desde que oyó predicar a Joaquín" }
  ]
}
```

- **Etapa** (derivada de `edad`): menor (< 18) estudia; adulto (18-64) trabaja; jubilado (65+) no trabaja. Cada NPC cumple años en su `cumple_dia`, fijado por semilla.
- **`educacion`**: 0 sin estudios, 1 básico, 2 medio, 3 superior. Define a qué roles accede. Se fija al generar el mundo (a los menores, el nivel con el que egresan).
- **`personalidad`** es fija. Las reglas usan el valor **efectivo** = base + modificadores, acotado a 0-100.
- **`variables`** cambian. Salud 0 = muere.
- **`economia`**: `ingreso_pos` (posición fija en el rango de su rol), `dinero`, `despensa` (días de comida en casa) y `propension_gasto` (fija, sale de su personalidad y la semilla). Uso: ECONOMIA.md.
- **`zona`**: asignada al generar el mundo según su rol. Su **zona efectiva** es la `zona_destino` de su acción si la tiene; si está internado, el `centro`; si no, su `zona`. Todo lo que pasa en un lugar usa la zona efectiva.
- **`internado`**: está en el hospital (sección 6). Se guarda porque depende de las camas y del orden de espera.
- **`accion`**: la acción en curso (CAOS_PRENSA.md).

## 3. Roles

```json
[
  { "id": "estudiante",  "edad": [0, 24],   "educ_min": 0, "estudia": true },
  { "id": "agricultor",  "edad": [18, 64],  "educ_min": 0, "afinidad": "laboriosidad", "produce": "alimento" },
  { "id": "obrero",      "edad": [18, 64],  "educ_min": 0, "afinidad": "laboriosidad" },
  { "id": "tecnico",     "edad": [18, 64],  "educ_min": 2, "afinidad": "laboriosidad", "produce": "tecnificacion" },
  { "id": "comerciante", "edad": [18, 64],  "educ_min": 1, "afinidad": "codicia",      "produce": "comercio" },
  { "id": "empresario",  "edad": [18, 64],  "educ_min": 2, "afinidad": "codicia" },
  { "id": "periodista",  "edad": [18, 64],  "educ_min": 2, "afinidad": "rebeldia",     "produce": "informacion" },
  { "id": "policia",     "edad": [18, 64],  "educ_min": 1, "afinidad": "valentia",     "publico": true, "produce": "seguridad" },
  { "id": "medico",      "edad": [18, 64],  "educ_min": 3, "afinidad": "laboriosidad", "publico": true, "produce": "salud" },
  { "id": "ingeniero",   "edad": [18, 64],  "educ_min": 3, "afinidad": "laboriosidad", "publico": true, "produce": "infraestructura" },
  { "id": "estatal",     "edad": [18, 64],  "educ_min": 1, "afinidad": "laboriosidad", "publico": true },
  { "id": "docente",     "edad": [18, 64],  "educ_min": 2, "afinidad": "laboriosidad", "publico": true },
  { "id": "desempleado", "edad": [18, 64],  "educ_min": 0 },
  { "id": "jubilado",    "edad": [65, null], "educ_min": 0 }
]
```

- **Privados:** agricultor y técnico (empresa de alimento), obrero (empresa de comercio), comerciante (socio de comercio), empresario (dueño de alimento), periodista (de un medio). Cobran según ECONOMIA.md.
- **Públicos:** cobran el salario público. Sus puestos los fijan los controles (CONTROLES.md): policía, médico e ingeniero por servicio; estatal y docente fijos por preset y sin efecto en el nivel 1 más allá de la nómina.
- **Técnico:** hasta `tecnicos_por_agricultor` por agricultor, sube la producción de alimento.
- **Comerciante:** su cantidad da la capacidad de comercio exterior (ECONOMIA §7).
- **Periodista:** columnista de un medio; limita cuánto publica (CAOS_PRENSA §8).
- **Sin ingreso propio:** estudiantes, desempleados y jubilados.

**Grupos** (para resúmenes por sector y la ayuda social):

```json
{ "agro": ["agricultor", "tecnico"], "industria": ["obrero"], "comercio": ["comerciante", "empresario", "periodista"],
  "publico": ["policia", "estatal", "docente", "medico", "ingeniero"], "sin_ingreso": ["desempleado", "jubilado", "estudiante"] }
```

**Cambios de rol**

- El menor es `estudiante`. Egresa cuando `edad` ≥ 18 (se evalúa cada día) y elige rol.
- Un adulto puede cambiar, cada cierto tiempo, a un rol con vacante para el que cumpla edad y educación. Elige por afinidad.
- Vacantes = puestos − ocupados. Los puestos privados tienen un tope por escenario (`tope_privado[rol]`) y los cubre la empresa según ECONOMIA §4.
- Si bajan los puestos de un rol, los que sobran pasan a desempleados al ritmo `max_pase_desempleo_por_dia`.
- Pasado el tope de edad de su rol sin llegar a 65, pasa a desempleado. A los 65, a jubilado.
- Estar desempleado baja la satisfacción.

## 4. Zonas

4 a 6 por mundo, con su vecindad. La distancia es el número de pasos del camino más corto (en un empate, el primero de la configuración). Un mundo de una zona es solo para pruebas y equivale a no tener espacio.

```json
{
  "centro": ["norte", "este", "sur", "oeste"],
  "norte": ["este", "oeste", "centro"], "este": ["norte", "sur", "centro"],
  "sur": ["este", "oeste", "centro"], "oeste": ["sur", "norte", "centro"]
}
```

El grafo tiene que poder dibujarse sin cruces, para que dos zonas vecinas sean contiguas en el mapa.

## 5. Clima

```json
{ "fenomenos": [ { "tipo": "sequia", "intensidad": 60, "inicio_dia": 140, "duracion_dias": 30, "aviso_dias": 5, "origen": null, "crecimiento_dia": 0 } ] }
```

| Tipo | Efecto | Protección |
|---|---|---|
| `sequia` | Baja la producción de alimento y sube el precio de la comida (interno y externo) | — |
| `plaga` | Igual que la sequía | — |
| `pandemia` | Golpes de salud a NPCs individuales | Ninguna (se enfrenta con el hospital) |
| `plaga_zombie` | Golpes de salud y miedo; su intensidad crece. No crea zombis como agentes | `defensa` de las zonas del camino |

- **`aviso_dias`**: anticipación del anuncio. La prensa lo cuenta (CAOS_PRENSA §8) y así se entera la gente.
- **`origen`**: zona de donde vienen los ataques. Sin origen, actúa parejo en toda la ciudad.
- **`crecimiento_dia`**: suba diaria de intensidad, con tope 100. Las hordas son fenómenos `plaga_zombie` adicionales, cortos e intensos.
- **Ataques:** cada día, cada fenómeno con daño tira por cada NPC vivo no internado, con probabilidad `exposicion_max` × intensidad/100 × `atenuacion`^distancia (desde el origen a su zona efectiva). Si el tipo tiene protección, el ataque tiene que pasar cada zona del camino, incluida la suya: cada una lo repele con probabilidad `proteccion_max` × `defensa`/100. Si pasa todas, es un **golpe**: resta salud al azar dentro de `dano`, por la vulnerabilidad de su edad. Un golpe de `plaga_zombie` también daña la integridad de la zona (sección 8).

## 6. Salud

Solo tres causas restan salud, cada una con su forma de combatirla:

1. **Golpes** de la plaga zombie y la pandemia: seguridad (zombies) y hospital (los dos).
2. **Hambre crítica:** daño diario con el hambre sobre su umbral; se combate con la comida (ECONOMIA.md).
3. **Vulnerabilidad por edad:** menores y mayores de 65 reciben más daño por golpe (`k_vulnerabilidad`) y los jubilados arrancan con menos salud **[propuesta]**.

Orden diario: golpes → hambre crítica → internación → cura → muerte (salud 0).

- **Hospital** (en el `centro`): pide cama quien tiene salud < `umbral_hospital`. Camas = médicos activos × `pacientes_por_medico`. Se interna primero a los de menor salud; el resto espera en su casa. El internado no produce ni recibe ataques, se cura `cura_base` × (0,5 + 0,5 × indicador `salud`/100) por día y sale con salud ≥ `alta`.
- **Cura natural:** quien no está internado se cura `cura_natural` por día si su hambre está bajo su umbral.
- **Muerte:** sale de la población, su puesto queda vacante y, si era columnista, sale de su medio.
- Sin vejez, accidentes ni nacimientos en el nivel 1: la población baja solo por salud 0.

## 7. Servicios

Indicadores de servicio: `seguridad`, `salud` (calidad de atención, no la salud de la gente) e `infraestructura`.

- **Cobertura** = min(1, profesionales del rol ÷ profesionales de referencia del escenario).
- **Inversión** = operación del área ÷ costo base del área (proporcional a la población), con rendimientos decrecientes sobre 1.
- Indicador += cobertura × inversión − decaimiento.
- Los puestos y la operación de cada área son controles (CONTROLES.md).
- **Cobertura baja:** si la de policía o médico cae bajo un umbral, suma un recargo gradual de miedo (policía) o malestar (médicos).

| Indicador | Qué hace |
|---|---|
| `seguridad` | Baja el miedo y, repartida por zona como `defensa`, frena los ataques zombie |
| `salud` | Rapidez de cura en el hospital (las camas las dan los médicos) |
| `infraestructura` | Sube la productividad y acelera la reparación de las zonas |

## 8. Seguridad por zona

**Policía.** Cada policía da defensa y orden en la zona donde está. La defensa solo frena fenómenos con protección; el orden frena el caos espontáneo. La tensión está en dónde están.

**Reubicación.** Cada día un % de los policías se muda a una zona sorteada con peso según su necesidad total = amenaza percibida + necesidad de orden, con necesidad de orden = min(100, % de la zona con acción espontánea + % de descontentos). Si todas valen 0, no se mueven.

**Amenaza percibida** (derivada): el mayor entre el aviso (en la zona de origen, el mejor alcance × credibilidad/100 de las noticias de aviso vigentes) y los golpes recientes en la zona (con tope 100). La gente percibe, no sabe: un aviso tardío o poco creíble deja a la policía mal ubicada.

**Defensa** (derivada) = min(100, `seguridad` × (1 − c + c × n × parte)) × (1 − `k_integridad` × (1 − integridad/100)), con parte = policías de la zona ÷ policías totales (1/n sin policías), n = cantidad de zonas y c = `movilidad_defensa`.

**Orden** (derivado) = min(100, 100 × (policías de la zona ÷ población de la zona) ÷ `objetivo_orden`), con la población por zona efectiva. Frena el contagio espontáneo (CAOS_PRENSA §4).

**Integridad** (estado, 0-100, arranca en 100): cuánto aguanta la zona.

- Cada golpe de `plaga_zombie` le resta `dano_integridad`.
- Una integridad baja reduce la defensa, así que el daño se acumula.
- Reparación diaria = `rep_por_npc` × reparadores × (0,5 + 0,5 × `infraestructura`/100), con tope 100. Reparadores: obreros e ingenieros de esa zona efectiva, no internados ni fuera de su puesto.

## 9. Modificadores y causas

- Todo efecto (acción, rumor, clima, noticia, control) es un **modificador**: a estos NPCs, esta variable o rasgo cambia tanto, por tanto tiempo. Puede ser instantáneo (golpes, curas).
- Nunca cambia un rasgo base. Los efectos decaen.
- **`origen`**: causa directa, con la forma `tipo:id[/detalle]` (`accion:predicar/npc_12`, `clima:plaga_zombie`, `noticia:n_41`, `empresa:comercio/respuesta`).
- **`causa`**: id del evento o modificador que lo provocó. Un hecho raíz (clima, cambio de control) no tiene. Si un efecto viene de un estado acumulado, apunta al último cambio de control que más influyó; si no hay uno claro, a ninguno.
- **"¿Por qué pasó esto?"**: el motor sigue `causa` hacia atrás hasta 5 pasos y entrega la cadena.
- Un rumor es un modificador con origen `rumor`; no tiene estado propio.

## 10. Variables del NPC

- **Productividad** (0-100) = laboriosidad × salud × satisfacción × clima × infraestructura × factor impositivo × modificadores (variables normalizadas a 0-1; clima, infraestructura y factor impositivo, cerca de 1). El factor impositivo vale 1 hasta una tasa de impuesto umbral y baja por encima. Fuera de su puesto o internado, no produce.
- **Hambre:** sube con la despensa vacía y baja al comer.
- **Miedo:** con `plaga_zombie` tiende a intensidad × `atenuacion`^distancia × (1 − defensa/100) × (1 − 0,5 × valentía/100), con el fenómeno más alto. Las noticias alarmistas lo suben.
- **Satisfacción:** baja con hambre, miedo, mala salud, desempleo, poco poder adquisitivo, impuesto (más con codicia) e inflación; sube con la ayuda social. Tiene inercia (resiliencia).
- **Lealtad:** sigue a la satisfacción con retraso; la rebeldía amplifica las caídas.

## 11. Comunidad (derivada)

```json
{
  "poblacion": 100, "poblacion_pct": 100, "satisfaccion_media": 58, "apoyo_pct": 54,
  "descontentos_pct": 17, "hambre_critica_pct": 4, "sin_dinero_pct": 12, "hospital_ocupacion_pct": 40,
  "defensa": { "centro": 40 }, "orden": { "centro": 60 }, "amenaza": { "centro": 0 },
  "productividad_total": 6800, "roles": { "agricultor": 30 }
}
```

- `apoyo_pct`: electores con lealtad ≥ 50. `descontentos_pct`: satisfacción < 30. `hambre_critica_pct`: hambre > 80. `sin_dinero_pct`: electores que no pueden pagar su comida.
- `poblacion_pct` = vivos ÷ población inicial × 100.
- **Denominadores:** sobre los NPCs vivos, salvo `apoyo_pct` y `sin_dinero_pct`, que van sobre los **electores** (vivos de 18 o más, jubilados incluidos). Sin electores, `apoyo_pct` = 0.
- `hospital_ocupacion_pct` = (internados + en espera) ÷ camas (mínimo 1). Más de 100 es hospital saturado.
- **Historial:** cada día el motor agrega un punto a las series de `reserva`, `inflacion`, `satisfaccion_media`, `hambre_critica_pct`, `apoyo_pct` y `poblacion_pct`. Ninguna regla las usa; pasado `historial_max_dias`, lo viejo se compacta por semana.

## 12. Escala de complejidad del mundo

Cada nivel suma sin cambiar los controles (CONTROLES.md), así se calibra el mundo por partes:

| Nivel | Qué tiene |
|---|---|
| **M0** | Una zona, sin clima ni caos: NPCs, roles, economía y servicios. Para calibrar el circuito |
| **M1** | + zonas, clima, salud con hospital, caos y prensa. Es el mundo del nivel 1 |
| **M2** | + extensión `fiscal` (emisión e inflación dinámica, ECONOMIA §9) |
| Futuro | Zombis como agentes, construcción real, coordenadas, combate: se promueven desde las zonas cuando una regla dependa de ellos (HOJA_DE_RUTA) |
