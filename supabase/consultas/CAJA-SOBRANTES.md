# Activación de Caja de Sobrantes

1. Ejecutar [la conciliación de solo lectura](./conciliar_caja_sobrantes.sql) en el SQL Editor de Supabase o Lovable Cloud. En el punto de partida reportado, Kamila y Laritza tienen 9.970 y 2.155 CUP pendientes y 4.300 y 5.780 CUP de salario pagado. El total pendiente esperado es 12.125 CUP y el saldo confirmado es 0 CUP si todavía no hubo otras operaciones.
2. Probar las dos migraciones de caja en una copia que ya tenga el esquema del fondo. Aplicar ambas en el proyecto vinculado a Lovable antes de activar la interfaz. Las migraciones usan las tablas, la vista y los triggers que ya existen y mantienen sus registros. Desde la aplicación, las operaciones pasan por una función de Supabase que verifica la identidad del operador.
3. En Authentication, crear una cuenta individual de correo y contraseña por operador. Verificar el correo y copiar el UUID de Auth en la siguiente sentencia. Ejecutarla con una cuenta administrativa desde SQL Editor. Usar el rol correspondiente a cada persona.

```sql
insert into private.operadores_caja_sobrantes (usuario_id, nombre, rol)
values ('<UUID de Auth>', '<Nombre de la persona>', 'admin');
```

Usar `duena` para la dueña. Para retirar el acceso al fondo basta eliminar la fila correspondiente de `private.operadores_caja_sobrantes`. Los PIN siguen siendo válidos en el resto de la aplicación. El acceso administrativo al fondo usa la cuenta individual y se vuelve a solicitar después de salir o de recargar la aplicación.

4. Revisar el PR e integrarlo en `main` para que Lovable sincronice el código. Publicar la aplicación cuando finalicen la conciliación y las pruebas de acceso.

## Uso

- En **Historial → Gestionar sobrante**, revisar el importe y el salario. Para un sobrante nuevo o un histórico sin revisar, escribir el motivo y pulsar **Registrar sobrante pendiente**. Los ingresos ya registrados se muestran con su estado.
- En **Caja de Sobrantes** o en el mismo historial, usar **Registrar ingreso** y confirmar cuando se reciba físicamente el efectivo.
- Para un retiro, escribir el importe y el motivo. El servidor verifica el saldo y la auditoría registra quién realizó la operación.
