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
