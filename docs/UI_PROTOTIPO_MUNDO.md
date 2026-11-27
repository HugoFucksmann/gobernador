# UI 2D del prototipo: observar el mundo

> Para esta etapa no hay gobernador: la UI sirve para **ver y entender el mundo simulado**. Todo lo que muestra sale del motor (CONTROLES §4 y §5); no agrega reglas. No incluye palancas, demandas, hitos ni objetivo. Lo marcado **[propuesta]** se pule.

---

## 1. Pantalla

```
┌──────────────────────────────────────────────────────────────┐
│ Día 412 · 14:30 · ⏸ x1 x2 x5 x20     Pob 4.980 · Hog 1.620 · Calle 3% · Firmas 214 │
├──────────────────────────────────────────┬───────────────────┤
│                                          │ Seleccionado      │
│            MAPA (grilla 2D)              │ · ficha           │
│  baldosas · calles · lotes · personas        │ · ¿por qué?       │
│                                          ├───────────────────┤
│                                          │ Registro de hechos│
└──────────────────────────────────────────┴───────────────────┘
 Capas: ninguna · ánimo · roles · vivienda · firmas · alquiler · vías · acciones
```

## 2. Mapa

- Dibuja la grilla de `mapa.json` (MAPA): terreno, vías con color según su `estado`, zonas con tinte suave y nombre.
- **Lotes** según estado: `sin_calle` (gris con trama), `libre` (borde punteado), `en_obra` (barra de progreso), `ocupada` (ícono del edificio y, si es una casa, de su ocupación).
- **Edificios:** ícono por tipo con su estado (activo, sin personal, lleno, en obra, mal estado).
- **Personas:** puntos de color según su rol. Siguen su **agenda** (MOTOR §7): de noche en su casa, de día en su trabajo o escuela, y van a comprar, a comer o a hospital cuando corresponde. Se mueven por las vías, de un lote a otro, según la hora del motor.
- Los que están en una acción, internados, fuera de su puesto o en la calle se ven distinto.
- **Cámara 2D:** arrastrar, zoom y atajos a cada zona.

## 3. Interacción (solo lectura)

| Clic en | Qué muestra |
|---|---|
| **Lote** | Tipo, estado, dueño, edificio, personal y ocupantes, alquiler si es una casa, ventas si es un local |
| **Persona** | Ficha: rol, edad, hogar y familia, empleador y `partes`, casa, ánimo, personalidad y ritmo (turno, hábitos), acción en curso, agenda del día y "¿por qué?" |
| **Hogar** | Miembros, casa, dinero, despensa, alquiler y meses sin pagar |
| **Firma** | Rubro, dueños con %, locales, empleados, `factor`, caja, cuota de zona |
| **Vía** | Tipo, estado, qué lotes abre |
| **Zona** | Población, ánimo medio, vivienda, empleo y necesidad principal |
| **Medio** | Dueños, línea, alcance, credibilidad, noticias |
| **Hecho del registro** | La cámara va al lugar y muestra la cadena "¿por qué?" |

- **Terreno:** relieve de `altura` y selector de semilla para generar otro mapa (modo desarrollador).
- **Seguir a una persona:** la cámara la acompaña durante el día.
- **Lista filtrable** de personas, hogares y firmas para llegar a una sin buscarla.

## 4. Capas del mapa

Son **12**, en un selector desplegable de la barra inferior (`ninguna` por defecto), una a la vez: ánimo, roles, vivienda (casa propia, alquilada, hacinada, calle), firmas (por rubro o por dueño), alquiler por zona, estado de las vías, acciones en curso, y defensa, orden, integridad y amenaza por zona.

## 5. Registro y paneles

- **Registro de hechos** con filtro por tipo (vida, familia, mercado, vivienda, obras, clima, caos, prensa) y por zona. Cada hecho es clicable y lleva a su causa.
- **Ventanas de detalle:** población (pirámide de edades, natalidad y mortalidad), economía (precios, alquileres, cuota de mercado por rubro), firmas (lista y ranking), vivienda, prensa (noticias y medios), historial (las series de MUNDO §11).

## 6. Controles del tiempo y modo desarrollador

- Pausa, velocidades x1 a x20 o más, y avanzar un día.
- **Modo desarrollador** (oculto): semilla, escala (100, 500, 5.000), forzar fenómenos, valores crudos, tiempos de simulación, exportar métricas y partidas grabadas, y **modo sin dibujo** para correr décadas rápido.

## 7. Primera vista y revelado progresivo [propuesta]

La UI muestra poco al principio y deja ir hondo a pedido. Todo sale de la capa de lectura (LECTURA).

- **Barra superior:** reemplaza los números sueltos por los **indicadores de vistazo** (6, más Orden con M2). Cada uno muestra estado (color y ícono), flecha de tendencia y una miniserie. El valor crudo aparece al pasar el cursor y en el modo desarrollador.
- **Alertas:** hasta 3 a la vez, en lenguaje claro, con su causa; al tocar una se abre su tema.
- **Tema:** al tocar un indicador se ve su serie, sus `causas_top` y su capa de mapa de calor (por zona).
- **Detalle:** las ventanas de §5 y los valores de CONTROLES §4, en un lugar aparte.
- **Personas clave:** las notables (`empresario`, `medio`) se marcan en el mapa con un distintivo por tipo, tienen su lista aparte y se pueden seguir como cualquier persona. Su ficha muestra por qué son notables y sus últimos hechos.
- **Informe del período:** ventana con los 3 cambios más importantes y sus porqués.
- **Botón "Despacho":** lleva a la vista de lectura reunida (LECTURA §6). En esta etapa es opcional y de solo lectura (Resumen, Historial y porqués, Informe y Personas clave); el resto llega con el gobernador.

## 8. Reglas

- La UI no tiene lógica de juego: la agenda, las rutas y los costos las entrega el motor.
- Todo evento se representa en el mapa o, si no se ve, en el registro de hechos.
- La vista nunca inventa eventos con efecto: toda muerte, nacimiento o mudanza visible es un evento.
