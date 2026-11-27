# Gobernador

> La jugabilidad: qué hace el jugador, qué ve y cómo gana o pierde. Actúa sobre el mundo solo a través de CONTROLES.md. Demandas de los actores: ACTORES.md. Escenarios: ESCENARIOS.md. Los valores son parámetros del preset. El conjunto final de palancas se rediseña al final (PALANCAS_MINIMAS.md); esta capa está alineada con el mundo pero no rediseñada.

---

## 1. Principios

- **Cuatro verbos:** construir (edificios y vías), ajustar palancas, responder demandas y prepararse para lo que viene.
- Fija **condiciones**, nunca manda a una persona ni escribe una noticia.
- Todo tiene un costo visible y compite por la misma reserva.
- Ve hechos y noticias, nunca "la IA hizo X". Sus consecuencias son mecánicas.
- La capa escala sola: sumar o quitar palancas, edificios o demandas no toca el mundo (§7).

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

- **Edificios:** clic en un lote público libre, elegir un tipo del catálogo (EDIFICIOS §3), pagar y esperar los días de obra (`construir`).
- **Vías:** elegir un tramo posible conectado a la red construida (`construir_via`). Es la única forma de expandir la ciudad: sin vías no hay lotes nuevos (EDIFICIOS §3b).
- **Servicios:** seguridad, salud y educación salen de lo construido (comisarías, hospitales, escuelas y universidades) y de que haya personal con la educación requerida. Arrancan insuficientes a propósito. Las oficinas públicas vienen con el preset.
- **Obras de suceso:** murallas, silos, riego y hospital de campaña se construyen antes del golpe, con la anticipación de los avisos (EDIFICIOS §5).
- **Demoler** libera el lote y deja de pagar mantenimiento, sin devolver el costo (`demoler`). Las vías no se demuelen.
- Las constructoras cobran las obras del estado (ECONOMIA §10): gastar mucho las engorda; dejar de construir las puede fundir.
- Sin gobernador, la regla de piloto automático construye servicios y vías sola; con gobernador está apagada (CONTROLES §1).

## 4. Hitos

Metas intermedias de prosperidad. Cada escenario define una lista ordenada (ESCENARIOS.md); al cumplir uno, la capa del gobernador emite `hito`. Los hitos **no habilitan suelo**: la expansión es solo por vías.

```json
{ "id": "h1", "condicion": { "metrica": "satisfaccion_media", "op": ">=", "umbral": 60, "periodos": 2 } }
```

Métricas posibles: las de la comunidad (MUNDO §11, incluido `desempleo_pct`) y los ingresos del estado. Los hitos no se pierden.

## 5. Qué ve

| Exactitud | Qué |
|---|---|
| **Exacto** | Finanzas, comida, firmas, la ciudad (lotes, vías, obras, edificios con su estado), el objetivo con su progreso, los avisos de clima con su origen, las demandas con su plazo, el costo de cada palanca y obra |
| **Resumido** | La comunidad en porcentajes y conteos, por zona o grupo; la ficha completa solo de la persona en foco |
| **Con sesgo** | La prensa |

Indicadores disponibles: CONTROLES §4. La capa de lectura (LECTURA.md) arma el vistazo y las alertas.

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
| **G3** | + `tope_emision` (con M4), `presion` y `acceso` sobre la prensa, contraofertas a las demandas |

Cualquier combinación de M (MUNDO §13) y G es válida.

## 8. Cruces

Las cadenas económicas están en ECONOMIA §13. Además:

- **Construir contra reserva:** cada edificio y cada vía cuesta al hacerlo y en cada período. Construir de más lleva al impago, y sin mantenimiento los servicios caen y las vías se deterioran.
- **Prevenir contra atender:** una muralla o un silo antes del aviso compiten con el hospital que falta hoy.
- **Expandir contra sostener:** abrir vías da lotes y crecimiento, pero suma mantenimiento y obliga a cubrir más gente con servicios.
- **Ceder contra resistir:** aceptar una demanda ata una palanca; rechazarla trae una medida. Ceder siempre deja al gobernador sin margen.
- **Prensa contra amenaza:** con un medio creíble, la policía se ubica a tiempo; pagarle de más le quita credibilidad.
