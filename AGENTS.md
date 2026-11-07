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

- Economía confirmada: el presupuesto inicial se entrega solo en la temporada 1 de cada etapa. El saldo final (también negativo o cero) se conserva para la siguiente temporada. La TV y los sponsors se pagan al comenzar cada temporada; sponsors sigue pendiente de implementación, no inventar importes ni pagos. Un club que ingresa después de la temporada 1 no recibe otro presupuesto inicial.
