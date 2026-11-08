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

- Habilidades PES: mostrar una lista vertical con grupos y orden del editor (Técnica, Velocidad, Físico, Resistencia). Colorear atributos y medias con la misma escala fija: 0–74 negro, 75–79 verde, 80–89 amarillo, 90–94 naranja, 95–99 rojo. Mantener números visibles sobre superficies claras también en cabeceras oscuras y en temas de competencias. No cambiar datos ni medias al aplicar estos estilos.

- Los cuatro indicadores de cabecera de la ficha del jugador (Media, Goles, Asistencias y Atajadas/MVP) se muestran en dos columnas y dos filas, también en móvil. La lista vertical corresponde únicamente a las habilidades.

- Tarjetas PES 2013: ficha preparada con dos grupos (Estilos de juego/P y Habilidades especiales/S), códigos y nombres del editor. Solo mostrar tarjetas asignadas, ordenadas y sin duplicados. Campo players.pes2013_cards separado de stats: NULL = pendiente de cargar; arrays vacíos = sin tarjetas. La migración 20261108_pes13_cards.sql solo prepara el campo y valida P01–P18/S01–S26; NO importa ni asigna tarjetas. El CSV del usuario ya fue recibido y contrastado con IDs PES, nombres y club: 25 jugadores, 13 con tarjetas, 12 sin tarjetas y 42 asignaciones. La migración autocontenida 20261108_fulham_pes13_cards.sql prepara el campo y carga exactamente esos datos, cancelando ante identidades/equipos/estados cambiados o tarjetas existentes diferentes. Usa el CSV como fuente; no extrapolar el mapa incompleto de PES 2012. No afirmar que la carga fue ejecutada en Supabase hasta confirmación del usuario.

- En la ficha del jugador, mostrar el Valor destacado en la cabecera, debajo de la línea de posición/edad/equipo. No duplicarlo en el bloque Temporada. Mantener la información de cesión y la cabecera de indicadores 2×2.

- La sección de tarjetas se titula Habilidades especiales. Conservar los grupos Estilos de juego y Habilidades especiales, sin subtítulos en inglés. Traducir los nombres de las 44 tarjetas al español y conservar los códigos P/S dentro de sus recuadros; por ejemplo, P01 · Número 10 clásico. Los códigos guardados y la importación no cambian.
