# Motor (v1.0)

> Lo técnico del motor: tiempo, orden de cálculo, determinismo, guardado e infraestructura de la IA opcional. El diseño de lo que se calcula está en MUNDO, ECONOMIA, CAOS_PRENSA y GOBERNADOR. Contrato con la UI: UI §9.

---

## 1. Tiempo

- El **día de juego** es la unidad: la lógica corre una vez por día y la UI interpola entre ticks. Segundos reales por día, ticks por día y velocidades: CALIBRACION.
- El motor es dueño del reloj. La UI pide pausar, reanudar y cambiar la velocidad. Nada pausa el juego salvo el usuario.
- Acelerar acelera la simulación, no la IA.

## 2. Orden de cálculo diario [propuesta]

1. Entran en vigencia los cambios de control pendientes (evento `control`). Avanzan las obras; las terminadas se activan (`obra_fin`).
2. Clima: intensidades, avisos, ataques y golpes (MUNDO §5).
3. Economía diaria: producción, comercio exterior, precio, compras, gasto de vida, consumo (ECONOMIA §2).
4. Salud: hambre crítica, internación, cura, muerte (MUNDO §6).
5. Seguridad: reubicación, defensa, orden, reparación de integridad (MUNDO §8).
6. Caos: contagio, acciones de condición, ofertas del director, vencimientos (CAOS_PRENSA §3-6).
7. Prensa: cola de hechos, publicación y efectos (CAOS_PRENSA §8).
8. Variables de los NPCs y vencimiento de modificadores (MUNDO §10).
9. Si es día de pago: empresas, estado, medios, impago (ECONOMIA §2) e inversión privada (MUNDO §13).
10. Edad y cambios de rol (MUNDO §3).
11. Derivados de la comunidad e historial (MUNDO §11).
12. Capa del gobernador: hitos, demandas (disparo, vencimiento, medidas), objetivo y derrota (GOBERNADOR §4 y §6, ACTORES.md).

Las órdenes del jugador (construir, demoler) se validan y ejecutan en el momento, también en pausa.

## 3. Determinismo y guardado

- Sin IA, una partida es determinista dada la semilla. Con IA, cada elección del clasificador y cada texto generativo se guardan con su día, y la partida se reproduce sin llamar al modelo.
- **Guardado:** un archivo por guardado, en JSON versionado y comprimido, independiente del lenguaje. Contiene la versión de formato, la semilla, la población inicial, la configuración efectiva (preset aplicado y marcas de configuración de prueba) y todo el estado que no se recalcula: NPCs, empresas, estado (reserva, impago, acumuladores del período, cambios de control pendientes), clima, medios, integridad de las zonas, parcelas y edificios (con sus obras en curso), demandas activas, compromisos y medidas vigentes, hitos cumplidos, generador de azar, elecciones y textos de la IA, eventos e historial.
- Se retoma desde esa foto, sin reproducir la partida: cargar cuesta lo mismo el día 10 que el 300.
- **Registro de eventos:** los hechos raíz (`control`, `obra_inicio`, `demolicion`, `fenomeno_inicio`, `aviso`, demandas, `muerte`, `impago`) no se descartan nunca. Los de alta frecuencia (`ataque`, `golpe`, `internacion`, `alta`, cambios diarios de zona) se guardan uno por uno los últimos `ventana_eventos_dias` y, más atrás, agregados por día y zona. Así ninguna cadena de causas pierde su raíz.
- La foto se toma al cierre de un día y se escribe en segundo plano a un archivo temporal que se renombra al terminar.
- Cada partida tiene un guardado manual y un autoguardado periódico. Un guardado de otra versión se migra o se rechaza con un aviso claro.

## 4. IA opcional: infraestructura

- Consultas asíncronas: nunca bloquean el juego. Si el resultado no llega en su plazo, decide el motor o se usa la plantilla; un resultado atrasado se descarta. Plazos: CALIBRACION.
- Cada uso tiene su versión mecánica (por defecto), local o por API. Cambiar de modelo no toca las reglas.
- **Memoria:** IA y render no pasan de 6 GB de VRAM juntos. Con la IA apagada, todo va al render. Con dos modelos que no entran, se carga uno solo, corren en RAM y CPU o van por API.
- Viene apagada por defecto y solo la activa el usuario (UI §10).

## 5. Promoción por necesidad

Lo que hoy es un número (integridad, zombis como intensidad, servicios como indicador) pasa a ser entidad del motor solo cuando una regla dependa de ello. Al promoverse, cambia de dónde sale el número, no el contrato con la UI ni los controles.
