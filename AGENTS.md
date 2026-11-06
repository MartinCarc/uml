# Instrucciones del proyecto UML

- Continuar la aplicación existente de https://github.com/MartinCarc/uml, publicada en https://uml-pes-navy.vercel.app/. Revisar el código antes de modificarlo y comprobar el funcionamiento después.
- UML es un manager de fútbol para una comunidad. Los partidos se simulan externamente en PES 6 o PES 13; la web administra competencias, resultados, estadísticas, planteles, transferencias y economía.
- Mantener HTML, CSS, JavaScript, Supabase y la estructura y cambios actuales del repositorio.
- Conservar colores, tipografías, tamaños, distribución, menús y estilo visual. Reutilizar componentes y estilos existentes. No rediseñar ni reconstruir desde cero.
- Modificar únicamente lo necesario para cada pedido. Explicar antes cualquier cambio visual importante.
- No borrar datos ni ejecutar `supabase/reset_v1.sql`. Si hace falta cambiar Supabase, preparar una migración que conserve los datos existentes.
- Usar la conversación con Claude solo como referencia: distinguir propuestas, decisiones confirmadas y funcionalidades realmente implementadas. No implementar propuestas pendientes sin pedido del usuario.
- Dar explicaciones sencillas en español: el usuario no es programador. Informar qué cambió, cómo se verificó y si sigue pendiente publicar.
- El contexto anterior de n8n corresponde a otro proyecto y no define el alcance de UML.
- Los reinicios de juego deben permitir clubes, planteles y presupuestos nuevos conservando el historial de etapas anteriores. Archivar conserva datos; eliminar definitivamente una temporada en preparación o en curso requiere una confirmación explícita en la interfaz. No ejecutar estas acciones sobre datos reales como parte de las pruebas.
