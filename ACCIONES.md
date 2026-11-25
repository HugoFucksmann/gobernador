# Tabla inicial de acciones (BORRADOR v0.2)

> Base de arranque del director de caos. Los efectos están en ESTADOS §7.1, el formato de cada acción en ESTADOS §7 y la selección en ESTADOS §9. Todo valor numérico (intensidades, topes, pesos) vive en CALIBRACION.md; acá solo la forma. Cada acción trae un texto base: las variantes y los textos de las noticias son del doc del director y la prensa (IDEA §13). **[propuesta]** es base para pulir con las corridas.

---

## 1. Cómo leer la tabla

- **Quién puede:** requisitos del NPC. "Adulto" = etapa adulto (18-64). Salvo que se diga, vale para cualquier rol.
- **Contexto:** condición del mundo para que sea candidata. "Siempre" = sin condición.
- **Afinidad:** rasgos que la hacen más probable (`+`) o menos probable (`−`).
- **Efectos:** del catálogo (ESTADOS §7.1), con intensidad `baja`, `media` o `alta` cuando aplica.
- **Días:** duración en días de juego, siempre finita.
- **Contagio:** de 0 a 1 (ESTADOS §7.2). Solo las espontáneas se frenan con orden y satisfacción.
- **Zona:** `zona_destino` si la acción mueve a los participantes.

## 2. Acciones espontáneas (19)

Las elige el director de caos y cuentan contra los límites del caos (ESTADOS §9).

### Rarezas y trabajo

| Id | Texto base | Quién puede | Contexto | Afinidad | Efectos | Días | Contagio | Zona |
|---|---|---|---|---|---|---|---|---|
| `cavar_pozo` | {nombre} se obsesiona con cavar un pozo en el patio | Adulto, no policía | Siempre | rebeldía+, laboriosidad− | `fuera_de_puesto`, `anima` baja | 3-8 | 0,05 | |
| `abandonar_trabajo` | {nombre} deja su puesto sin avisar | Adulto con empleo, no policía | Siempre | laboriosidad−, rebeldía+ | `fuera_de_puesto` | 2-6 | 0,10 | |
| `ver_nubes` | {nombre} se pasa el día mirando las nubes | Adulto | Siempre | resiliencia+ | `decorativa` | 1-3 | 0,02 | |
| `coleccionar_piedras` | {nombre} empieza a coleccionar piedras raras | Adulto | Siempre | laboriosidad− | `decorativa` | 2-5 | 0,03 | |
| `hablar_con_gallinas` | {nombre} se pone a conversar con las gallinas | Adulto | Siempre | valentía+ | `decorativa`, `anima` baja | 2-4 | 0,03 | |
| `cantar_en_plaza` | {nombre} canta en la plaza y junta curiosos | Adulto | Siempre | resiliencia+ | `anima` baja (zona) | 1-3 | 0,10 | |

### Ánimo y palabra

| Id | Texto base | Quién puede | Contexto | Afinidad | Efectos | Días | Contagio | Zona |
|---|---|---|---|---|---|---|---|---|
| `predicar` | {nombre} predica en la esquina | Adulto | Siempre | rebeldía+ | `agita` baja | 2-6 | 0,30 | |
| `organizar_fiesta` | {nombre} organiza una fiesta en la plaza | Adulto | Siempre | resiliencia+, codicia− | `moviliza`, `anima` media (zona), `gasta` media | 1-3 | 0,25 | `centro` |
| `organizar_asamblea` | {nombre} convoca una asamblea vecinal | Adulto | Siempre | rebeldía+ | `moviliza`, `agita` baja, `anima` baja | 1-3 | 0,20 | `centro` |
| `rumor_alarmista` | {nombre} anda diciendo que se viene lo peor | Adulto | Siempre | valentía−, rebeldía+ | `difunde` (miedo) | 2-5 | 0,20 | |
| `rumor_esperanzador` | {nombre} cuenta que las cosas van a mejorar | Adulto | Siempre | resiliencia+ | `difunde` (esperanza) | 2-5 | 0,20 | |
| `sermon_apocaliptico` | {nombre} anuncia el fin de los tiempos | Adulto | Plaga zombie activa o anunciada | valentía−, rebeldía+ | `agita` media, `difunde` (miedo) | 2-5 | 0,30 | |
| `rezar_por_lluvia` | {nombre} reza por lluvia con otros vecinos | Adulto | Sequía activa | resiliencia+ | `decorativa`, `anima` baja (zona) | 1-4 | 0,20 | |

### Plata y comida

| Id | Texto base | Quién puede | Contexto | Afinidad | Efectos | Días | Contagio | Zona |
|---|---|---|---|---|---|---|---|---|
| `acaparar_comida` | {nombre} llena la despensa por si acaso | Adulto | Siempre | codicia+, valentía− | `acapara` media | 3-7 | 0,15 | |
| `ahorro_obsesivo` | {nombre} decide no gastar ni un peso de más | Adulto con dinero | Siempre | codicia+ | `ahorra` media | 3-8 | 0,10 | |
| `compras_compulsivas` | {nombre} sale a comprar de todo | Adulto con dinero | Siempre | codicia−, resiliencia− | `gasta` alta | 1-3 | 0,10 | |
| `compartir_comida` | {nombre} reparte comida con los vecinos | Adulto con despensa | Algún vecino con la despensa baja | valentía+, codicia− | `comparte` baja, `anima` baja | 2-5 | 0,10 | |

### Cuidado y defensa

| Id | Texto base | Quién puede | Contexto | Afinidad | Efectos | Días | Contagio | Zona |
|---|---|---|---|---|---|---|---|---|
| `cuidar_vecinos` | {nombre} cuida a los vecinos enfermos | Adulto | Algún vecino con la salud baja | laboriosidad+, valentía+ | `cuida` baja | 2-6 | 0,10 | |
| `reparar_barricada` | {nombre} se pone a reforzar las barricadas | Adulto | Plaga zombie activa y la integridad de su zona por debajo de 100 | laboriosidad+, valentía+ | `repara` media | 2-6 | 0,15 | |

## 3. Acciones de condición (3)

Las abre el motor cuando se cumple el disparador, y el director elige cómo se expresan entre las válidas (ESTADOS §7). No cuentan contra los límites del caos, no se frenan con orden y duran un tiempo finito.

| Id | Texto base | Disparador | Quién puede | Afinidad | Efectos | Días | Contagio | Zona |
|---|---|---|---|---|---|---|---|---|
| `huelga` | {nombre} deja su puesto y se une al paro | Impago que alcanza la nómina | Público | rebeldía+, resiliencia− | `fuera_de_puesto` | 3-10 | 0,20 | |
| `protesta` | {nombre} marcha al centro a reclamar | `descontentos_pct` sobre su umbral | Adulto | rebeldía+, resiliencia− | `moviliza`, `agita` media, `fuera_de_puesto` | 2-6 | 0,25 | `centro` |
| `saqueo` | {nombre} se lleva comida sin pagar | `hambre_critica_pct` sobre su umbral | Adulto con hambre | codicia+, valentía+, rebeldía+ | `toma` media, `moviliza`, `agita` baja, `fuera_de_puesto` | 2-5 | 0,20 | `centro` |

Fuera de la v1: `disturbios` (daño a la zona por una protesta sin orden) y `patrullar_vecinal` (ronda vecinal que suma a la policía). Vuelven si las corridas muestran que descuidar la seguridad no tiene consecuencias.

## 4. Cómo se cubre cada situación

Para comprobar que la base alcanza, estas son las situaciones del juego y qué acciones las expresan.

| Situación | Qué pasa | Acciones |
|---|---|---|
| Hambre y despensas vacías | La gente protesta, se pelea por comida o la reparte | `protesta`, `saqueo`, `compartir_comida`, `acaparar_comida` |
| Pánico o noticia alarmista | Se corre a comprar y el miedo contagia | `acaparar_comida`, `rumor_alarmista`, `sermon_apocaliptico` |
| Impago del estado | Paro de los empleados públicos | `huelga` |
| Impuestos altos o inflación | La gente gasta menos, y la empresa de comercio gana menos | `ahorro_obsesivo`, `protesta` |
| Buen momento | Se gasta y se festeja | `organizar_fiesta`, `compras_compulsivas`, `cantar_en_plaza` |
| Plaga zombie | Miedo, reparación y cuidado | `sermon_apocaliptico`, `reparar_barricada`, `cuidar_vecinos` |
| Sequía | Reclamo y rezos | `rezar_por_lluvia`, `acaparar_comida`, `rumor_alarmista` |
| Falta de orden | Ruido y agitación que se contagia | `predicar`, `organizar_asamblea` |
| Caos creativo sin causa | Rarezas que cuentan una historia | `cavar_pozo`, `ver_nubes`, `coleccionar_piedras`, `hablar_con_gallinas` |

## 5. Parámetros nuevos para CALIBRACION

- **Intensidades** (`baja`, `media`, `alta`) de `anima`, `agita`, `acapara`, `gasta`, `ahorra`, `comparte`, `difunde`, `repara`, `cuida` y `toma`.
- `max_pct_despensa_cedida` (por día).
- Tope diario de `toma` por intensidad.
- Umbral de "despensa baja" y de "salud baja" para los contextos de `compartir_comida` y `cuidar_vecinos`.
- Multiplicador de la propensión al gasto de `gasta` y de `ahorra`.

## 6. Qué falta

- Variantes de texto por acción y los textos de noticias (doc del director y la prensa).
- Animación de cada acción en la vista (UI §9). Al ser un conjunto cerrado, cada una tiene la suya.
- Acciones propias de cada escenario más allá de las de zombies que están acá.
- Qué efectos nuevos pide la economía cuando llegue la extensión `fiscal` (por ejemplo, reacciones a la inflación).