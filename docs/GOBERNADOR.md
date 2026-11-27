# Gobernador (v1.1)

> La jugabilidad: qué hace el jugador, qué ve y cómo gana o pierde. Actúa sobre el mundo solo a través de CONTROLES.md. Demandas de los actores: ACTORES.md. Escenarios: ESCENARIOS.md. Valores: CALIBRACION.md.

---

## 1. Principios

- **Cuatro verbos:** construir, ajustar palancas, responder demandas y prepararse para lo que viene.
- Fija **condiciones**, nunca manda a un NPC ni escribe una noticia.
- Todo tiene un costo visible y compite por la misma reserva.
- Ve hechos y noticias, nunca "la IA hizo X". Sus consecuencias son mecánicas.
- La capa escala sola: sumar o quitar palancas, edificios o demandas no toca el mundo (sección 7).

## 2. Palancas

| Palanca | Qué fija | Controles | Dilema |
|---|---|---|---|
| `impuesto` | Una tasa | `tasa_impuesto` | Fondos contra consumo, satisfacción y productividad |
| `salario_publico` | % del valor normal | `salario_publico` | Satisfacción de los públicos contra nómina |
| `nivel_obras` | Nivel 0-5 | `puestos[ingeniero]`, `operacion[obras]` | Productividad, reparación y obras más rápidas contra costo |
| `ayuda_social` | Monto diario | `ayuda_social` | Plata y apoyo de los sin ingreso contra reserva |
| `garantia_alimentaria` | % del faltante | `garantia_pct` | Menos hambre contra gasto obligatorio |
| `precio_maximo` | Libre, moderado o estricto | `tope_precio` | Comida barata hoy contra empresas y stock |
| `comercio_exterior` | 5 escalones | `flujo_exterior_pct` (−100, −50, 0, 50, 100) | Stock contra reserva (importar) o abastecimiento (exportar) |
| `prensa` | Monto por período | `fondos_prensa` | Alcance contra gasto y credibilidad |

Una palanca comprometida por una demanda aceptada queda bloqueada hasta que vence el compromiso (ACTORES §1).

## 3. Construir

- **Dónde:** clic en una parcela libre, elegir un tipo del catálogo (EDIFICIOS.md), pagar y esperar los días de obra.
- **Servicios:** seguridad y salud salen de lo construido (comisarías y hospitales) y de que haya personal con la educación requerida. Arrancan insuficientes a propósito. Escuelas y oficinas públicas vienen con el preset y no se construyen en el nivel 1.
- **Obras de suceso:** murallas, silos, riego y hospital de campaña se construyen antes del golpe, con la anticipación de los avisos.
- **Demoler** libera la parcela y deja de pagar mantenimiento, sin devolver el costo.
- Las parcelas son compartidas con los privados: si se demora, un local puede ocupar el lugar.

## 4. Hitos de prosperidad

La ciudad se expande por hitos. Cada escenario define una lista ordenada (ESCENARIOS.md); al cumplir uno, la capa del gobernador habilita sus parcelas (orden `habilitar`) y emite `hito`.

```json
{ "id": "h1", "condicion": { "metrica": "satisfaccion_media", "op": ">=", "umbral": 60, "periodos": 2 }, "habilita": ["p_norte_4", "p_norte_5"] }
```

Métricas posibles: las de la comunidad (MUNDO §11, incluido `desempleo_pct`) y los ingresos del estado. Los hitos no se pierden.

## 5. Qué ve

| Exactitud | Qué |
|---|---|
| **Exacto** | Finanzas, comida, empresas, la ciudad (parcelas, obras, edificios con su estado), el objetivo con su progreso, los avisos de clima con su origen, las demandas con su plazo, el costo de cada palanca y obra |
| **Resumido** | La comunidad en porcentajes y conteos, por zona o grupo; la ficha completa solo del NPC en foco |
| **Con sesgo** | La prensa |

Indicadores disponibles: CONTROLES §4.

## 6. Objetivo y derrota

Cada escenario fija una meta de victoria con plazo y una o más condiciones de derrota; basta con cruzar una (ESCENARIOS.md).

- **Derrota:** se evalúa cada día y termina la partida (`fin_partida`, con causa en el evento que cruzó el límite).
- **Victoria:** se evalúa al llegar el plazo. Emite `victoria` o `objetivo_perdido` y la partida sigue. No se reevalúa.
- La meta de victoria es más exigente que el límite de derrota.
- **Siempre visible:** métrica, meta y días restantes; límite de derrota con cambio de color al acercarse; flecha de tendencia sin proyección; estado pendiente, cumplido o perdido.

## 7. Escala de complejidad del gobernador

Cada nivel solo cambia qué verbos y palancas tiene el jugador; el mundo no se toca.

| Nivel | Qué tiene |
|---|---|
| **G0** | Nada: piloto automático, con los edificios del preset |
| **G1** | Construir servicios + `impuesto`, `ayuda_social` y `garantia_alimentaria` |
| **G2** | Las 8 palancas, obras de suceso, hitos y demandas. Es el nivel 1 del juego |
| **G3** | + `tope_emision` (con M2), `presion` y `acceso` sobre la prensa, contraofertas a las demandas |

Cualquier combinación de M (MUNDO §12) y G es válida.

## 8. Cruces

Las cadenas económicas están en ECONOMIA §11. Además:

- **Construir contra reserva:** cada edificio cuesta al hacerlo y en cada período. Construir de más lleva al impago, y sin mantenimiento los servicios caen.
- **Prevenir contra atender:** una muralla o un silo antes del aviso compiten con el hospital que falta hoy.
- **Ceder contra resistir:** aceptar una demanda ata una palanca; rechazarla trae una medida. Ceder siempre deja al gobernador sin margen.
- **Prensa contra amenaza:** con un medio creíble, la policía se ubica a tiempo; pagarle de más le quita credibilidad.
