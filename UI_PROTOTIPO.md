# UI del prototipo en el navegador (v0.1)

> Indicaciones para que el agente de prototipo mejore la UI 2D del navegador. Es una UI aparte de la final en Godot (UI.md), que no cambia. No agrega reglas ni mecánicas: todo lo de acá muestra datos que el motor ya tiene (CONTROLES §4 y §5). Todo es **[propuesta]** para probar si el juego se siente bien.

---

## 1. Objetivo

En la primera prueba, el juego no se sintió divertido por tres razones de presentación:

1. No se entiende si se va bien o mal.
2. Las decisiones no muestran su consecuencia.
3. El mundo se mira, pero no se toca.

Esta UI ataca esas tres cosas.

## 2. Pantalla

```
┌───────────────────────────────────────────────────────────────┐
│ APOYO ▓▓▓▓▓░|░ 47% (meta 50)   CAJA 6 sem   OBJETIVO 331 días │
│ ── próximo: pago 3d · sequía 18d · demanda 2d · objetivo ──── │
├─────────────────────────────────────────────┬─────────────────┤
│                                             │ Panel lateral   │
│                  MAPA 2D                    │ · seleccionado  │
│    zonas · parcelas · edificios · NPCs      │ · demandas      │
│                                             │ · noticias      │
├─────────────────────────────────────────────┴─────────────────┤
│ Palancas: Finanzas · Obras · Alimento          ⏸  x1  x2      │
└───────────────────────────────────────────────────────────────┘
```

- El mapa ocupa la mayor parte de la pantalla: es la interfaz principal.
- Los paneles de detalle se abren al tocar algo y se cierran solos.

## 3. Saber si voy bien

- **Tres medidores grandes**, siempre visibles en la barra superior:

| Medidor | Qué muestra | Colores |
|---|---|---|
| **Apoyo** | `apoyo_pct`, con la meta del objetivo marcada en la barra. En zombies, **Población** con la meta y el límite de derrota | Verde sobre la meta, amarillo cerca, rojo lejos |
| **Caja** | La reserva expresada en semanas de gasto ("alcanza para 6 semanas") | Verde con margen, rojo con menos de 2 semanas |
| **Objetivo** | Días que faltan para el plazo | Neutro |

- Después de cada decisión, el cambio flota sobre el medidor (+3, −$200) y aparece una flecha de tendencia por unos segundos.
- **Balance cada 30 días:** una tarjeta con el apoyo actual frente a la meta y los 3 factores que más lo mueven a favor y en contra, sacados de los derivados de la comunidad.

## 4. Ver la consecuencia de cada decisión

- **Antes de confirmar** una palanca u obra: el costo exacto (de una vez y por período) y a quién afecta ("jubilados y desempleados", "zona norte").
- **Después:** se resaltan en el mapa los NPCs o la zona afectados, con burbujas de ánimo (contento, enojado) según cómo cambia su satisfacción en los días siguientes.
- **Resumen en cada día de pago,** como tarjeta que no pausa: ingresos, gastos, cambio de apoyo y los 3 hechos principales de la semana.

## 5. Tocar el mundo

| Elemento | Cómo se ve y qué hace |
|---|---|
| **Zonas** | Regiones de color suave con su nombre y un ícono de su necesidad principal (salud, seguridad, comida, empleo), calculada solo para mostrar a partir de sus NPCs |
| **Parcelas** | Libres (borde punteado, clicables), en obra (con barra de progreso), ocupadas (con el ícono del edificio), bloqueadas (con candado y su hito) |
| **Construir** | Clic en una parcela libre: menú con los edificios disponibles, su costo, días y mantenimiento. Al pasar por cada opción se ilumina su área de efecto |
| **Edificios** | Ícono por tipo con su estado (activo, sin personal, lleno, en obra). Clic: personal, capacidad y demoler |
| **NPCs** | Puntos de color según su rol que siguen su rutina (casa, trabajo, compras). Los que están en una acción, internados o fuera de su puesto se ven distinto |
| **Ficha del NPC** | Clic: una frase con el factor que más pesa en su ánimo ("No hay camas", "Me bajaron el sueldo"), calculada solo para mostrar, más rol, zona, ánimo, acción y el botón "¿por qué?" |
| **Eventos** | Animaciones simples: ataque desde su zona de origen, protesta que marcha, obra que termina |

## 6. Ritmo y menos saturación

- **Línea de tiempo** en la barra superior con lo que viene: próximo día de pago, avisos de clima, plazos de demandas y fecha del objetivo.
- **Tarjetas** solo para demandas, avisos de clima, inauguraciones y el resumen semanal. Las alertas menores se agrupan en el resumen.
- **Sonidos cortos** para decisión confirmada, demanda nueva, aviso e inauguración, con opción de apagarlos.

## 7. Modo desarrollador

Panel oculto (tecla aparte): semilla, nivel de mundo y de gobernador, velocidades altas, forzar fenómenos y demandas, ver los valores crudos de cada indicador y exportar las métricas de la partida.

## 8. Métricas de cada partida

Para comparar pruebas, exportar:

- tiempo entre decisiones;
- decisiones por tipo (palanca, obra, demanda);
- cambio del apoyo y de la caja después de cada decisión;
- demandas que vencieron sin respuesta.
