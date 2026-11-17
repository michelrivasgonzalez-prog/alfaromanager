# Activación de Caja de Sobrantes

1. Ejecutar [la conciliación de solo lectura](./conciliar_caja_sobrantes.sql) en el SQL Editor de Supabase o Lovable Cloud. En el punto de partida reportado, Kamila y Laritza tienen 9.970 y 2.155 CUP pendientes y 4.300 y 5.780 CUP de salario pagado. El total pendiente esperado es 12.125 CUP y el saldo confirmado es 0 CUP si todavía no hubo otras operaciones.
2. Probar las migraciones de caja en una copia que tenga el esquema del fondo. Si ya se aplicaron las migraciones anteriores, solo falta la nueva migración `20261117000200_caja_acceso_pin.sql`. Esta sustituye el acceso por correo, así que coordinar su aplicación con la actualización de Lovable.
3. En SQL Editor, ejecutar esta consulta de solo lectura para encontrar el perfil de la dueña o de un administrador.

   ```sql
   select id, nombre, role from public.pin_users
   where role in ('duena', 'admin') and deleted_at is null
   order by nombre;
   ```

4. Copiar el ID del perfil correcto y ejecutar la siguiente consulta una vez. El resultado contiene su nuevo PIN de seis dígitos. Entregarlo únicamente a la persona titular.

   ```sql
   select private.emitir_pin_caja('<ID del perfil>');
   ```

   La persona usa ese PIN en la pantalla principal y abre **Caja de Sobrantes** directamente. El PIN nuevo se administra en la base de datos. Para renovarlo, ejecutar nuevamente el comando. Para revocar el acceso, eliminar el perfil de `private.pines_caja` desde SQL Editor. Los demás perfiles conservan su PIN actual.
5. Revisar el PR e integrarlo en `main` para que Lovable sincronice el código. Probar el acceso por PIN y la conciliación antes de publicar la aplicación.

## Uso

- En **Historial → Gestionar sobrante**, revisar el importe y el salario. Para un sobrante nuevo o un histórico sin revisar, escribir el motivo y pulsar **Registrar sobrante pendiente**. Los ingresos ya registrados se muestran con su estado.
- En **Caja de Sobrantes** o en el mismo historial, usar **Registrar ingreso** y confirmar cuando se reciba físicamente el efectivo.
- Para un retiro, escribir el importe y el motivo. El servidor verifica el saldo y la auditoría registra quién realizó la operación.
