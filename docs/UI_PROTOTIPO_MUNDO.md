# UI 2D del prototipo: observar el mundo (v0.1)

> Para esta etapa no hay gobernador: la UI sirve para **ver y entender el mundo simulado**. Todo lo que muestra sale del motor (CONTROLES_V2 §4 y §5); no agrega reglas. No incluye palancas, demandas, hitos ni objetivo. Lo marcado **[propuesta]** se pule.

---

## 1. Pantalla

```
┌──────────────────────────────────────────────────────────────┐
│ Día 412 · 14:30 · ⏸ x1 x2 x5 x20     Pob 4.980 · Hog 1.620 · Calle 3% · Firmas 214 │
├──────────────────────────────────────────┬───────────────────┤
│                                          │ Seleccionado      │
│            MAPA (grilla 2D)              │ · ficha           │
│  baldosas · calles · lotes · NPCs        │ · ¿por qué?       │
│                                          ├───────────────────┤
│                                          │ Registro de hechos│
└──────────────────────────────────────────┴───────────────────┘
 Capas: ninguna · ánimo · roles · vivienda · firmas · alquiler · vías · acciones
```

## 2. Mapa

- Dibuja la grilla de `mapa.json` (MAPA_V2): terreno, vías con color según su `estado`, zonas con tinte suave y nombre.
- **Lotes** según estado: `sin_calle` (gris con trama), `libre` (borde punteado), `en_obra` (barra de progreso), `ocupada` (ícono del edificio y, si es una casa, de su ocupación).
- **Edificios:** ícono por tipo con su estado (activo, sin personal, lleno, en obra, mal estado).
- **NPCs:** puntos de color según su rol. Siguen su **agenda** (MOTOR_V2 §8): de noche en su casa, de día en su trabajo o escuela, y van a comprar, a comer o a hospital cuando corresponde. Se mueven por las vías, de un lote a otro, según la hora del motor.
- Los que están en una acción, internados, fuera de su puesto o en la calle se ven distinto.
- **Cámara 2D:** arrastrar, zoom y atajos a cada zona.

## 3. Interacción (solo lectura)

| Clic en | Qué muestra |
|---|---|
| **Lote** | Tipo, estado, dueño, edificio, personal y ocupantes, alquiler si es una casa, ventas si es un local |
| **Persona** | Ficha: rol, edad, hogar y familia, empleador y `partes`, casa, ánimo, acción en curso, agenda del día y "¿por qué?" |
| **Hogar** | Miembros, casa, dinero, despensa, alquiler y meses sin pagar |
| **Firma** | Rubro, dueños con %, locales, empleados, `factor`, caja, cuota de zona |
| **Vía** | Tipo, estado, qué lotes abre |
| **Zona** | Población, ánimo medio, vivienda, empleo y necesidad principal |
| **Medio** | Dueños, línea, alcance, credibilidad, noticias |
| **Hecho del registro** | La cámara va al lugar y muestra la cadena "¿por qué?" |

- **Seguir a una persona:** la cámara la acompaña durante el día.
- **Lista filtrable** de personas, hogares y firmas para llegar a una sin buscarla.

## 4. Capas de lectura

Una a la vez, apagadas por defecto: ánimo, roles, vivienda (casa propia, alquilada, hacinada, calle), firmas (por rubro o por dueño), alquiler por zona, estado de las vías, acciones en curso, defensa, orden, integridad y amenaza por zona.

## 5. Registro y paneles

- **Registro de hechos** con filtro por tipo (vida, familia, mercado, vivienda, obras, clima, caos, prensa) y por zona. Cada hecho es clicable y lleva a su causa.
- **Ventanas de detalle:** población (pirámide de edades, natalidad y mortalidad), economía (precios, alquileres, cuota de mercado por rubro), firmas (lista y ranking), vivienda, prensa (noticias y medios), historial (las series de MUNDO_V2 §11).

## 6. Controles del tiempo y modo desarrollador

- Pausa, velocidades x1 a x20 o más, y avanzar un día.
- **Modo desarrollador** (oculto): semilla, escala (100, 500, 5.000), forzar fenómenos, valores crudos, tiempos de simulación, exportar métricas y partidas grabadas, y **modo sin dibujo** para correr décadas rápido.

## 7. Reglas

- La UI no tiene lógica de juego: la agenda, las rutas y los costos las entrega el motor.
- Todo evento se representa en el mapa o, si no se ve, en el registro de hechos.
- La vista nunca inventa eventos con efecto: toda muerte, nacimiento o mudanza visible es un evento.
