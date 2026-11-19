# Instrucciones del proyecto UML

- Continuar la aplicación existente de https://github.com/MartinCarc/uml, publicada en https://uml-pes-navy.vercel.app/. Revisar el código antes de modificarlo y comprobar el funcionamiento después.
- UML es un manager de fútbol para una comunidad. Los partidos se simulan externamente en PES 6 o PES 13; la web administra competencias, resultados, estadísticas, planteles, transferencias y economía.
- Mantener HTML, CSS, JavaScript, Supabase y la estructura y cambios actuales del repositorio.
- Conservar colores, tipografías, tamaños, distribución, menús y estilo visual. Reutilizar componentes y estilos existentes. No rediseñar ni reconstruir desde cero.
- Modificar únicamente lo necesario para cada pedido. Explicar antes cualquier cambio visual importante.
- No borrar datos ni ejecutar `supabase/reset_v1.sql`. Si hace falta cambiar Supabase, preparar una migración que conserve los datos existentes.
- Usar la conversación con Claude solo como referencia: distinguir propuestas, decisiones confirmadas y funcionalidades realmente implementadas. No implementar propuestas pendientes sin pedido del usuario.
- El historial de Claude compartido en este chat corresponde a una etapa mucho anterior al repositorio actual. Sus listas de pendientes, orden de entrega e instrucciones de instalación no describen necesariamente el estado vigente; ante diferencias, contrastar con el código y las indicaciones actuales del usuario.
- La corrección para agregar clubes desde el administrador ya fue resuelta en otra PC con Codex y está en el repositorio. No tratarla como tarea pendiente por aparecer en el historial de Claude; revisar siempre el código actual.
- Dar explicaciones sencillas en español: el usuario no es programador. Informar qué cambió, cómo se verificó y si sigue pendiente publicar.
- El contexto anterior de n8n corresponde a otro proyecto y no define el alcance de UML.
- Los reinicios de juego deben permitir clubes, planteles y presupuestos nuevos conservando el historial de etapas anteriores. Archivar conserva datos; eliminar definitivamente una temporada en preparación o en curso requiere una confirmación explícita en la interfaz. No ejecutar estas acciones sobre datos reales como parte de las pruebas.

- Economía confirmada: el presupuesto inicial se entrega solo en la temporada 1 de cada etapa. El saldo final (también negativo o cero) se conserva para la siguiente temporada. La TV y los sponsors se pagan al comenzar cada temporada; el administrador configura los importes de sponsors, no inventarlos. Un club que ingresa después de la temporada 1 no recibe otro presupuesto inicial.

- Los jugadores tienen un único Valor: se define al crearlos y luego el DT de su equipo o el administrador pueden modificarlo. No mostrar un Precio pedido separado. Mercado, ficha y valor del plantel deben usar el mismo dato.

- Sponsors confirmados: cuatro niveles A-D, con condiciones distintas para Premier y Championship. A exige 15/12 goles de liga y 2/1 victorias de grupo en copa; B exige 5.º o mejor y cuartos; C exige top 4/promoción o ascenso y semis/cuartos; D exige campeón/ascenso y campeón/finalista de copa. Bonus 15/20/30/40 %, solo al cumplir ambos. Se aplica un único castigo, el mayor. Contratos antes del inicio, pago al inicio y liquidación al cierre, sin pagos retroactivos. La configuración posterior no modifica contratos pagados.
- Formato confirmado: 16 equipos (8 por división), liga ida y vuelta (14 partidos); UML Cup con cuatro grupos de cuatro, tres partidos por equipo, localías 2/1 permitidas, dos clasificados por grupo. Eliminatorias a partido único, tiempo extra y penales, en estadio neutral. Recaudación neutral al 50 % para cada club, con capacidad configurada por el administrador. No borrar fixtures existentes al actualizar.
- Página del equipo: mostrar sponsor vigente y estadio con nombre, capacidad y foto. Solo el administrador puede subir imágenes de sponsors/estadios. Usar Storage con permisos de administrador, no secretos en el navegador.

- Identidad visual de competencias autorizada: Premier azul, Championship rojo, UML Cup violeta, Supercup dorado y Promociones negro/plata, inspiradas en los logos del usuario. Mantener fuentes, tamaños, distribución y colores semánticos de advertencias/resultados. Las vistas generales conservan la identidad UML. No recrear ni recolorear los logos originales; se cargan desde Admin → Competencias.

- El nombre visible del editor táctico es Formación. Las fichas usan el color configurado del club, con letras blancas/negras según contraste. Conservar la ruta interna pizarra y las formaciones guardadas.

- Los clubes tienen color principal y secundario, configurables por el administrador. En Formación el principal es el fondo de la ficha y el secundario es el borde. El secundario predeterminado es blanco; la posición conserva contraste con el fondo.

- Las etiquetas de nombre bajo las fichas también usan fondo principal, borde secundario y texto según contraste del equipo, sin el azul UML.

- Formación incluye capitán, penales, tiros libres, córners de izquierda/derecha e indicaciones de hasta 4000 caracteres. Los responsables son titulares, pueden repetir funciones y son opcionales. Al quitar un titular se limpian sus funciones. Guardar junto con titulares/suplentes; simuladores y visitantes solo consultan. Conservar notas al guardar desde versiones anteriores del cliente.

- Juego confirmado: PES 2013. La fuente de habilidades será el option file o los archivos del parche del usuario. Identificar la plataforma y analizar esos archivos antes de definir el importador; conservar jugadores existentes y no reemplazar sus datos por una base histórica genérica de internet.

- Prueba PES 2013 Fulham: el EDIT.bin.backup correcto contiene los 25 jugadores en el mismo bloque de plantel. Se cotejaron los 23 atributos numéricos de Bernd Leno con la captura del editor. La migración 20261108_fulham_pes13_abilities.sql carga únicamente players.stats para los UUID existentes; no cambia media, valor, edad, posición ni estadísticas de partidos. Se cancela de forma atómica si cambió la identidad/equipo/estado o hay atributos diferentes ya cargados. Las tarjetas de estilo/habilidades especiales y otros campos aún no se importan. No considerar ejecutada en producción hasta que el usuario lo confirme.

- Habilidades PES: mostrar una lista vertical con grupos y orden del editor (Técnica, Velocidad, Físico, Resistencia). Colorear atributos y medias con la misma escala fija: 0–74 negro, 75–79 verde, 80–89 amarillo, 90–94 naranja, 95–99 rojo. Mantener números sobre superficies claras en habilidades y tablas; la media de cabecera se muestra sin placa blanca y con un contorno blanco fino en las cifras, conservando el color PES, también con temas de competencias. No cambiar datos ni medias al aplicar estos estilos.

- Los cuatro indicadores de cabecera de la ficha del jugador (Media, Goles, Asistencias y Atajadas/MVP) se muestran en dos columnas y dos filas, también en móvil. La lista vertical corresponde únicamente a las habilidades.

- Tarjetas PES 2013: ficha preparada con dos grupos (Estilos de juego/P y Habilidades especiales/S), códigos y nombres del editor. Solo mostrar tarjetas asignadas, ordenadas y sin duplicados. Campo players.pes2013_cards separado de stats: NULL = pendiente de cargar; arrays vacíos = sin tarjetas. La migración 20261108_pes13_cards.sql solo prepara el campo y valida P01–P18/S01–S26; NO importa ni asigna tarjetas. El CSV del usuario ya fue recibido y contrastado con IDs PES, nombres y club: 25 jugadores, 13 con tarjetas, 12 sin tarjetas y 42 asignaciones. La migración autocontenida 20261108_fulham_pes13_cards.sql prepara el campo y carga exactamente esos datos, cancelando ante identidades/equipos/estados cambiados o tarjetas existentes diferentes. Usa el CSV como fuente; no extrapolar el mapa incompleto de PES 2012. No afirmar que la carga fue ejecutada en Supabase hasta confirmación del usuario.

- En la ficha del jugador, mostrar el Valor destacado en la cabecera, debajo de la línea de posición/edad/equipo. No duplicarlo en el bloque Temporada. Mantener la información de cesión y la cabecera de indicadores 2×2.

- La sección de tarjetas se titula Tarjetas especiales. Conservar los grupos Estilos de juego y Habilidades especiales, sin subtítulos en inglés. Traducir los nombres de las 44 tarjetas al español y conservar los códigos P/S dentro de sus recuadros; por ejemplo, P01 · Número 10 clásico. Los códigos guardados y la importación no cambian.


## Option File — decisiones aprobadas e implementación

- El usuario autorizó implementar el conjunto con «Listo». No borrar automáticamente la temporada de prueba ni iniciar una nueva etapa como parte de la instalación o de las pruebas.
- Sección pública Option File, independiente de temporadas y planteles: buscador por nombre/apellido o ID, filtros por equipo del EDIT (también sin equipo), posición natural/alternativa, edad y media, paginación y ficha completa. Disponible para todos los roles y visitantes.
- Mostrar nombre, edad, nacionalidad, altura, peso, pie dominante, posición natural y alternativas, habilidades y tarjetas especiales en español. Añadir a la ficha principal forma física, precisión/frecuencia de pierna menos hábil, tolerancia a lesiones y actitud ofensiva/defensiva. Identificar como «ID:». No crear Datos adicionales del EDIT ni mostrar los campos técnicos descartados.
- La media es exclusivamente el cálculo principal de PES 2013 Editor 2.0 según la posición registrada. La fórmula fue extraída y contrastada estáticamente del editor facilitado (SHA-256 2401224ae19b699301e7fe625c6a0b37bbed5e43178e666837ea68b49ff19409). Havertz SS=83, Leno GK=76, Robinson LB=94. No mostrar el promedio entre paréntesis. Conservar valores del cálculo superiores a 99 cuando existan (Barella/Maradona=100 en este CSV); usar rojo desde 95 para la media. Atributos individuales siguen limitados a 0–99.
- Abreviaturas UML en toda la app: ARQ naranja; DFC/LD/LI azul; MCD/MC/MD/MI/MCO verde; SD/DC/ED/EI rojo. Mantener las fichas y etiquetas de nombre con colores del club en Formación; la abreviatura usa su distintivo claro de posición. SWP del EDIT se agrupa como DFC.
- Actualización exclusiva de administradores desde la app: validar CSV, preparar una versión privada por lotes, mostrar resumen/correcciones/diferencias y confirmar publicación atómica. Historial de versiones y SHA-256 para evitar duplicar la misma carga. La carga incompleta o fallida no modifica la versión vigente ni los planteles.
- Actualizar por ID del EDIT únicamente los datos deportivos de jugadores UML vinculados: nombre, edad, posición, media, habilidades, tarjetas y datos personales. Conservar UUID UML, club, cesiones, valor del DT, dorsal, transferencias, cola, dinero, resultados, sanciones, formación y retiros. No ejecutar RPC de mercado/economía al importar. Jugadores ausentes del nuevo CSV conservan sus datos UML y aparecen en revisión; nunca borrar/mover por el club que traiga el EDIT. Mostrar discrepancias de equipo y operaciones pendientes para revisión.
- Temporadas cerradas: conservar snapshots; no sustituir sus jugadores por datos actuales. Archivar una etapa permite volver a importar el mismo ID en una nueva etapa sin duplicarlo en la actual.
- Planteles iniciales en Admin → Jugadores o Clubes y DTs: mantener alta manual y ofrecer selección desde Option File, por club del EDIT o por jugadores, con revisión de valores y dorsales. Solo incorporar en temporada en preparación, respetando cupos y sin crear duplicados actuales por ID. Los jugadores manuales se vinculan explícitamente desde la ficha del catálogo; no asociarlos automáticamente por nombre.
- CSV inicial validado: 12.089 jugadores reales y 71 espacios del editor con ID 0 ignorados. El exportador añadió una columna vacía extra en la fila de R. Ivanov. Solo se normaliza ese patrón mecánico si después valida el registro completo; se avisa antes de confirmar. Se cotejaron sus 23 atributos, edad y altura con el EDIT original: no se inventaron valores. Otros registros inválidos se excluyen con aviso y los IDs repetidos bloquean el archivo.
- Migración nueva: supabase/migrations/20261109_option_file.sql. Es autocontenida para el campo de tarjetas y usa el esquema/archivo y migraciones existentes; no ejecutar reset ni reemplazar SQL anteriores. Pre-vincula únicamente los UUID/nombres/club del Fulham de prueba que ya se contrastaron con el EDIT/CSV, sin crear jugadores ni tocar su equipo o dinero. La publicación real y la primera carga siguen pendientes hasta que las haga el usuario.


## Subastas — decisiones confirmadas

- Subastas es una sección propia del menú principal, entre Mercado y Option File, con su enlace activo independiente. No mostrar una pestaña Subastas dentro de Mercado. Conservar el atajo administrativo.

- Implementación autorizada con «Listo». El gimnasio queda para más adelante; el EDIT vigente y la temporada son de prueba y no se borran como parte de este trabajo.
- Subastas públicas: cualquier visitante consulta jugador, clubes/DTs, importes, horarios e historial. Solo el DT asignado puja por su propio club; ser administrador no sustituye esa asignación.
- El administrador elige un jugador disponible del Option File vigente; admite un agente libre ya vinculado conservando su UUID. Impedir duplicar un jugador UML, una incorporación pendiente o un lote abierto. Jugadores manuales coincidentes se vinculan explícitamente antes de subastar.
- Configurar precio inicial, incremento mínimo, inicio y cierre. Las condiciones se bloquean al recibir la primera puja. No sustituir el jugador al editar. Cancelación administrativa con motivo obligatorio e historial; no revertir una adjudicación ya cobrada.
- Primera oferta al menos el precio inicial; siguientes al menos la oferta líder más el incremento. Pujas vinculantes, sin retirada. Cada puja válida en los últimos cinco minutos fija el cierre cinco minutos después de esa puja, tantas veces como ocurra.
- La oferta líder reserva dinero y un cupo contra otras subastas, acuerdos y altas. Superarla libera la reserva anterior. Subir la propia oferta reutiliza su reserva, sin duplicarla.
- Cierre automático en el servidor mediante Supabase Cron, incluso sin navegadores abiertos. Rechazar pujas a la hora exacta del vencimiento; el proceso automático adjudica en el siguiente ciclo de un minuto. No habilitar publicación o nuevas pujas sin tarea configurada.
- Al adjudicar: debitar inmediatamente al ganador y acreditar UML Bank, con un asiento por lado y sin duplicados, sin importar si el mercado está abierto o cerrado. Precio ganador = valor inicial del jugador, luego editable por el DT.
- Mercado abierto: incorporación inmediata. Mercado cerrado: incorporación ya pagada en lista de espera; abrir el mercado entrega al jugador sin segundo cobro. Sin ofertas: ningún pago ni jugador UML nuevo. Una cancelación libera reservas y conserva el historial.
- Mantener el ID del EDIT; actualizar el CSV solo sincroniza datos deportivos y no ejecuta pagos/transferencias ni altera adjudicaciones. No cerrar/borrar una temporada con lotes abiertos o entregas ya pagadas pendientes.
- Instalar como consultas nuevas, en orden: 20261118_auctions.sql y 20261118_auctions_scheduler.sql. La tarea es uml-auctions-close. No reemplazar SQL anteriores ni ejecutar reset. La configuración real del cron y la publicación quedan pendientes de instalación por el usuario.


## Fotos de jugadores

- Foto de cara por enlace directo HTTP/HTTPS, editable por administradores desde la ficha UML y la ficha Option File. Mostrar la misma foto junto al nombre en listas de planteles, rankings, partidos, Formación, mercado/negociaciones, administración, subastas y catálogo. Mantener tamaños de texto, colores y posiciones tácticas; miniaturas pequeñas en listas y cabecera grande.
- Sin imagen o con enlace roto: inicial del jugador, sin icono de imagen fallida. Vista previa, reemplazo y eliminación dejando vacío el enlace. No subir archivos ni guardar secretos.
- Reutilizar players.photo_url para jugadores UML. player_portraits guarda la imagen por ID PES de forma independiente del CSV y del club; también permite cargar fotos del catálogo antes de incorporar al jugador. Los jugadores manuales sin ID usan su UUID. Heredar la foto al importar/vincular posteriormente; conservarla al transferir o actualizar habilidades. Las fotos actuales se conservan al instalar. No modificar snapshots históricos, economía, valor, planteles, contratos ni operaciones para editar una foto.
- Componentes comunes en js/player-photos.js. Incluir el script en index.html y usar U.playerFace / U.playerLabel en vistas con jugadores; no insertar HTML en options nativos, atributos, prompts ni descripciones históricas de movimientos. Los controles nativos conservan sus nombres de texto.
- Aplicar 20261118_player_photos.sql como consulta nueva después de Option File. Lectura pública; cambios por RPC de administrador y sincronización de players.photo_url mediante trigger. No volver a ejecutar migraciones anteriores ni resets.

- Al editar una foto, comprobar que el navegador cargue y decodifique la imagen antes de permitir Guardar. Mostrar estado de comprobación, éxito o error; ante 403, 404, contenido no gráfico o diez segundos sin respuesta, mantener la foto guardada y pedir otro enlace. Cancelar resultados de solicitudes anteriores si cambia el campo. Permitir eliminar dejando vacío y reintentar tras errores de persistencia. No confundir un enlace guardado con una imagen accesible ni intentar evadir bloqueos del proveedor.

- Posiciones: distintivos con fondo naranja (ARQ), azul (DFC/LD/LI), verde (mediocampistas), rojo (delanteros) y abreviaturas blancas en toda la app. Mantener los mismos tamaños y las fichas exteriores de Formación con los colores del club. Los selectores nativos conservan su texto de posición coloreado.
- Media en cabeceras de ficha UML y Option File: quitar el fondo/recuadro blanco, mantener el color numérico según la escala PES y usar un contorno blanco sutil en las cifras. No cambiar datos, tamaños ni los indicadores 2×2. Las habilidades y medias de tablas conservan sus recuadros claros.
