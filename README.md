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

Quedan para las próximas etapas: subastas y sorteos, sponsors, pizarra táctica, subida de imágenes (escudos, caras, avatares), muro, comunicados y encuestas, salón de la fama, webhook de Discord, exportación a Excel, fase de grupos en la copa, banco (préstamos) y stats del option file.

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

El plantel muestra por separado **Valor** (la referencia cargada por el administrador) y **Precio pedido** (lo que fija el DT). Un precio pedido vacío no significa que se haya perdido el valor del jugador.


### Continuidad del saldo entre temporadas

Aplicar `supabase/migrations/20261107_season_balance_continuity.sql` después de las migraciones anteriores. Actualiza el inicio de futuras temporadas y no cambia créditos ni saldos ya registrados.

- Solo la **temporada 1 de la etapa** recibe el presupuesto inicial. Los clubes incorporados en temporadas posteriores no reciben ese pago.
- Cada equipo conserva su último saldo final de la misma etapa, incluidos cero y deudas. Se registra en el nuevo libro como **Saldo de la temporada anterior**; el libro anterior se conserva intacto. Si el club no participó en la temporada inmediatamente anterior, se toma su última participación cerrada.
- La TV se acredita al comenzar **cada temporada**, según la división actual del club. Los movimientos ya registrados durante la preparación se conservan.
- Primero se debe cerrar la temporada en curso. El inicio queda protegido contra la repetición del pago.
- **Sponsors:** la regla confirmada es pagar al comienzo de cada temporada. La gestión y los pagos automáticos de sponsors siguen pendientes; esta actualización no inventa contratos ni importes.
- **Iniciar nueva etapa** mantiene la separación de historiales y permite un nuevo presupuesto inicial en la primera temporada de esa etapa.
