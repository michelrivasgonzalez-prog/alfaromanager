## Módulo WiFi_ALFARO_CAFE

Añadir una sección nueva **WiFi** a la app, sin tocar nada de lo que ya funciona (Cuadre, Historial, Calendario, Almacén, Cobrar, Reportes, Productos, Usuarios, Ajustes). Reutiliza el acceso por PIN, los mismos estilos, tarjetas y el registro de auditoría que ya existen.

---

### 1. Base de datos

Dos tablas nuevas:

- **Lotes de tickets**: nombre (ej. "Lote #2026-09-001"), perfil ("2Hrs"/"5Hrs"), horas, precio, cantidad, estado (disponible / entregado / completado / cancelado), fecha y quién lo creó.
- **Tickets**: pertenece a un lote, usuario (único), contraseña, perfil, horas, precio, estado (Disponible, Entregado, Vendido, Activado, Expirado, Cancelado), fecha de creación, venta, quién vendió, activación y expiración.

Acceso: lectura y escritura para cualquier usuario con sesión, más permisos de servicio. Índices por lote, estado y usuario.

Los precios (2 h = 200 CUP, 5 h = 400 CUP) y los perfiles se guardan en la configuración global ya existente, editables desde la pestaña de configuración de WiFi.

Cada acción importante (crear lote, entregarlo, vender ticket, cancelar, cambiar precios) queda registrada en la auditoría actual.

---

### 2. Navegación y permisos

- Nueva pestaña **WiFi** en la barra inferior, con icono de señal.
- **Dependiente**: entra directo a la pantalla de *Venta rápida*, nada más.
- **Admin / Dueña**: módulo completo con pestañas: Panel, Venta rápida, Tickets, Lotes, Impresión y Precios.

---

### 3. Generar lote

Formulario con cantidad (ej. 100), perfil (2 h, 5 h o personalizado), horas y precio. Genera usuarios y contraseñas aleatorios legibles (sin 0/O ni 1/l/I), crea el lote y todos los tickets, y ofrece pasar directo a imprimir.

---

### 4. Impresión A4 con QR

Vista de impresión con 21 tickets por hoja (3 columnas × 7 filas). Cada ticket lleva:

```text
+---------------------------+
|   WiFi_ALFARO_CAFE        |
|        2 HORAS            |
|  Usuario:  abcd1234       |
|  Clave:    xyz7k9p2       |
|  [QR]        200 CUP      |
|  1. Conéctate a la red    |
|  2. Escanea o escribe     |
+---------------------------+
```

El QR apunta a `alfarowifi.com/login?username=...&password=...`. Al imprimir se oculta la navegación y todo lo que no sea la hoja de tickets.

---

### 5. Venta rápida (dependienta)

Pantalla pensada para el móvil: buscador por código de usuario y lista de tickets listos (Disponible o Entregado) agrupados por perfil. Un toque selecciona, un botón grande confirma la venta ("Confirmar venta · 200 CUP"). Al confirmar, el ticket pasa a Vendido con la fecha y el nombre de quien vendió, y sale un aviso de confirmación.

---

### 6. Tickets y Lotes

- **Tickets**: filtros por estado, lote y perfil, búsqueda por usuario, y tarjetas responsivas con usuario, perfil, precio, lote, estado y fecha de venta.
- **Lotes**: lista con fecha, total, disponibles, entregados, vendidos, activados y recaudación en CUP; botones para marcar como entregado a la dependienta, imprimir y cancelar.

---

### 7. Panel WiFi

Tarjetas: tickets disponibles, vendidos, usuarios activos (0 por ahora), lotes, ventas del día, ventas del mes y horas vendidas. Aviso fijo "MikroTik: no conectado (Fase 2)". Debajo, ventas por día y desglose 2 h vs 5 h con las mismas barras que usan los reportes.

---

### Detalles técnicos

- Migración con las dos tablas, GRANT para `authenticated` y `service_role`, RLS permisiva para autenticados, e índices.
- Nueva librería `qrcode.react` para los QR (SVG, imprime nítido).
- `src/lib/wifi.ts`: tipos, generador de credenciales, consultas y mutaciones (crear lote, vender ticket, entregar/cancelar lote) + escritura en `auditoria`.
- `src/pages/Wifi.tsx` con pestañas shadcn; subcomponentes en `src/components/wifi/`: `WifiDashboard`, `VentaRapida`, `TicketsPanel`, `LotesPanel`, `GenerarLote`, `ImpresionTickets`, `PreciosWifi`.
- Ruta `/wifi` en `App.tsx` (todos los roles; el contenido se limita por rol dentro de la página) y pestaña en `AppLayout.tsx`.
- Precios en `settings.wifi` del store existente, persistidos con `pushSettings`.
- React Query para datos; nada de credenciales de MikroTik en el cliente — la Fase 2 se hará con una función de servidor.

---

### Fuera de alcance (Fase 2)

Conexión real con MikroTik (RouterOS API), activación/expiración automática de tickets y usuarios activos en vivo.
