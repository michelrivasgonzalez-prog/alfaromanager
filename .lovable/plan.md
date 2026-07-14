## Alcance

Añadir dos módulos nuevos a Alfaro Café Manager — **Almacén** y **Cuentas por Cobrar** — más búsqueda global, panel de indicadores, auditoría y validaciones. Todo debe convivir con el sistema actual de cuadres sin modificar su lógica ni su UI existente, respetando el diseño (tokens semánticos, `gradient-warm`, tarjetas con `shadow-soft`, navegación inferior).

Dada la magnitud, propongo entregarlo en **5 fases** aprobadas por separado para poder validar cada bloque antes del siguiente. Cada fase incluye migración, sincronización con tombstones (mismo patrón que ya usamos) y UI.

---

## Fase 1 — Fundaciones (base de datos + navegación)

**Backend (una sola migración)**

Tablas nuevas en `public`, todas con `id uuid`, `created_at`, `updated_at`, `deleted_at` (soft-delete) y trigger `tg_set_updated_at`:

- `almacen_productos` — `nombre`, `unidad`, `stock_minimo`, `permite_negativo bool default false`
- `almacen_movimientos` — `producto_id`, `tipo ('entrada'|'salida')`, `cantidad numeric`, `fecha timestamptz`, `receptor text null`, `observacion text`, `reversion_de uuid null` (para correcciones sin borrar)
- `clientes` — `nombre`, `telefono`, `observaciones`, `uso_count int default 0` (para ordenar por frecuencia)
- `deudas` — `cliente_id`, `cuadre_id` (FK lógica a `cuadres.id`), `cuadre_label text`, `fecha`, `productos jsonb` (nombre/cantidad/precio), `total numeric`, `saldo numeric`, `estado ('pendiente'|'parcial'|'pagada')`
- `abonos` — `cliente_id`, `monto numeric`, `fecha`, `usuario_id`, `nota text`
- `abono_aplicaciones` — `abono_id`, `deuda_id`, `monto numeric` (distribución)
- `auditoria` — `fecha`, `usuario_id`, `usuario_nombre`, `accion`, `entidad`, `entidad_id`, `detalle jsonb`

**Reglas de acceso** (RLS + GRANT):

- Todas las tablas: lectura para `authenticated`; escritura sólo para `admin`/`duena` vía `has_role`.
- `auditoria`: inserción abierta a `authenticated`, sin update/delete (append-only).
- `service_role` full en todas.

**Índices** relevantes: `deudas(cliente_id)`, `deudas(cuadre_id)`, `abono_aplicaciones(deuda_id)`, `almacen_movimientos(producto_id, fecha)`, `deleted_at` en cada tabla soft-delete.

**Frontend (mínimo)**

- Nuevas rutas y tabs en `AppLayout`: **Almacén** y **Cobrar** (icono `Warehouse` y `Wallet`). Visibles para `admin`/`duena`.
- Páginas placeholder con la estructura visual del resto (mismo `gradient-warm`, `StepShell`, tarjetas).
- Extender `cuadreStore` con `tombstones` para las nuevas entidades y stubs de sync en `src/lib/sync.ts` (mismo patrón soft-delete que ya usamos).

Entregable de Fase 1: esquema listo, navegación funcional, sincronización preparada.

---

## Fase 2 — Almacén completo

- **Productos** (`/almacen`): lista con existencia calculada (SUM entradas − SUM salidas), badge rojo si ≤ `stock_minimo`, alta/edición/soft-delete.
- **Movimientos** (`/almacen/movimientos`): formulario de Entrada / Salida con fecha-hora prellenada y editable, selector de producto, receptor obligatorio en salidas, observación opcional. Validación: bloquear stock negativo salvo que el producto tenga `permite_negativo=true`.
- **Historial**: listado paginado, filtro por producto/tipo/rango. Botón "Corregir" que crea un movimiento inverso con `reversion_de` apuntando al original (nunca borra).
- **Panel** superior con KPIs: total productos, productos bajo mínimo, últimos 5 movimientos.

---

## Fase 3 — Cuentas por Cobrar (clientes + deudas)

- **Clientes** (`/cobrar/clientes`): CRUD; lista ordenada por `uso_count desc, nombre asc`. Ficha del cliente con: deudas pendientes/pagadas, historial de abonos, totales (comprado, pagado, pendiente), fecha del último abono y última compra a crédito.
- **Deudas** (`/cobrar/deudas`): listado con filtros por estado y cliente, badge de estado.
- **Generación desde cuadre**: en `Cuadre.tsx` Step final, si hay venta a crédito, añadir sección "Registrar como deuda" con selector de cliente (crear inline). Al finalizar el cuadre se crea **una sola** deuda con `cuadre_id`, `cuadre_label` = título actual del cuadre, `productos` = snapshot de la venta a crédito, `total`, `saldo=total`, `estado='pendiente'`. Incrementar `uso_count` del cliente.
- **Navegación bidireccional**: botón "Ver cuadre" en la deuda (abre `/historial` filtrado/expandido en ese id), y en el detalle del cuadre en `Historial` un botón "Ver deuda" cuando exista.

---

## Fase 4 — Abonos, comprobante y validaciones

- **Nuevo abono** (`/cobrar/clientes/:id/abonar`): input de monto entregado + lista de deudas pendientes con inputs para distribuir; auto-completado "aplicar al más antiguo". Bloqueo si suma > monto o si algún renglón > saldo de esa deuda. Guardado transaccional vía RPC `registrar_abono(cliente_id, monto, aplicaciones jsonb, usuario_id)` que:
  1. inserta `abonos`
  2. inserta filas en `abono_aplicaciones`
  3. actualiza `saldo` y `estado` de cada `deudas`
  4. inserta registro en `auditoria`
  
  Todo en una sola transacción para evitar inconsistencias.
- **Comprobante**: modal + PDF (reusar `src/lib/pdf.ts`) con cliente, fecha, monto, distribución, saldo por deuda, total pendiente y usuario. Botón "Compartir por WhatsApp" con `wa.me/<telefono>?text=<resumen encodeURIComponent>`.
- **Validaciones globales** (zod + servidor):
  - abono ≤ saldo, montos > 0
  - no borrar deudas con abonos
  - abonos inmutables: para corregir se crea un abono de reversión (monto negativo) que revierte aplicaciones
  - stock negativo bloqueado salvo flag

---

## Fase 5 — Panel, búsqueda global y auditoría

- **Panel Cobrar**: total pendiente, nº clientes con deuda, nº deudas pendientes, cobrado hoy, cobrado mes.
- **Panel Almacén**: los ya citados en Fase 2 (se refina aquí).
- **Búsqueda global** (barra en `Index.tsx`, `/buscar`): consulta única sobre `clientes`, `almacen_productos`, `deudas` (por cuadre_label / cliente) y `cuadres`. Resultados agrupados y con navegación directa.
- **Auditoría** (`/ajustes` sección "Auditoría", sólo admin): log paginado, filtros por usuario/entidad/rango. Append-only por RLS.

---

## Sincronización

Extender `fullSync` en `src/lib/sync.ts` con los mismos pasos que catálogo/dependientes/cuadres para cada tabla nueva:

1. pull remoto (incluye `deleted_at`)
2. aplicar tombstones remotos al local
3. push tombstones locales (sólo admin)
4. merge y upsert
5. las operaciones financieras (abonos) se sincronizan por RPC transaccional, no por upsert directo, para no perder atomicidad.

Cola offline: si la RPC falla por red, se almacena en `pendingOps` del store y se reintenta en la próxima sync.

---

## Diseño

Reutilizar `StepShell`, `Card`, `Button`, `Input`, tokens (`primary`, `muted`, `accent`, `gradient-warm`, `shadow-soft`). Nada de colores hardcodeados. Iconos de `lucide-react` a juego: `Warehouse`, `PackagePlus`, `PackageMinus`, `Wallet`, `Users`, `Receipt`, `Search`, `ShieldCheck`.

---

## Sobre el Excel de AppSheet

No hace falta para arrancar — el modelo propuesto es un rediseño limpio. Si me lo compartes antes de la Fase 3, mapeo tus datos actuales en un script de importación (`INSERT` vía tool) para que empieces con toda tu cartera ya cargada.

---

## Confirmación

¿Empiezo por la **Fase 1** (migración + navegación + estructura de sync)? Cuando esté aprobada, sigo con Almacén (Fase 2) sin más preguntas.