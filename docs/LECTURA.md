# Lectura del mundo

> Capa entre el motor y la UI que convierte el estado del mundo en **algo que se entiende**: indicadores con estado y tendencia, alertas, series, informe periódico y personajes destacados. Es **solo lectura y derivada**: no cambia la simulación ni consume azar. La usan la UI de observación (UI_PROTOTIPO_MUNDO) y, después, el despacho del gobernador. Lo marcado **[propuesta]** se pule.

---

## 1. Principios

- **Derivada y de solo lectura.** No tiene reglas de mundo, no genera eventos con efecto, no consume RNG. Apagarla no cambia la partida.
- **Contexto antes que números.** Cada indicador se mide contra la referencia del propio mundo, no contra un valor absoluto.
- **Revelado progresivo en tres niveles:** *vistazo* (pocos indicadores y alertas), *tema* (causas y mapa de calor de un indicador) y *detalle* (todo lo de CONTROLES §4).
- **Todo tiene causa.** Alertas, tendencias e informes apuntan a eventos con origen y causa (CONTROLES §5).
- **Texto por claves.** El motor entrega claves y parámetros (`vivienda.calle_sube`, `{pct: 12}`), no frases; la UI las traduce. Sin IA generativa en esta capa.

## 2. Indicadores de vistazo [propuesta]

Seis siempre; un séptimo cuando el módulo existe.

| Indicador | Métrica primaria | Mira también |
|---|---|---|
| Población | población y crecimiento | natalidad, mortalidad, migración |
| Vivienda | `calle_pct` | hacinamiento, alquiler sobre ingreso, lotes libres |
| Comida | días de stock | precio, despensas |
| Empleo | desempleo | vacantes, quiebras, fundaciones |
| Estado | saldo y días de reserva | impago, obras pendientes |
| Ánimo | satisfacción media | `apoyo_pct`, miedo |
| Orden (con M2) | `seguridad` y `orden` | `amenaza`, cobertura de salud |

### Forma de un indicador

```json
{ "id": "vivienda", "valor": 12.4, "referencia": 5.1,
  "estado": "mal", "tendencia": { "dir": 1, "magnitud": 0.8 },
  "serie": [4.9, 5.2, "..."],
  "causas_top": [ { "causa": "desalojo_masivo", "peso": 0.5, "evento_raiz": "ev_8812" } ],
  "texto": { "clave": "vivienda.calle_sube", "params": { "pct": 12 } } }
```

- **`referencia`:** mediana móvil de la métrica en `ventana_referencia`; al arrancar, el valor del mundo ya estabilizado.
- **`estado`:** `bien`, `atencion` o `mal` según el desvío relativo contra la referencia (`umbral_atencion`, `umbral_mal`), con histéresis para que no parpadee. Cada indicador sabe si subir es bueno o malo.
- **`tendencia`:** pendiente por regresión sobre `ventana_tendencia`; es `estable` si está bajo `banda_estable`. `magnitud` es relativa a la referencia.
- **`causas_top`:** hasta 3, agrupando por causa raíz los eventos de la ventana, ponderados por su contribución al cambio. Cada tipo de evento declara qué indicadores afecta (tabla del motor).

## 3. Alertas

- Se crean cuando un indicador cambia de estado, mantiene una tendencia mala durante `periodos_tendencia_mala`, o ocurre un hecho grave (muerte masiva, quiebra de una firma grande, zona aislada, ataque).
- Campos: `id`, `severidad` (1-3), `indicador`, `entidad` (zona, firma, persona), `foco` (a dónde va la cámara al tocarla, como en CONTROLES §5), `causa`, `dia`, `texto` (clave y parámetros).
- **Prioridad:** severidad, luego novedad. **Deduplicación** por indicador y entidad, con `enfriamiento_alerta_dias`. Se cierran solas cuando el estado vuelve a `bien`.
- El motor guarda la cola completa; la UI muestra como máximo 3 en el vistazo (`alertas_visibles`).

## 4. Series e historial

- **Series:** una por indicador y por zona (para el mapa de calor). Diaria dentro de `ventana_serie_dias`; más atrás, agregada por período y por año. Se guardan (MOTOR §3).
- **Historial consultable:** eventos por entidad, tipo, zona y período, paginados, con su cadena de causas (CONTROLES §4, *Causas*).
- **Informe periódico:** cada `periodo_dias` (día de pago) el motor arma el informe: los 3 cambios más importantes del período (mayor cambio de estado o tendencia), cada uno con antes, después, causa principal y entidades; más los hechos de notables. Es determinista y se escribe con claves.

## 5. Notables (personajes destacados)

Se **derivan**, no se asignan. Una persona es notable por su peso en uno de estos tipos (la lista es extensible):

| Tipo | Quién | Peso |
|---|---|---|
| `empresario` | Dueño con parte mayoritaria de una o más firmas (un **magnate** emerge al sumar firmas, empleados, caja o patrimonio) | cantidad de firmas, cuota de mercado, empleados, caja, patrimonio |
| `medio` | Quien funda, compra o hereda un medio, o su columnista estrella | alcance × credibilidad |

- **Tope:** `min(notables_max, notables_pct × población)`.
- **Histéresis:** entra sobre `peso_alto`, sale bajo `peso_bajo` y permanece al menos `dias_min_notable`, para que la lista no cambie todos los días.
- **Campo derivado:** `notable: { tipo, motivo, peso }`.
- **Hechos marcados:** todo evento que involucra a un notable lleva `notable: true` (compró una firma, quebró, cambió la línea editorial, fue noticia). La prensa y el historial pueden filtrar por eso.
- **`interlocutor`:** `{ npc, tipo, peso, postura, favor, intereses, pedidos: [] }`. Sin gobernador, `favor` es 0, `postura` sale de lealtad, satisfacción y línea editorial y `pedidos` está vacío. Con gobernador, `favor`, `postura` y `pedidos` los completa la capa del gobernador (ACTORES.md).
- **Una sola regla, dos usos:** el cálculo de notables es una función compartida. LECTURA la muestra; la capa del gobernador la usa para definir sus actores (ACTORES §1). Apagar la capa de lectura no apaga a los actores.

## 6. Despacho del gobernador (etapa posterior)

Pantalla que reúne la lectura con ayudas: **Resumen** (vistazo e informe), **Ciudadanía**, **Economía y empresarios**, **Prensa**, **Historial y porqués** y, más adelante, **Palancas**. No agrega lógica: usa las consultas de §7. Las interacciones con prensa y empresarios son de esa etapa. Ahora solo se prepara el acceso a los datos.

## 7. Contrato (consultas del motor) [propuesta]

`indicadores_resumen()` · `indicador(id)` · `alertas(filtro)` · `serie(id, zona?, desde, hasta, resolucion)` · `historial(filtro, pagina)` · `causas(evento)` · `informe(n)` · `notables(tipo?)` · `interlocutor(npc)`.

## 8. Costo, determinismo y guardado

- **Cadencia:** indicadores, alertas y series al cierre del día (MOTOR §2, paso 13); notables e informe en día de pago. Costo: O(indicadores + eventos nuevos); nunca por persona ni por tick.
- **Modo sin dibujo:** solo series y alertas; el resto se calcula a pedido.
- **Determinismo:** no usa RNG ni modifica el estado de la simulación; misma semilla, mismas alertas e informes.
- **Guardado:** series, alertas abiertas, notables e informes.

## 9. Pruebas

- Misma semilla, mismas alertas, informes y notables; guardar y cargar no los cambia.
- Series sintéticas: la tendencia y el estado salen como se espera, sin parpadeo.
- Un mundo estable no genera alertas en cadena (tope por período).
- Los notables no superan el tope y cambian poco entre períodos.
- Apagar la capa no cambia ningún resultado de la simulación.

## 10. Fuera de esta etapa

Textos generativos y el despacho completo. La interacción con interlocutores vive en ACTORES.md.
