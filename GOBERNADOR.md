# Gobernador (v1.0)

> La jugabilidad: qué decide el jugador, qué ve y cómo gana o pierde. Solo mueve controles (CONTROLES.md); cómo reacciona el mundo está en MUNDO, ECONOMIA y CAOS_PRENSA. Escenarios: ESCENARIOS.md. Valores de niveles, modos y escalones: CALIBRACION.md.

---

## 1. Principios

- Fija **condiciones**, no órdenes a NPCs ni noticias. Nunca escribe una noticia.
- Pocas palancas, cada una con un dilema claro y un costo visible. Lo que no se gasta va a la reserva.
- Responde a la comunidad, no a la IA: ve hechos y noticias, nunca "la IA hizo X".
- Sus consecuencias (impago, hambre) son mecánicas y no dependen de la IA.
- La capa escala sola: se pueden sumar, quitar o reagrupar palancas sin tocar el mundo (sección 6).

## 2. Palancas del nivel 1

| Palanca | Qué fija | Controles que mueve | Dilema |
|---|---|---|---|
| `impuesto` | Una tasa | `tasa_impuesto` | Fondos contra consumo, satisfacción y productividad |
| `salario_publico` | % del valor normal | `salario_publico` | Satisfacción de los públicos contra nómina |
| `nivel_seguridad` | Nivel 0-5 | `puestos[policia]`, `operacion[seguridad]` | Defensa, orden y menos miedo contra costo y gente fuera de la producción |
| `nivel_salud` | Nivel 0-5 | `puestos[medico]`, `operacion[salud]` | Camas y cura contra costo |
| `nivel_obras` | Nivel 0-5 | `puestos[ingeniero]`, `operacion[obras]` | Productividad y reparación contra costo |
| `ayuda_social` | Monto diario | `ayuda_social` | Plata y apoyo de los sin ingreso contra reserva |
| `garantia_alimentaria` | % del faltante | `garantia_pct` | Menos hambre contra gasto obligatorio |
| `precio_maximo` | Libre, moderado o estricto | `tope_precio` | Comida barata hoy contra ganancia de las empresas y stock |
| `comercio_exterior` | 5 escalones | `flujo_exterior_pct` (−100, −50, 0, 50, 100) | Stock contra reserva (importar) o contra abastecimiento (exportar) |
| `prensa` | Monto por período | `fondos_prensa` | Alcance contra gasto y credibilidad |

- Un nivel de servicio no garantiza personal: depende de que haya NPCs con la educación requerida.
- Ninguna palanca crea empleo privado ni repone comerciantes.

## 3. Cruces que tiene que manejar

Las cadenas económicas están en ECONOMIA §11. Además:

- **Servicios contra reserva:** muchos niveles altos a la vez agotan la reserva y llevan al impago y a la huelga.
- **Seguridad contra obras** (zombies): la policía frena los golpes y las obras reparan la integridad; las dos cuestan.
- **Salud contra pandemia:** sin médicos, los heridos esperan en su casa y mueren más.
- **Prensa contra amenaza:** con un medio creíble y con alcance, la policía se ubica a tiempo; con uno desacreditado, no.
- **Prensa contra credibilidad:** financiar de más da alcance hoy y quita credibilidad mañana.

## 4. Qué ve

| Exactitud | Qué |
|---|---|
| **Exacto** | Finanzas, comida, empresas, el objetivo con su progreso, los avisos de clima con su origen, el costo de cada palanca y los días hasta el próximo día de pago |
| **Resumido** | La comunidad en porcentajes y conteos, por zona o grupo cuando importa; la ficha completa solo del NPC en foco |
| **Con sesgo** | La prensa |

Lo que no aplica a la economía activa se oculta. Los indicadores disponibles están en CONTROLES §3.

## 5. Objetivo y derrota

Cada escenario fija una meta de victoria con plazo y una condición de derrota (ESCENARIOS.md).

- **Derrota:** se evalúa cada día y termina la partida (`fin_partida {metrica, valor}`, con causa en el evento que cruzó el límite).
- **Victoria:** se evalúa una vez, al llegar el plazo. Emite `victoria` o `objetivo_perdido` y la partida sigue en los dos casos. El resultado no se reevalúa.
- La meta de victoria es más exigente que el límite de derrota, para que exista sobrevivir sin cumplir el objetivo.
- **Siempre visible:** la métrica de victoria con su meta y días restantes, y la de derrota con su límite; una flecha de tendencia respecto del período anterior, sin proyección; el indicador de derrota cambia de color al recorrer un tramo (CALIBRACION) hacia su límite. Estado del objetivo: pendiente, cumplido o perdido.

## 6. Escala de complejidad del gobernador

Cada nivel solo cambia el mapeo de palancas a controles; el mundo no se toca.

| Nivel | Palancas |
|---|---|
| **G0** | Ninguna: piloto automático. Sirve para calibrar el mundo |
| **G1 [propuesta]** | `impuesto`, `ayuda_social`, `garantia_alimentaria`, `nivel_seguridad`, `nivel_salud`. Para probar la jugabilidad básica: gastar o ahorrar |
| **G2** | Las 10 de la sección 2. Es el nivel 1 del juego |
| **G3** | + `tope_emision` (con M2), `presion` y `acceso` sobre la prensa, y educación como servicio si las partidas son lo bastante largas |

Cualquier combinación de M (MUNDO §12) y G es válida, así se ve dónde y cuánto interfiere el gobernador en cada nivel de complejidad del mundo.
