# Motor (v2.0)

> Lo técnico del motor: tiempo, orden de cálculo, escala, determinismo, guardado, infraestructura de la IA opcional. El diseño de lo que se calcula está en MUNDO_V2, ECONOMIA_V2, EDIFICIOS_V2 y CAOS_PRENSA_V2. Contrato con la UI: UI §9 (sin cambios). Lo marcado **[propuesta]** se pule.

---

## 1. Tiempo

- El **día de juego** es la unidad: la lógica corre una vez por día y la UI interpola entre ticks. Segundos reales por día, ticks por día y velocidades: parámetros.
- Tres cadencias: **diaria** (comida, salud, caos, prensa, clima), **día de pago** cada `periodo_dias` (firmas, alquiler, estado, mercados) y **demográfica** cada `periodo_dias_demografico` (parejas, nacimientos, independizaciones, separaciones).
- El motor es dueño del reloj. Nada pausa el juego salvo el usuario. Acelerar acelera la simulación, no la IA.

## 2. Orden de cálculo diario [propuesta]

1. Entran en vigencia los cambios de control pendientes (evento `control`). Avanzan las obras; las terminadas se activan (`obra_fin`, `casa_construida`).
2. Clima: intensidades, avisos, ataques y golpes.
3. Economía diaria: producción de las firmas `agro`, comercio exterior, precio por zona, compras de comida de los hogares, gasto de vida, consumo.
4. Salud: hambre crítica, internación, cura.
5. **Vida:** mortalidad por edad, muertes (por golpes, hambre o edad), herencia inmediata, cumpleaños y cambios de etapa (egreso a los 18, paso a jubilado).
6. Seguridad: reubicación, defensa, orden, reparación de integridad.
7. Caos: contagio, acciones de condición, ofertas del director, vencimientos.
8. Prensa: cola de hechos, publicación y efectos.
9. Variables de las personas y vencimiento de modificadores.
10. **Si es día de pago:** firmas (sueldos, ganancia, contratación) → alquileres y mantenimiento → estado → mercado de vivienda (asignación, mudanzas, desalojos) → mercado de compras → quiebras → inversión, emprendimientos y construcción → medios (ingresos, línea, cierre) → impago.
11. **Si es período demográfico:** parejas → nacimientos → independizaciones y separaciones.
12. Cambios de rol y asignación de puestos (vacantes, desempleados que buscan, emprendedores).
13. Derivados de la comunidad e historial.
14. Capa del gobernador: hitos, demandas, objetivo y derrota.

Las órdenes del jugador se validan y ejecutan en el momento, también en pausa.

## 3. Determinismo y guardado

- Sin IA, una partida es determinista dada la semilla. **Un generador de azar por subsistema** (clima, caos, vida, mercado, prensa) para que agregar eventos de un subsistema no cambie los de otro **[propuesta]**.
- Con IA, cada elección del clasificador y cada texto generativo se guardan con su día, y la partida se reproduce sin llamar al modelo.
- **Guardado:** un archivo por guardado, JSON versionado y comprimido, independiente del lenguaje. Contiene: versión de formato, semilla, población inicial, configuración efectiva (preset y marcas de configuración de prueba) y todo el estado que no se recalcula: **personas** (con genealogía), **hogares**, **casas**, **firmas** (partes, caja, factor, cuotas, locales), estado, clima, medios, integridad de zonas, parcelas y edificios (obras en curso), ofertas de compra pendientes, generadores de azar, elecciones y textos de la IA, eventos e historial.
- Se retoma desde esa foto, sin reproducir la partida. La foto se toma al cierre de un día y se escribe en segundo plano a un archivo temporal que se renombra al terminar.
- **Registro de eventos:** los hechos raíz no se descartan nunca: `control`, `obra_inicio`, `demolicion`, `fenomeno_inicio`, `aviso`, `muerte`, `nacimiento`, `pareja`, `herencia`, `desalojo`, `firma_fundada`, `firma_compra`, `firma_quiebra`, `monopolio`, `impago`. Los de alta frecuencia (`ataque`, `golpe`, `internacion`, `alta`, `casa_estado`, cambios diarios de zona) se guardan uno por uno los últimos `ventana_eventos_dias` y, más atrás, agregados por día y zona.
- Cada partida tiene un guardado manual y un autoguardado periódico. Un guardado de otra versión se migra o se rechaza con un aviso claro.

## 4. IA opcional: infraestructura

Como MOTOR_V1 §4: consultas asíncronas que nunca bloquean el juego, versión mecánica por defecto, memoria compartida con el render, apagada por defecto.

## 5. Escala (100 a 5.000 personas) [propuesta]

- **O(N) por día.** Ninguna regla compara todos contra todos. Las búsquedas (casas libres, firmas con vacante, postulantes) usan **índices por zona** que se actualizan cuando cambian, no se recalculan.
- **Lo caro corre por período:** mercado de vivienda, mercado de compras, parejas, nacimientos, emprendimientos y construcción corren en día de pago o período demográfico, por zona, nunca por persona cada día.
- **Hogares como unidad de cómputo** de comida y gasto, no la persona; la comida se calcula una vez por hogar.
- **Firmas como unidad** de ventas y sueldos; los empleados cobran por lote.
- **Eventos agregados** cuando son masivos: un mismo día, muchas compras de comida o muchas muertes, se emiten por zona o por hogar.
- **Historial** compacta por semana pasado `historial_max_dias` (como v1).
- **Tamaños de prueba:** 100 para depurar, 500 de referencia, 5.000 para rendimiento. Los tres usan el mismo código.
- **Modo sin dibujo:** el motor corre sin UI a máxima velocidad para validar décadas en minutos.

## 6. Verificaciones del motor

Cada día, en modo de prueba:

- El dinero total no deriva fuera de lo permitido por ECONOMIA_V2 §12.
- Todo hogar tiene al menos un adulto; toda persona viva tiene un hogar; toda casa ocupada tiene un hogar.
- Las `partes` de cada firma suman 100 o la firma es del estado.
- Toda persona con `empleador` está en la nómina de esa firma.

Si falla alguna, el motor registra el error con el evento que la rompió.

## 7. Promoción por necesidad

Como MOTOR_V1 §5: lo que hoy es un número (integridad de zonas, zombis como intensidad, servicios como indicador) pasa a entidad solo cuando una regla dependa de ello. **Nuevo:** casas y firmas ya son entidades; los *barrios* y los *edificios públicos con integridad propia* se promueven si una regla lo pide.
