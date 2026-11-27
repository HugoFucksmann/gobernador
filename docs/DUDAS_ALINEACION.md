# Dudas, Vacíos y Decisiones de Alineación (`/docs` vs Código)

> Registro generado al auditar `/docs/*.md` como **fuente única de verdad** y alinear el código fuente con la especificación v2 / prototipo v0.1.

---

## 1. Documentos externos referenciados que no están en `/docs/`

Los documentos v2 citan archivos complementarios que no existen en el repositorio actual:
- `MUNDO_V1`, `ECONOMIA_V1`, `CAOS_PRENSA_V1`, `ACCIONES_V1`
- `GOBERNADOR.md`, `ACTORES.md`, `ESCENARIOS.md`
- `UI` (v1 §9, mencionado en `MOTOR_V2.md`)

**Criterio aplicado:** Para toda regla donde los docs v2 indican *"como v1"* o delegan en `GOBERNADOR`/`ACTORES`/`ESCENARIOS`, se conserva la implementación actual verificada en `src/data/catalogs.ts`, `src/engine/simulation.ts`, `src/engine/economyV2.ts`, `src/engine/lifecycleV2.ts` y `src/engine/policies.ts`, modificando exclusivamente aquello donde los documentos v2 actuales definen un comportamiento nuevo o distinto.

---

## 2. Tensión entre Alcance v0.1 (`ALCANCE_ETAPA_MUNDO.md` / `UI_PROTOTIPO_MUNDO.md`) y Capa de Gobernador (`CONTROLES_V2.md`)

- `ALCANCE_ETAPA_MUNDO.md` y `UI_PROTOTIPO_MUNDO.md` especifican que la etapa **v0.1** muestra **solo el mundo simulado y la UI 2D de observación**, sin gobernador (sin palancas, demandas, hitos, objetivo ni obras de suceso como `muralla`, `silo`, `riego`, `hospital_campana`).
- Al mismo tiempo, `CONTROLES_V2.md`, la UI actual y los scripts (`test_nivel1_1.ts`, `run_calibration.ts`) ya contienen el gobernador (`G1`–`G3`), demandas y escenarios (`elecciones`, `zombies`).

**Duda:** ¿Debe eliminarse el modo gobernador del código o mantenerse detrás de un selector sin que interfiera con v0.1?

**Decisión tomada:**
1. Se fija **Modo Observador (v0.1: `M3` + `G0` + `estadoAutomatico: true`, `usarIaGemini: false`)** como modo de arranque por defecto de la aplicación, respetando `UI_PROTOTIPO_MUNDO.md` (barra superior con hora, velocidades `⏸ x1 x2 x5 x20`, `+1d`, `Pob · Hog · Calle % · Firmas`, panel lateral de solo lectura con ficha + agenda + "¿por qué?" + registro filtrable, capas de lectura apagadas por defecto, sin palancas ni demandas ni obras de suceso).
2. Se conserva el **Modo Gobernador (`G1`–`G3`)** como modo alternativo seleccionable en el modal de configuración/inicio (y en los scripts de calibración existentes) para no perder trabajo previo ni romper pruebas de `CONTROLES_V2`.
3. En `G0` / `estadoAutomatico: true`, las obras de suceso (`muralla`, `silo`, `riego`, `hospital_campana`) quedan estrictamente excluidas del catálogo y de cualquier construcción automática (`EDIFICIOS_V2.md` §5).

---

## 3. Discrepancias menores entre documentos v2

| Punto | Qué dicen los docs | Decisión |
|---|---|---|
| Unidad de `salario_publico` | `CONTROLES_V2.md` §2 dice *"Monto por día"*; los presets y el motor usan `%` (base 100%, rango 50–150%) sobre `salarioBasePublico`. | Mantener `%` en el contrato numérico del motor (compatible con calibración y `elecciones_simple.json`) y exponer el monto diario equivalente (`$/día`) en la UI/indicadores. |
| `tope_precio` | `CONTROLES_V2.md` §2 dice *"Múltiplo de `precio_base`, o sin tope"*; los presets y scripts usan `'libre' \| 'moderado' \| 'estricto'`. | Mantener los 3 modos en controles (`libre = sin tope`, `moderado = 1.25×`, `estricto = 0.6×`). |
| Nombres de oficinas en `MAPA_V2.md` vs `EDIFICIOS_V2.md` | `MAPA_V2.md` §4 lista `oficinas` genérico; `EDIFICIOS_V2.md` §4 detalla `oficina_constructora`, `oficina_inmobiliaria`, `oficina_medio` (y `oficina_banco` para M4 `fiscal`). | Asignar clase mínima `M` a todos los tipos `oficina_*`; **retirar `oficina_banco` y el rubro `'banco'`** mientras el crédito siga fuera de alcance. |
| Capas de lectura (`UI_PROTOTIPO_MUNDO.md`) | §1 enumera 8 botones (`ninguna · ánimo · roles · vivienda · firmas · alquiler · vías · acciones`) y §4 agrega 4 capas zonales (`defensa`, `orden`, `integridad`, `amenaza`). | Soportar las **12 opciones** en selector desplegable en la barra inferior (`ninguna` por defecto). |
| Tamaño inicial `escuela` | `MAPA_V2.md` §4 requiere lote `L` (4×4) para `escuela` y `hospital`. | Actualizar todos los lotes y el generador de mapa para garantizar clase `L` en escuelas y hospitales, y validar la clase mínima en toda construcción privada o pública. |

---

## 4. Decisiones concretas sobre puntos marcados `[propuesta]`

1. **`MAPA_V2.md` §4 (Clases de lote):** `S` = 2×2, `M` = 3×3, `L` = 4×4, `XL` = 6×6 baldosas. Toda creación o expansión de edificio (generador, obra estatal, expansión de firma, emprendimiento, vivienda) exige `clase(lote) >= claseMinima(edificio)`.
2. **`MAPA_V2.md` §8 (Escalas del mapa):** `48×48` baldosas para 100 hab., `80×80` para 500 hab. y `160×160` para 5.000 hab.; al menos ~30 % de los lotes comienzan `sin_calle`, más zonas `no_urbanizada` abiertas por `camino` o `puente`.
3. **`MAPA_V2.md` §5–§6 (Vecindad y red vial):** La vecindad entre zonas se deriva automáticamente por contigüidad ortogonal de baldosas activas en la grilla; las distancias entre lotes se precomputan mediante Dijkstra ponderado sobre nodos viales y frentes de lote y solo se recalculan al construirse un tramo o cambiar su transitabilidad.
4. **`MOTOR_V2.md` §3 (RNG por subsistema):** Generadores independientes (`clima`, `caos`, `vida`, `mercado`, `prensa`) serializados dentro del estado y del JSON de guardado/carga.
5. **`MOTOR_V2.md` §7 (Agenda diaria de 5 franjas):** `noche` (00:00–06:00), `manana` (06:00–12:00), `mediodia` (12:00–14:00), `tarde` (14:00–19:00), `anochecer` (19:00–24:00). Velocidad de viaje = `18` baldosas/hora (`baldosasPorHora`); rutas más largas que la ventana laboral reducen la productividad diaria (`k_traslado`).
6. **`MUNDO_V2.md` §3 (Hogar de acogida):** Si todos los adultos de un hogar mueren y quedan menores sin pariente directo (`padres`/`hermanos`/`abuelos`), pasan a un hogar `esAcogida: true` sin casa cuyo costo diario cubre el estado (`acogidaMenores`).
7. **`MUNDO_V2.md` §5 (Separaciones):** Regla fija determinista: quien conserve los menores (o mayor parte/sueldo) retiene el hogar/casa original y el otro adulto funda hogar propio (con casa libre si puede pagarla, si no en calle); la caja del hogar se reparte 50/50.
8. **`MUNDO_V2.md` §7 y `ECONOMIA_V2.md` §3 (Gerente sin partes):** Si un empresario figura como `gerenteId` de una firma donde no posee `partes`, cobra sueldo de gerente (`referencia * factor`).
9. **`MUNDO_V2.md` §9 (Piloto automático estatal):** En `G0` / `estadoAutomatico: true`, construye `hospital` o `comisaria` cuando la cobertura cae < 80 % del objetivo sobre población actual, y construye el tramo vial de menor `costoObra / parcelasAbiertas` cuando una `demandaSuelo[`${zona}:${tipo}`]` supera `umbral_demanda_suelo` durante `periodos_demanda_suelo` períodos.
10. **`ECONOMIA_V2.md` §4 (Holdings / filiales):** `partes` admite `{ tipo: 'firma', id, pct }` cuando una firma compra otra en modalidad filial.
11. **`ECONOMIA_V2.md` §6b y §7:** Reparto de gasto de vida desplazado por riqueza y rasgos; alquiler = `alquiler_base * (casa.estado / 100) * demandaZona` con ajuste progresivo ante vacancia (`paso_alquiler`).
12. **`CAOS_PRENSA_V2.md` §6 y §7:** Interés del director ponderado por hechos recientes de familia y patrimonio; deriva de línea editorial `k_linea = 0.2` al cambiar dueños; en monopolio de medios (1 solo medio con `sensacionalismo >= 60`), credibilidad cae `-0.5` por período.
13. **`ACCIONES_V2.md` §1 (`remodelar_casa`):** Efecto `repara` con alcance `'casa'` restaura `estado` de la vivienda propia del hogar.

---

## 5. Desalineaciones puntuales detectadas y corregidas en el código

1. **Lectura de claves compuestas en UI:** `SideInspectorPanel`, `CityWindow` y `EconomyWindow` leían `demandaSuelo[zona]` en lugar de `demandaSuelo[\`\${zona}:\${tipo}\`]` y `cuotaMercado[rubro]` en lugar de `cuotaMercado[\`\${rubro}:\${zona}\`]`.
2. **Pestaña inexistente `'despacho'` en `App.tsx`:** `openCiudadTab('despacho')` no correspondía a ninguna pestaña válida de `CityWindow`.
3. **Contagio vs topes de acciones de condición:** El contagio diario de `ocupacion` y `boicot` ahora aplica estrictamente `maxOcupacionesPorPeriodo` y `maxPctHogaresBoicot`, y `accionesEnVentana` se incrementa siempre en acciones espontáneas.
4. **Cero medios activos y policía:** Con 0 medios activos (`medios.filter(m => m.activa).length === 0`), ningún fenómeno anunciado antes de `inicioDia` difunde aviso ni reubica policías preventivamente.
5. **Efectos de dinero/comida sobre el hogar:** `gasta`, `ahorra`, `acapara`, `comparte` y `toma` afectan la propensión/despensa del hogar del participante, no solo del individuo aislado.
6. **Rendimiento O(N) para 5.000 personas:** Indexación previa por zona/rol/hogar en `economyV2.ts`, `simulation.ts` y `lifecycleV2.ts`, evitando búsquedas O(N²) en contratación, vivienda y emprendimientos.

---

## 6. Decisiones de producto y correcciones de motor resueltas

1. **Alcance y modos ocultos:** El foco de la aplicación es el **Observador v0.1 (`M3` + `G0` + `estadoAutomatico: true`, `usarIaGemini: false`)**. Las capas de gobernador (`G1`–`G3`), la integración con IA, el sonido en UI normal y los escenarios alternativos permanecen detrás del selector avanzado / modo desarrollador sin interferir con v0.1.
2. **Palanca `nivelEducacion` y nivel 1.1:** Las mecánicas adicionales de nivel 1.1 (palancas extra activas, contraofertas y actores adicionales) quedan detrás de `G3`; **`nivelEducacion` queda permanentemente apagada** en todo nivel porque en el mundo base no existe educación como servicio con costo por nivel.
3. **Unidades de controles:** Se preservan las escalas actuales del motor y de los presets (`salarioPublico` en %, `nivelObras` en `0..5`, `precioMaximo` en `'libre' | 'moderado' | 'estricto'`).
4. **M4 (`fiscal`) sin banco/crédito:** `M4` conserva exclusivamente emisión monetaria e inflación; se retiran `oficina_banco` y el rubro `'banco'` del catálogo, generador, economía y filtros hasta especificar el crédito.
5. **Orden diario fiel a `MOTOR_V2` §2:** Ataques y daño de fenómenos ejecutados en el **paso 2**; salud e internación por hospital más cercano según costo vial real en el **paso 4**; muertes y herencia unificadas en el **paso 5** (`processZeroHealthDeaths` antes de `runDailyLifecycleV2`); y ejecución síncrona de caos (**paso 7**) y prensa (**paso 8**) dentro de `advanceDay`/`stepHeadlessDay` cuando no interviene el directorio IA (`!usarIaGemini`), habilitando el modo sin dibujo.
6. **Mapa desde `state.mapaGrid`:** `CityWorldCanvas` dibuja terreno, agua y zonas directamente desde `state.mapaGrid`, eliminando río, arroyo, árboles, molino y vehículos ambientales hardcodeados; la flora decorativa remanente es puramente determinista desde `mapaGrid` y `semilla`.
7. **Rutas por Dijkstra real:** Cálculo de distancias viales entre frentes de lote y zonas con grafo ponderado real (`distanciasLotes` / `getLotTravelCost` / `getRouteWaypointsBetween`), ordenando admisiones y reubicaciones hospitalarias por menor costo vial real; el test de alineación (`Check 7`) verifica incremento estricto de costo tanto de zona como entre lotes al cortar un tramo.
8. **Fuente única `firmas[]`:** Se elimina `state.empresas` y `syncLegacyEnterprisesView` de tipos, motor y scripts; toda lectura/escritura opera únicamente sobre `firmas[]`.
9. **Conservación monetaria en `M4`:** `checkEngineInvariants` mantiene activa la auditoría diaria de dinero también en `M4`, contabilizando la emisión en `auditEntradasDia`.
10. **Emprendimientos y escalado de oficinas:** Se permiten emprendimientos privados en todos los rubros y tipos edificables según la categoría con mayor demanda insatisfecha; las `oficina_constructora` y `oficina_inmobiliaria` escalan con la población.
11. **Orden de liquidación en día de pago:** Las transferencias estatales de mantenimiento, alquileres públicos y obras/prensa se acreditan antes de liquidar las firmas constructoras y de medios en el cierre del período.
12. **Cupos y contratación:** `getBuildingJobCaps` suma todas las escuelas y oficinas públicas activas; se elimina el umbral implícito `factor >= 0.85`, reemplazándolo por el parámetro nombrado `FIRM_CONSTANTS.factorMinContratacion = 0`.
13. **Boicot transversal a todos los rubros:** Tanto el disparador de condición como el efecto de la acción `boicotea` aplican a cualquier firma/rubro que cruce los umbrales de cuota y poder de precio, no solo `'comercio'`.
14. **Gráficas de `MUNDO_V2` §11:** `EconomyWindow` grafica todas las series registradas en `historial`: apoyo, satisfacción, hambre, stock en días, reserva, precio, empleo, vivienda, edad media e inflación.

