# Prueba de economía

Desde esta carpeta ejecutar `npm ci` y `npm test`. Usa PostgreSQL en memoria con PGlite; no se conecta a Supabase ni modifica datos reales. Reproduce la duplicación previa y verifica correcciones repetidas, reparación de saldos, pago de presupuesto/TV por división, ajustes, finales, permisos y protección de temporadas históricas.

La prueba de continuidad verifica la temporada 1 y las siguientes: conservación de saldos positivos, cero y deudas; TV según división; clubes nuevos y que vuelven; movimientos previos; prevención de pagos repetidos; y reinicio de etapa.

La prueba de valor único comprueba que se conserven los importes anteriores y permite editar el valor con permisos de DT/administrador, incluyendo cero. Rechaza importes negativos, ediciones sin permiso y cambios en temporadas cerradas.
