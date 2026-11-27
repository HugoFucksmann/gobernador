# Motor

> Lo técnico del motor: tiempo, orden de cálculo, escala, determinismo, guardado e infraestructura de la IA opcional. El diseño de lo que se calcula está en MUNDO, ECONOMIA, EDIFICIOS, CAOS_PRENSA y GOBERNADOR. Contrato con la UI: UI §9. Los valores son parámetros con nombre del preset. Lo marcado **[propuesta]** se pule.

---

## 1. Tiempo

- El **día de juego** es la unidad: la lógica corre una vez por día y la UI interpola entre ticks. Segundos reales por día, ticks por día y velocidades: parámetros.
- **Semana:** el día de la semana es `dia % 7`; los turnos y descansos dependen de él (§7).
- Tres cadencias: **diaria** (comida, salud, caos, prensa, clima), **día de pago** cada `periodo_dias` (firmas, alquiler, estado, mercados) y **demográfica** cada `periodo_dias_demografico` (parejas, nacimientos, independizaciones, separaciones).
- El motor es dueño del reloj. La UI pide pausar, reanudar y cambiar la velocidad. Nada pausa el juego salvo el usuario. Acelerar acelera la simulación, no la IA.

## 2. Orden de cálculo diario [propuesta]

1. Entran en vigencia los cambios de control pendientes (evento `control`). Avanzan las obras (edificios y vías); las terminadas se activan (`obra_fin`, `casa_construida`, `via_fin`; las parcelas que abre una vía pasan a `libre`).
2. Clima: intensidades, avisos, ataques y golpes.
3. Economía diaria: producción de las firmas `agro`, comercio exterior, precio por zona, compras de comida de los hogares, gasto de vida, consumo.
4. Salud: deriva por edad, calle y hambre; internación; cura.
5. **Vida:** mortalidad por edad, muertes (por golpes, hambre o edad), herencia inmediata, cumpleaños y cambios de etapa (egreso a los 18, paso a jubilado).
6. Seguridad: reubicación, defensa, orden, reparación de integridad.
7. Caos: contagio, acciones de condición, ofertas del director, vencimientos.
8. Prensa: cola de hechos, publicación y efectos.
9. Variables de las personas y vencimiento de modificadores.
10. **Si es día de pago** (mismo orden que ECONOMIA §2): estado paga (pensiones, nómina, ayuda, mantenimiento y operación, fondos de prensa; evalúa el impago) → firmas (sueldos, ganancia, contratación) → hogares (alquileres y mantenimiento) → mercado de vivienda (asignación, mudanzas, desalojos) → mercado de compras → quiebras → inversión, emprendimientos y construcción → estado en piloto automático (ajuste fiscal, freno de obra, servicios y vías) → medios (ingresos, línea, cierre).
11. **Si es período demográfico:** parejas → nacimientos → independizaciones y separaciones → migración.
12. Cambios de rol y asignación de puestos (vacantes, desempleados que buscan, emprendedores).
13. Derivados de la comunidad e historial; indicadores de lectura, alertas y series (LECTURA). Si es día de pago: notables e informe.
14. Capa del gobernador: hitos, demandas (disparo, vencimiento, medidas), objetivo y derrota (GOBERNADOR §4 y §6, ACTORES.md).

Las órdenes del jugador (construir, demoler) se validan y ejecutan en el momento, también en pausa.

## 3. Determinismo y guardado

- Sin IA, una partida es determinista dada la semilla. **Un generador de azar por subsistema** (terreno, clima, caos, vida, mercado, prensa, ritmo) para que agregar eventos de un subsistema no cambie los de otro **[propuesta]**.
- Con IA, cada elección del clasificador y cada texto generativo se guardan con su día, y la partida se reproduce sin llamar al modelo.
- **Guardado:** un archivo por guardado, JSON versionado y comprimido, independiente del lenguaje. Contiene: versión de formato, semilla, población inicial, configuración efectiva (preset y marcas de configuración de prueba) y todo el estado que no se recalcula: **personas** (con genealogía), **hogares**, **casas**, **firmas** (partes, caja, factor, cuotas, locales), estado (reserva, impago, acumuladores del período, cambios de control pendientes), clima, medios, integridad de zonas, parcelas (incluido el suelo `sin_calle`), tramos de la red vial, zonas no urbanizadas y edificios (obras en curso), ofertas de compra pendientes, demandas activas, compromisos y medidas vigentes, hitos cumplidos, generadores de azar, elecciones y textos de la IA, eventos e historial, series y alertas de lectura, notables e informes.
- Se retoma desde esa foto, sin reproducir la partida: cargar cuesta lo mismo el día 10 que el 300. La foto se toma al cierre de un día y se escribe en segundo plano a un archivo temporal que se renombra al terminar.
- **Registro de eventos:** los hechos raíz no se descartan nunca: `control`, `obra_inicio`, `demolicion`, `fenomeno_inicio`, `aviso`, `muerte`, `nacimiento`, `pareja`, `herencia`, `desalojo`, `firma_fundada`, `firma_compra`, `firma_quiebra`, `monopolio`, `impago` y los de demandas. Los de alta frecuencia (`ataque`, `golpe`, `internacion`, `alta`, `casa_estado`, cambios diarios de zona) se guardan uno por uno los últimos `ventana_eventos_dias` y, más atrás, agregados por día y zona. Así ninguna cadena de causas pierde su raíz.
- Cada partida tiene un guardado manual y un autoguardado periódico. Un guardado de otra versión se migra o se rechaza con un aviso claro.

## 4. IA opcional: infraestructura

- Consultas asíncronas: nunca bloquean el juego. Si el resultado no llega en su plazo (parámetro), decide el motor o se usa la plantilla; un resultado atrasado se descarta.
- Cada uso tiene su versión mecánica (por defecto), local o por API. Cambiar de modelo no toca las reglas.
- **Memoria:** IA y render no pasan de 6 GB de VRAM juntos. Con la IA apagada, todo va al render. Con dos modelos que no entran, se carga uno solo, corren en RAM y CPU o van por API.
- Viene apagada por defecto y solo la activa el usuario (UI §10).

## 5. Escala (100 a 5.000 personas) [propuesta]

- **O(N) por día.** Ninguna regla compara todos contra todos. Las búsquedas (casas libres, firmas con vacante, postulantes) usan **índices por zona** que se actualizan cuando cambian, no se recalculan.
- **Lo caro corre por período:** mercado de vivienda, mercado de compras, parejas, nacimientos, emprendimientos y construcción corren en día de pago o período demográfico, por zona, nunca por persona cada día.
- **Red vial:** la distancia entre zonas se precomputa y se actualiza solo cuando un tramo cambia de estado o se construye; la distancia entre parcelas es la de su zona más un costo interno. La demanda de suelo por zona y tipo se mantiene como contador y se evalúa solo el día de pago.
- **Hogares como unidad de cómputo** de comida y gasto, no la persona; la comida se calcula una vez por hogar.
- **Firmas como unidad** de ventas y sueldos; los empleados cobran por lote.
- **Eventos agregados** cuando son masivos: un mismo día, muchas compras de comida o muchas muertes, se emiten por zona o por hogar.
- **Historial** compacta por semana pasado `historial_max_dias`.
- **Tamaños de prueba:** 100 para depurar, 500 de referencia, 5.000 para rendimiento. Los tres usan el mismo código.
- **Modo sin dibujo:** el motor corre sin UI a máxima velocidad para validar décadas en minutos.

## 6. Verificaciones del motor

Cada día, en modo de prueba:

- El dinero total no deriva fuera de lo permitido por ECONOMIA §12.
- Todo hogar tiene al menos un adulto, salvo los de acogida; toda persona viva tiene un hogar; toda casa ocupada tiene un hogar.
- Las `partes` de cada firma suman 100 o la firma es del estado.
- Toda persona con `empleador` está en la nómina de esa firma.

Si falla alguna, el motor registra el error con el evento que la rompió.

## 7. Agenda y ubicación

Para que la gente se vea ir a su casa, a su trabajo y a comprar, el motor deriva una **agenda** por persona. Es determinista (función del estado, la semilla y el día) y no genera eventos por persona. Sus elecciones de ocio, compras y faltazgos son las que alimentan la economía (ECONOMIA §6). Se diseña para que **no todos hagan lo mismo a la misma hora**.

- **Franjas del día** (valores del prototipo): `noche` (00-06), `manana` (06-12), `mediodia` (12-14), `tarde` (14-19), `anochecer` (19-24).
- **Actividad por franja**, según etapa, rol y situación:
  - Adulto con empleo privado o público: en su local o edificio durante su turno, comiendo en la pausa (en casa o en un local de gastronomía según su gasto) y en tiempo libre el resto. Las franjas son solo el marco; la hora real sale del turno y del ritmo personal (abajo).
  - Estudiante: en la escuela más cercana con lugar si tiene una al alcance (MUNDO §9); si no, en casa. Jubilado y desempleado: en casa, de compras o de ocio.
  - Quien tiene `accion` en curso con `fuera_de_puesto` o `moviliza`, está internado, fuera de su puesto o en un lote de `zona_destino`: en ese lugar, no en su rutina. Una acción sin esos efectos (rarezas, rumores) ocurre en su tiempo libre, cerca de su casa o zona, y no cambia su turno (CAOS_PRENSA §2).
  - **Dónde está en un momento dado:** el motor responde la ubicación de una persona (lote o ruta, y la hora) para que la UI pueda llevar la cámara a ella con un clic en un suceso (CONTROLES §5, `foco`).
  - Hogar en calle: duerme en una baldosa de calle de su zona.
  - **Compras:** en la franja de compras cada hogar va al lote del vendedor que eligió ese día (ECONOMIA §6) y consume su capacidad de ventas.
- **Turnos por local [propuesta, valores del prototipo]:** cada rubro tiene horario y días abiertos; el empleado toma un turno al asignarse el puesto (semilla), y el local reparte su plantel entre turnos. Oficina y estatal 9-17; escuela 8-13; almacén, supermercado y tienda 9-20 en 2 turnos; kiosco 7-23 en 2 turnos; gastronomía 11-24 en 2 turnos; industria 6-14 y 14-22; hospital 3 turnos de 24 h; agro 6-15; servicios 9-19; entretenimiento 16-02. Cada empleado tiene 1-2 `dias_descanso` por semana.
- **Ritmo personal:** `cronotipo` (−2 a +2 h, derivado de semilla y edad: los jóvenes más tarde, los mayores más temprano) desfasa salida y regreso. La hora de llegada suma el traslado y un retraso que crece con la poca `laboriosidad`.
- **Tiempo libre** (fuera de turno y en días de descanso): cada día cada persona elige una actividad entre casa y descanso, ocio (cine_teatro, club, bar_cafe), compras, visitar a la familia y pasear. Utilidad = necesidad × personalidad: `sociabilidad` sube ocio y visitas; `codicia` y `propension_gasto` suben compras frente a ahorro; `valentia` sube salir de noche; hambre alta manda a comer; satisfacción baja empuja al ocio y salud baja al descanso; `gustos` pesan la categoría.
- **Hábitos:** 2-3 lugares habituales de ocio y compras. Con probabilidad `p_habito` repite uno; si no, explora por gusto y cercanía. El hábito menos usado se reemplaza por el nuevo favorito; los lugares que cierran se olvidan.
- **Faltazgos:** probabilidad diaria de faltar al turno que sube con `rebeldia` y baja con buena `salud` y `satisfaccion`. Ese día produce menos.
- **Ubicación** = un lote (o una baldosa de calle) por franja.
- **Viaje:** entre dos franjas, la persona recorre la ruta mínima por la red de vías (MAPA §6). Tiempo = costo de ruta ÷ `baldosas_por_hora` (18 en el prototipo). Si la ruta no entra en la franja, llega tarde: produce menos ese día (el mismo traslado de MUNDO §8).
- **El motor entrega:** la agenda del día de cada persona (lista de franja y lote) y la ruta pedida entre dos lotes. La UI calcula la posición dentro del trayecto con la hora del reloj y anima.
- **Costo:** la agenda se decide una vez por persona al cambiar el día (O(N)), nunca por tick, y solo se materializa para lo que la UI muestra. Usa el RNG `ritmo` con (semilla, persona, día).

## 8. Promoción por necesidad

Lo que hoy es un número (integridad de zonas, zombis como intensidad, servicios como indicador) pasa a entidad del motor solo cuando una regla dependa de ello. Al promoverse, cambia de dónde sale el número, no el contrato con la UI ni los controles. Casas y firmas ya son entidades; los *barrios* y los *edificios públicos con integridad propia* se promueven si una regla lo pide.
