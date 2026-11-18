# Prueba de economía

Desde esta carpeta ejecutar `npm ci` y `npm test`. Usa PostgreSQL en memoria con PGlite; no se conecta a Supabase ni modifica datos reales. Reproduce la duplicación previa y verifica correcciones repetidas, reparación de saldos, pago de presupuesto/TV por división, ajustes, finales, permisos y protección de temporadas históricas.

La prueba de continuidad verifica la temporada 1 y las siguientes: conservación de saldos positivos, cero y deudas; TV según división; clubes nuevos y que vuelven; movimientos previos; prevención de pagos repetidos; y reinicio de etapa.

La prueba de valor único comprueba que se conserven los importes anteriores y permite editar el valor con permisos de DT/administrador, incluyendo cero. Rechaza importes negativos, ediciones sin permiso y cambios en temporadas cerradas.


Sponsors y copa: `npm test` también cubre contratos por división, pagos, cierre, castigos y cancelaciones; cuatro grupos/24 partidos, clasificación, eliminatorias, penales y entradas neutrales 50/50. Se usa un esquema Storage mínimo en memoria para comprobar permisos sin acceder a Supabase.

Para la interfaz: `python sponsors-browser.py` desde esta carpeta. Requiere Python con Playwright y Chromium (o Playwright Chromium instalado); se puede indicar el ejecutable con `UML_CHROMIUM`. El navegador utiliza un Supabase simulado, sin conexiones a producción. Verifica elección, permisos, cargas de imágenes, diseño móvil, tablas de grupos y penales.

`python competition-theme-browser.py` comprueba cinco paletas, contraste de los colores principales, cambios de competencia, partidos/rankings, restauración del tema UML, carga del logo, imagen sin recortar, fallback y ausencia de desbordamiento en celular. Usa datos simulados y no los logos originales del usuario.

`node formation-instructions.mjs` comprueba persistencia, permisos, responsables titulares, texto, compatibilidad y temporadas cerradas. `python formation-browser.py` comprueba el editor, el guardado conjunto, la limpieza de funciones al quitar jugadores, retención tras un error, texto seguro, consulta del simulador y diseño móvil.


`node auctions.mjs` verifica subastas públicas con PostgreSQL local: roles, reservas de saldo/cupo, puja propia y superada, incremento, vencimiento, prórrogas, cancelación, no ofertas, adjudicación club→UML Bank exactamente una vez, entrega posterior sin segundo cobro, reutilización del UUID, protección frente a fichajes paralelos e intercambios ordinarios con cupos reservados. Cron no existe en PGlite: se simula solo su tabla de configuración y se invoca el proceso real de cierre explícitamente. La ejecución programada real queda pendiente de instalar/verificar en Supabase.

`python auctions-browser.py` prueba navegación Mercado/Subastas, selector Option File y condiciones del administrador, horarios de Argentina, permisos del DT, pujas/historial públicos, conservación del importe escrito durante las actualizaciones, estado de incorporación pagada, cancelación, advertencia de Cron y ancho móvil. Usa respuestas simuladas, sin producción. `npm run test:browser` ejecuta todas las pruebas de navegador.
