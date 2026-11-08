# ⚽ UML — UEFA Manager League · web de la comunidad

Web para una liga de PES donde los partidos se juegan en la consola y acá se registra todo lo demás: temporadas con liga, copa y supercopa, tabla, fixture, página de cada partido con goles, asistencias, tarjetas, lesiones, MVP y atajada, sanciones automáticas, planteles, mercado de pases con negociación, gimnasio, economía (entradas, TV) y UML Bank.

**Costo: $0.** Supabase (base de datos + usuarios, plan gratuito) + Vercel (hosting, plan gratuito).

---

## Novedades de esta versión (etapa 1)

- Estética nueva con los colores del escudo (modo claro, azul y blanco), menú deslizable en el celular e instalable como app.
- **Temporadas** con una liga o dos divisiones (UML Premier + UML Championship) con ascenso, descenso y promoción, **UML Cup** por eliminación directa y **UML Supercup**.
- **Página de partido** completa: goles con asistencia, tarjetas, lesiones, MVP, atajada del partido y link a Discord con las capturas.
- **Rol Simulador**: carga solo los partidos que el admin le asigna.
- **Sanciones automáticas**: roja directa 2, doble amarilla 1, cada 3 amarillas 1 (por competencia); lesión leve 2, grave 4 (en todas las competencias). El admin puede levantar o agregar sanciones.
- **Mercado nuevo**: ofertas en paquete (jugadores + dinero en ambos sentidos), contraoferta, cesiones, transferibles y cedibles con precio del DT, agentes libres gratis, liberar gratis, tope de 32 jugadores. **Mercado abierto/cerrado** por el admin con lista de espera: lo acordado con el mercado cerrado se ejecuta al abrirlo.
- **Economía**: presupuesto inicial y TV (pago único) por división, entradas por capacidad real del estadio × precio único × posición en la tabla × tipo de partido, libro de caja público por club, multa de fair play al cierre.
- **Gimnasio** (sub-24, 3 o 2 entrenamientos por temporada, 15 M al UML Bank, +1 de media).
- **Cierre de temporada**: multa de fair play, vuelven las cesiones, +1 año, retiro a los 41, y la temporada siguiente se propone con los ascendidos y descendidos.
- **Auditoría**: toda acción del staff queda registrada.

Quedan para las próximas etapas: subastas y sorteos, subida de imágenes de escudos/caras/avatares, muro, comunicados y encuestas, salón de la fama, webhook de Discord, exportación a Excel, banco (préstamos) y stats del option file. Sponsors, pizarra y grupos de UML Cup están incorporados mediante las migraciones indicadas abajo.

---

## Archivos

```
liga-pes/
├── index.html, styles.css, manifest.json   ← la página
├── assets/logo.png                          ← escudo UML
├── js/core.js, pages.js, market.js, admin.js, app.js
├── config.js                                ← ⚠️ tus claves de Supabase
└── supabase/
    ├── schema_v2.sql                        ← base de datos (correr una vez en Supabase)
    ├── reset_v1.sql                         ← SOLO si tenías la versión 1 instalada
    └── _v1_schema_viejo.sql                 ← referencia, no usar
```

---

## Instalación desde cero (15 minutos)

### 1 — Base de datos en Supabase
1. <https://supabase.com> → cuenta gratuita → **New project** (región São Paulo).
2. **SQL Editor** → **New query** → pegá todo `supabase/schema_v2.sql` → **Run**. Tiene que decir *Success*.
3. **Project Settings** (engranaje) → **API** → copiá **Project URL** y **anon public** key.

### 2 — Configurar la web
Abrí `config.js` y completá `SUPABASE_URL` y `SUPABASE_ANON_KEY`. Podés cambiar `LEAGUE_NAME` y `LEAGUE_FULL_NAME`.

### 3 — Publicar en Vercel
<https://vercel.com> → **Add New → Project** → subí la carpeta `liga-pes` (o importala desde GitHub) → Deploy → te da un link tipo `https://uml-liga.vercel.app`.

### 4 — Hacerte administrador
Registrate en la web, después en Supabase → SQL Editor:
```sql
update public.profiles set is_admin = true where username = 'TU_USUARIO';
```
Recargá la web: aparece la etiqueta **admin**.

### 5 (opcional) — Registro sin confirmar email
Supabase → Authentication → Providers → Email → desactivá "Confirm email".

---

## Si ya tenías la versión 1 instalada

1. Supabase → SQL Editor → corré `supabase/reset_v1.sql` (borra la liga de prueba; los usuarios registrados se conservan y siguen siendo admin).
2. Después corré `supabase/schema_v2.sql`.
3. En Vercel reemplazá **todos** los archivos por los de esta carpeta (si usás GitHub, subí la carpeta completa; borrá el `app.js` viejo de la raíz).
4. `config.js` nuevo: volvé a pegar tus claves.

---

## Cómo se usa (flujo de una temporada)

### Archivar clubes, iniciar otra etapa o eliminar una temporada

Para habilitar estas funciones sobre una base existente, ejecutar primero **únicamente** `supabase/migrations/20261106_club_archive_and_new_game.sql` en Supabase → SQL Editor. Esta migración conserva los datos y no ejecuta ningún reinicio ni eliminación. No usar `reset_v1.sql` ni volver a ejecutar el esquema completo.

- **Administrar clubes → Archivar**: oculta un club de las nuevas temporadas, conservando su historial. Solo se permite si no participa en temporadas pendientes. **Archivados → Restaurar** lo vuelve a habilitar.
- **Eliminar club**: solo admite clubes sin datos asociados; con historial o jugadores, se debe archivar.
- **Administrar clubes → Iniciar nueva etapa**: requiere escribir `NUEVA ETAPA`. Primero hay que cerrar o eliminar las temporadas pendientes. Archiva todos los clubes y jugadores, incluidos los agentes libres, y conserva las temporadas cerradas para consulta. Se pueden cargar clubes y planteles nuevos o restaurar fichas de clubes anteriores sin reactivar sus jugadores archivados. La primera temporada de la nueva etapa recibe el presupuesto inicial; las siguientes conservan el saldo final sin repetir ese pago. El banco general conserva su saldo.
- **Admin → Temporada → Eliminar temporada**: disponible en preparación o en curso. Requiere escribir `ELIMINAR ` seguido del nombre exacto. Borra definitivamente sus competencias, resultados, eventos, sanciones, ofertas, entrenamientos y movimientos. Conserva los clubes, los jugadores y las otras temporadas; no revierte transferencias ni cambios de edad o media ya aplicados. Recalcula el saldo del banco a partir del libro de movimientos restante. Las temporadas cerradas no se eliminan desde esta opción.
- Al cerrar una temporada se conserva una copia de los clubes y jugadores antes del incremento de edad y devolución de cesiones. Para temporadas cerradas antes de instalar la migración, solo se puede conservar el estado disponible al instalarla: no se pueden reconstruir datos que la versión anterior ya sobrescribió.

1. **Inicio → Administrar clubes** (también disponible en tu propio perfil de administrador): creá los clubes (nombre, estadio y capacidad real, color, escudo por URL), incluso antes de tener temporadas. Son permanentes, se reutilizan cada temporada. Dentro de una temporada, sigue disponible **Admin → Clubes y DTs**.
2. **Inicio → + Nueva temporada**: elegís una liga o dos divisiones, marcás qué clubes van en cada una, configurás la copa y la economía. Si hay una temporada anterior cerrada, la web propone las divisiones con ascensos y descensos.
3. **Admin → Clubes y DTs**: asignale DT a cada club. **Admin → Jugadores**: cargá planteles (uno por uno o pegando una lista `Nombre, POS, Edad, Media, Valor, Dorsal`).
4. **Admin → Temporada → Iniciar temporada**: acredita el presupuesto inicial solo en la primera temporada de la etapa; en las siguientes conserva el saldo final del club. Acredita TV en cada temporada según su división actual. **Admin → Competencias**: generá el fixture de cada liga y sorteá la primera ronda de la copa.
5. **Admin → Usuarios**: marcá quiénes son **simuladores**. **Admin → Partidos**: asignales partidos (uno por uno o toda la fecha). Cada simulador ve "Mis partidos" y carga resultado, goles, asistencias, tarjetas, lesiones, MVP, atajada y link a Discord. Las entradas se acreditan al cargar el resultado. "Cerrar" un partido impide que el simulador lo siga editando.
6. **Admin → Temporada → Cerrar/Abrir mercado**: con el mercado cerrado, los DTs igual negocian y acuerdan; todo se ejecuta cuando lo abrís (mitad de temporada, inicio de la siguiente).
7. Los DTs usan **Mi equipo** (precio, dorsal, transferible, cedible, liberar, gimnasio, libro de caja) y **Mercado** (ofertas, contraofertas, cesiones, agentes libres). Para ofertar por un jugador que no está en lista, entran al equipo rival y tocan "Ofertar".
8. Cuando terminan los partidos: **Finalizar liga** (define campeón), la copa hasta la final, **Armar Supercopa**, **Crear promoción** y resolverla, y por último **Cerrar temporada**.

**Sanciones**: se calculan solas y aparecen en Estadísticas → Suspendidos y lesionados, en los planteles y en la página del partido (los jugadores suspendidos aparecen atenuados para que el simulador no los use). El admin las corrige desde Admin → Sanciones.

**Rol simulador** puede ser cualquier DT o admin; si simula un partido de su propio equipo, la página del partido lo muestra ("autorizado por admin").

---

## Valores por defecto (editables en Admin → Temporada)

| Concepto | Valor |
|---|---|
| Presupuesto inicial | 200 M Premier · 150 M Championship |
| TV (pago único al iniciar) | 60 M Premier · 40 M Championship |
| Entrada | $ 50 × capacidad × ocupación × multiplicador |
| Ocupación por posición | 1°-4° 100 % · 5°-8° 85 % · mitad superior 70 % · mitad inferior 55 % · descenso 40 % |
| Multiplicadores | liga 1,0 · clásico 1,25 · copa inicial 1,0 · cuartos 1,15 · semis 1,30 · promoción 1,30 · final 1,50 (100 % fijo) |
| Fair play | amarilla 1 pt · roja 3 pts · multa 10 M al cierre |
| Gimnasio | 15 M · sub-24 · 3 (15-20) o 2 (21-24) por temporada · +1 de media |
| Plantel | tope 32 · retiro a los 41 |

---

## Límites del plan gratuito

Supabase Free: 500 MB de base, 1 GB de archivos, proyecto pausado tras 7 días sin uso (se reactiva con un clic, sin perder datos). Vercel Hobby: 100 GB/mes de transferencia. Confirmar en sus páginas de precios.

## Problemas frecuentes

- **"Falta configurar la conexión"** → `config.js` sigue con los valores de ejemplo.
- **"new row violates row-level security policy"** → tu usuario no es admin (paso 4).
- **No veo "Mi equipo"** → el admin tiene que asignarte un club en Admin → Clubes y DTs.
- **No veo "Mis partidos"** → el admin tiene que marcarte como simulador en Admin → Usuarios.
- **Un simulador no puede cargar un partido** → no está asignado a ese partido, o el admin lo cerró.

## Pizarra táctica vertical

Para habilitarla en la base existente, ejecutar **una vez** el contenido de `supabase/migrations/20261107_tactics.sql` en Supabase → SQL Editor → Run. Este archivo agrega el guardado de la pizarra y conserva los datos. Requiere la migración anterior de archivado/nueva etapa. No ejecutar el esquema completo ni `reset_v1.sql`.

- Primero crear una temporada **en preparación**, agregar los equipos y cargar sus planteles. No hace falta iniciar la temporada ni generar partidos para probar la pizarra.
- El DT asignado al club entra desde **Mi equipo → Pizarra táctica**. El administrador puede entrar desde **Equipos → equipo → Ver y editar pizarra**.
- Elegir jugador y posición, agregarlo y arrastrar su ficha con mouse o dedo. También se puede enfocar una ficha y moverla con las flechas del teclado. La posición elegida aparece dentro del círculo y el nombre debajo. La posición de la ficha no cambia la posición original del jugador en su perfil.
- Se permiten hasta once jugadores distintos. Se puede guardar una formación incompleta mientras se arma. Quitar una ficha no elimina al jugador del plantel.
- Pulsar **Guardar pizarra** para publicar. El simulador accede desde **Partido → Pizarras de los equipos**. Al entrar se consulta la última formación guardada. La pizarra es la actual del equipo en esa temporada: no se guarda una copia por partido.
- Las sanciones se muestran en la lista; el simulador debe comprobar su alcance por competencia en la página del partido. Si un jugador ya no pertenece al plantel, el DT debe quitar su ficha antes de volver a guardar.
- Solo el DT del club y los administradores pueden guardar. Las temporadas cerradas son de solo lectura.
- Publicar los archivos web actualizados en Vercel además de aplicar la migración en Supabase.


### Banco de suplentes

Después de la migración de la pizarra, ejecutar `supabase/migrations/20261107_tactics_bench.sql` en Supabase → SQL Editor → Run. Conserva las formaciones guardadas y agrega el banco de suplentes.

En la columna junto al campo aparece **Banco de suplentes** (debajo del campo en celular). El DT o administrador puede elegir hasta **12 jugadores distintos**, sin repetir titulares, y quitar jugadores del banco para volver a seleccionarlos como titulares. **Guardar pizarra** publica titulares y suplentes juntos. El simulador ve ambos desde los mismos enlaces de la pizarra; las temporadas cerradas permanecen de solo lectura. Se permite guardar un banco incompleto.


### Corrección de entradas y visualización de valores

Aplicar `supabase/migrations/20261107_ticket_income_fix.sql` una vez en SQL Editor. Corrige el cálculo al editar resultados y ajusta los saldos de equipos con ingresos por entradas de temporadas abiertas a la suma de sus movimientos registrados (incluye presupuestos, TV, transferencias y ajustes). Conserva los movimientos, los partidos y los jugadores; excluye temporadas cerradas e históricas. No inicia la temporada ni acredita presupuesto/TV pendientes.

Crear una temporada la deja **en preparación**. Para acreditar los ingresos de inicio, entrar en **Admin → Temporada → Iniciar temporada**. En la primera temporada son 200 M + 60 M para Premier y 150 M + 40 M para Championship, según la configuración. En las siguientes se conserva el saldo anterior y se suma la TV, sin repetir el presupuesto inicial. No recrear la temporada ni repetir créditos mediante ajustes manuales.

El plantel muestra un único **Valor**, cargado al crear al jugador y editable después por su DT o el administrador (ver migración de valor único).


### Continuidad del saldo entre temporadas

Aplicar `supabase/migrations/20261107_season_balance_continuity.sql` después de las migraciones anteriores. Actualiza el inicio de futuras temporadas y no cambia créditos ni saldos ya registrados.

- Solo la **temporada 1 de la etapa** recibe el presupuesto inicial. Los clubes incorporados en temporadas posteriores no reciben ese pago.
- Cada equipo conserva su último saldo final de la misma etapa, incluidos cero y deudas. Se registra en el nuevo libro como **Saldo de la temporada anterior**; el libro anterior se conserva intacto. Si el club no participó en la temporada inmediatamente anterior, se toma su última participación cerrada.
- La TV se acredita al comenzar **cada temporada**, según la división actual del club. Los movimientos ya registrados durante la preparación se conservan.
- Primero se debe cerrar la temporada en curso. El inicio queda protegido contra la repetición del pago.
- **Sponsors:** se pagan al comienzo de cada temporada y se liquidan al cierre; requieren configurar el catálogo y elegir el contrato antes del inicio (ver sección de sponsors).
- **Iniciar nueva etapa** mantiene la separación de historiales y permite un nuevo presupuesto inicial en la primera temporada de esa etapa.


### Valor único del jugador

Ejecutar `supabase/migrations/20261107_unified_player_value.sql`. El importe cargado al crear al jugador es su valor inicial; luego el DT puede cambiarlo desde **Mi equipo → Editar → Valor**. El administrador también puede editarlo. Plantel, ficha, mercado y total del plantel utilizan ese mismo valor; desaparece el campo separado de precio pedido. Cambiar el valor no mueve dinero del equipo: el importe de cada transferencia se negocia en su oferta.

Si un DT ya había cargado un precio pedido, la migración lo conserva como el valor actual. Si no, mantiene el valor de creación. Los jugadores archivados y las copias históricas no se modifican. Aplicar la consulta y publicar los archivos web juntos. El RPC conserva el nombre interno de su parámetro anterior por compatibilidad.


## Sponsors, estadio y UML Cup con grupos

### Actualización de una base existente

Luego de las migraciones anteriores, ejecutar como consultas nuevas en Supabase SQL Editor, en este orden:

1. `supabase/migrations/20261108_cup_groups.sql`
2. `supabase/migrations/20261108_sponsors_and_stadium.sql`
3. `supabase/migrations/20261108_neutral_gate.sql`
4. `supabase/migrations/20261108_media_uploads.sql`

Publicar también los archivos web del paquete, incluido **js/sponsors.js** y el **index.html** actualizado. No ejecutar `reset_v1.sql` ni volver a ejecutar el esquema completo. No se borran equipos, jugadores, partidos ni movimientos. Las temporadas ya iniciadas no reciben sponsors retroactivos; se eligen en una temporada en preparación. Los fixtures existentes se conservan y no se convierten automáticamente.

### Configurar y elegir sponsors

**Admin → Sponsors:** completar nombre, imagen y pago de Premier/Championship de cada nivel A-D. Los cuatro niveles se crean deshabilitados, sin importes inventados. Se puede habilitar una división dejando pendiente el importe de la otra. Admiten imágenes PNG/JPG/WebP de hasta 5 MB, subidas por administrador, o un enlace. Después marcar **Disponible para elegir** y guardar.

**Mi equipo → Sponsor y estadio** (o **Equipos → equipo**): el DT o administrador elige un contrato y puede comparar las condiciones. Antes del inicio puede cambiarlo o quitarlo. Al iniciar, se toman la división y los importes vigentes y quedan fijos el nombre, imagen, importe y reglas. Luego se acredita una sola vez. Cambiar el catálogo no altera contratos iniciados. Un equipo sin sponsor puede jugar pero no recibe ese ingreso.

| Nivel | Principal Premier / Championship | Copa Premier / Championship | Bonus |
|---|---|---|---|
| A | 15 / 12 goles de liga | 2 / 1 victorias en grupos | 15 % |
| B | 5.º o mejor / 5.º o mejor | Cuartos / cuartos | 20 % |
| C | Primeros 4 / ascenso directo o clasificación a promoción | Semifinales / cuartos | 30 % |
| D | Campeón / ascenso directo o ganado en promoción | Campeón / finalista | 40 % |

Solo hay bonus si se cumplen ambos objetivos. Cumplir únicamente el principal conserva el pago completo; la copa no compensa incumplir el principal. Devoluciones (porcentajes del pago inicial):

- A: 10 % en ambas divisiones.
- B Premier: 20 %; 30 % si queda en promoción y se salva; 40 % por descenso. B Championship: con ocho clubes, incumplir top 5 implica últimos tres y la devolución efectiva es 30 %.
- C Premier: 35 %; 45 % en promoción sin descenso; 55 % por descenso. C Championship: 35 %, o 45 % entre los últimos tres.
- D Premier: 50 %; 60 % en promoción sin descenso; 70 % por descenso. D Championship: 50 %, o 60 % entre los últimos tres.

Se aplica únicamente el castigo mayor, incluyendo el descenso mediante promoción. En C Championship alcanza con clasificar a la promoción; en D debe lograr el ascenso. La devolución puede dejar saldo negativo. Al cerrar la temporada se registran bonus y devoluciones en el libro de caja, se guarda la evaluación y no se vuelven a cobrar. Los resultados que sustentan contratos liquidados quedan de solo lectura. Primero hay que finalizar liga/copa/promoción y resolver partidos pendientes; si hay promoción configurada, debe crearse y resolverse.

**Anular competencia**, disponible para el administrador con confirmación, conserva los partidos y anula su condición del sponsor. Una condición anulada no genera premio ni castigo; tampoco se concede un bonus por cumplir un único objetivo. La pantalla del equipo muestra progreso y evaluación final.

### Foto y datos del estadio

En la página del equipo se muestran foto, nombre y capacidad. El administrador puede entrar en **Editar estadio** o **Administrar clubes → Editar** para cambiar los datos y subir la foto. Las imágenes se guardan en el bucket público `uml-media`, con escritura exclusiva de administradores. El historial conserva las copias de clubes de temporadas cerradas.

### UML Cup

Para nuevas temporadas con copa se requieren 16 equipos. **Admin → Competencias → Sortear 4 grupos** genera 24 partidos: cada grupo tiene seis encuentros, cada club juega tres y recibe una o dos localías. La página del fixture muestra cuatro tablas y sus calendarios. Desempates: puntos, diferencia de gol, goles a favor y nombre del club, coherente con el criterio de liga existente.

Antes de generar cuartos, completar la **capacidad del estadio neutral** en la copa. Los dos primeros de cada grupo clasifican; cruces A1-B2, C1-D2, B1-A2 y D1-C2. Las siguientes rondas se sortean entre los ganadores. Cuartos, semifinales y final son a partido único y en estadio neutral. Se registra el marcador final después del tiempo extra; si sigue empatado, se cargan penales obligatorios. En grupos se admiten empates sin penales. No se puede cambiar un marcador que ya definió clasificados de una fase posterior.

Las entradas de las eliminatorias se calculan con capacidad neutral × precio de entrada × multiplicador de la fase, con ocupación completa. La recaudación total se divide por mitades. La capacidad queda fija al generar eliminatorias. Corregir un resultado reemplaza los ingresos anteriores sin duplicarlos. Las copas previas con partidos conservan su formato.
