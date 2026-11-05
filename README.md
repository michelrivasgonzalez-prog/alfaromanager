# AlFaroCafé Manager

‎### Prompt para Lovable

‎

‎"Actúa como un experto desarrollador de React y Tailwind CSS. Crea una aplicación web progresiva (PWA) de gestión para una cafetería llamada 'AlFaroCafé' basada en el siguiente flujo de 10 pasos:

‎

‎**Estilo General:**

‎* **Estética:** Moderna, limpia, con bordes redondeados y tipografía legible.

‎* **Paleta de colores:** Fondos claros, acentos en verde esmeralda para acciones positivas (`bg-emerald-600`), marrón café para botones secundarios, y rojo para alertas o errores.

‎* **Componentes:** Tablas minimalistas, inputs numéricos claros y navegación inferior (Bottom Navigation Bar) con iconos de Lucide-React (Inicio, Historial, Reportes, Productos, Usuarios, Configuración).

‎

‎**Pantallas clave a implementar:**

‎1.  **Dashboard/Inicio:** Pantalla de bienvenida con imagen de fondo de café y botón central grande 'Iniciar cuadre y seleccionar los días trabajados en el datepicker y poner el nombre de Dependiente'.

‎2.  **Inventario Inicial y Final:** Tablas con edición en línea (icono de lápiz) para productos como Café, Azúcar, Leche, etc., mostrando cantidades.

‎3.  **Registro de Entradas/Traslados:** Formulario para agregar stock durante el turno con selector de producto y cantidad.

‎4.  **Cálculos Automáticos:** Pantalla de 'Resultados por producto' que calcule: `Venta = (Inicio + Entradas-Traslados) - Final`. Debe incluir columnas de Producto, Inicio, Entradas, Traslados, Total, Final, Precio, Importe, Costo y Ganancia.

‎5.  **Gestión de Gastos:** Tabla para registrar egresos detallados (Gastos Locales, Gastos Yanitza, Compras, Cuentas por Cobrar y Pagos en Transferencia) con un totalizador en el footer.

‎6.  **Cuadre de Efectivo:** Sección para desglose de denominaciones de billetes (1000, 500, 200, 100, 50, 20, 10 y 5) que sume el total automáticamente.

‎7.  **Lógica de Diferencia:** Pantalla que compare el 'Efectivo a Depositar' vs 'Efectivo Depositado', mostrando alertas en rojo si falta dinero ('FALTA DINERO') o en verde si sobró algo (que debe ser normalmente propina).

‎8.  **Cálculo de Salario:** Input de días trabajados que multiplique por un salario base y descuente o sume automáticamente las diferencias de caja del sueldo real. Además tambíen sugerir al económico la denominación de billetes que ha de pagar (en AlFaroCafé pagamos con los billetes de menor denominación según disponibilidad) para así quede registrado 

‎9.  **Resumen y Exportación:** Vista final con todos los totales, es decir Total de Venta, Total de Gastos desglosados en las diferentes categorías (Gastos Locales, Gastos Yanitza, Compras, Cuentas por Cobrar, Pagos en Transferencia), Efectivo a Depositar, Efectivo Depositado, Diferencia de caja, Salario detallado, Costo Total, Ganancia Total y Ganancia Neta, además de un botón prominente 'Generar PDF' y 'Finalizar turno'.

‎Cabe destacar que esto se debe guardar para abrirlo luego en la sesión Historial de Cuadres. 

10. ‎

‎Usa **Lucide-React** para los iconos y asegúrate de que la interfaz sea totalmente responsiva para dispositivos móviles (Mobile-first)."

‎

‎---

‎

‎### Consejos adicionales para Lovable:

‎

‎* **Lógica de datos:** Si quieres que la aplicación realmente sume y reste, puedes añadir al prompt: *"Implementa un estado global usando React Hooks para que los cálculos de las tablas de inventario se reflejen automáticamente en el resumen final"*.

‎* **Interactividad:** Pídele que use **Framer Motion** para que las transiciones entre los 10 pasos sean suaves (tipo slider o fade).

‎* **Edición:** Una vez que Lovable te dé la primera versión, si ves que los colores no coinciden exactamente, puedes decirle: *"Usa el código hexadecimal #4B3621 para los marrones y #065F46 para los verdes"*.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://alfaromanager.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/de447153-81d9-4e6d-9d36-d87c5600c528).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
