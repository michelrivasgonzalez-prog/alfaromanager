# Activación final de Push — AlFaroCafé Manager

Estado del trabajo:
- Código React, PWA, bandeja, categorías y service worker: incorporados a GitHub.
- Tablas y funciones PIN/dispositivos: ejecutadas en la base de Lovable.
- Pendiente: ejecutar SQL de eventos y clave pública, desplegar Edge Function y configurar sus secretos. Hasta entonces no afirmar que llegan notificaciones con la app cerrada.

## Paso 1 — Completar SQL en Lovable Cloud

Desde Database > SQL Editor, ejecutar el archivo:

**sql/ACTIVAR_NOTIFICACIONES_PENDIENTES.sql**

Incluye los disparadores de eventos de turnos, sobrantes, inventario, cuentas por cobrar y auditoría, más la clave pública VAPID. Los eventos se crearán para movimientos futuros, sin reescribir historial.

Comprobación SQL:

    SELECT categoria,count(*) FROM public.alfaro_notif_eventos GROUP BY categoria;
    SELECT length(vapid_public_key) AS longitud FROM public.alfaro_notif_config WHERE id='global';

## Paso 2 — Función del servidor

Desplegar el archivo **supabase/functions/alfaro-push-dispatch/index.ts**
como la Edge Function **alfaro-push-dispatch** del proyecto.

El archivo supabase/config.toml tiene verify_jwt=false; la propia función
exige Authorization: Bearer SERVICE_ROLE_KEY. Nunca invocarla desde JavaScript
público ni exponer claves privadas mediante variables VITE_.

## Paso 3 — Secretos del servidor

Agregar en los secretos de Edge Functions:
- VAPID_PUBLIC_KEY
- VAPID_PRIVATE_KEY
- VAPID_SUBJECT

Los valores están en un archivo privado entregado aparte, nunca en GitHub.
El backend también debe tener SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
Guardar la clave privada y service-role de manera confidencial.

## Paso 4 — Programación cada cinco minutos

.github/workflows/alfaro-push.yml ya está en GitHub.

En GitHub > Settings > Secrets and variables > Actions, añadir:
- ALFARO_EDGE_DISPATCH_URL: URL de la Edge Function, normalmente
  https://ydrmzyddlpsaojzekgmv.supabase.co/functions/v1/alfaro-push-dispatch
- ALFARO_SERVICE_ROLE_KEY: clave service-role del backend

Ejecutar manualmente el workflow «Enviar notificaciones push AlFaroCafé» para
probar la respuesta y observar el resultado. Si faltan secretos, se omite el envío.
También puede programarse Supabase Cron cada minuto en vez de GitHub Actions.

## Paso 5 — Probar en iPhone

En Safari, añadir la URL PUBLICADA de AlFaroCafé Manager a la pantalla de inicio.
Abrir desde su icono. Salir y entrar de nuevo una vez con el PIN habitual para
registrar la sesión del dispositivo. Ir a Avisos > Activar notificaciones.
Autorizar el permiso nativo del iPhone, sin añadir otro PIN.

Enviar un precuadre real de prueba y comprobar bandeja y aviso con la app cerrada.
Un administrador/dueña recibirá los eventos pertinentes al sincronizar la nube.
Una dependienta solo recibe los avisos de sus propios turnos.

## Privacidad y límites

- Preferencias individuales por dispositivo y usuario PIN.
- Los avisos de caja, inventario, CxC y auditoría son solo de administración.
- Los eventos offline se registran en nube después de sincronizarse.
- Los cambios de esta función no modifican cuadres, salarios ni comisiones.
- El envío push no está operativo hasta desplegar Edge Function, los secretos y cron.
