# RIFAS CFP

Aplicacion web para gestionar una rifa del Centro de Formacion Profesional 413 UMUPLA.

Permite que compradores reserven numeros desde un link y que un administrador gestione reservas, pagos, correcciones y comprobantes.

## Que hace

- Muestra los numeros disponibles de la rifa.
- Permite a una persona registrarse con nombre y apellido, DNI y telefono.
- Permite reservar uno o varios numeros disponibles.
- Marca cada numero como `Disponible`, `Reservado` o `Pagado`.
- Bloquea la descarga del comprobante PDF hasta que el administrador confirme el pago.
- Genera comprobante PDF para reservas pagadas.
- Permite al administrador descargar un PDF con el listado completo de numeros y datos asociados.
- Permite al administrador corregir errores: confirmar pago, volver a reservado, liberar numeros o borrar una reserva.

## Datos actuales de la rifa

- Precio por numero: $5000.
- Fecha de sorteo: 18 de junio.
- Sorteo: Loteria de la Provincia, jugada nocturna.
- Numeros disponibles: 931, 933, 934, 936, 939 al 949, 980 al 984 y 986.

## Premios

1. 1er premio: cocina industrial.
2. 2do premio: parrilla con pala y tizon plegable de dos mallas.
3. 3er premio: parrilla con pala y tizon plegable simple.
4. 4to premio: apoya disco.
5. 5to premio: picada completa para 4 personas.

## Como funciona para compradores

1. La persona abre la app.
2. Elige uno o varios numeros disponibles.
3. Carga nombre y apellido, DNI y telefono.
4. Presiona `Reservar numeros`.
5. La reserva queda pendiente de pago.
6. Cuando el administrador confirma el pago, la persona puede descargar el comprobante PDF.

## Como funciona para el administrador

El panel administrador permite:

- Ver todas las reservas.
- Confirmar una reserva como pagada.
- Volver una reserva pagada al estado reservado si hubo un error.
- Liberar numeros si una persona no compra finalmente.
- Borrar una reserva del historial.
- Descargar el listado general de numeros en PDF.

La clave de administrador se define en el backend, dentro de `server.js`, en la constante `ADMIN_CODE`. Antes de publicar la app en internet conviene cambiarla por una clave privada.

## Arquitectura tecnica

La app esta hecha sin dependencias externas.

- `server.js`: servidor Node.js HTTP, API, persistencia JSON y generacion de PDFs.
- `public/index.html`: estructura visual de la app.
- `public/styles.css`: estilos responsive.
- `public/app.js`: logica del navegador, reservas, panel admin y descargas.
- `public/logo-umupLA.jpg`: logo usado en el encabezado.
- `data/db.json`: base de datos local generada por la app.

## Persistencia

Los datos se guardan en `data/db.json` con esta estructura conceptual:

```json
{
  "buyers": [],
  "reservations": [],
  "numbers": {
    "931": {
      "number": 931,
      "status": "available",
      "reservationId": null
    }
  }
}
```

`data/db.json` no deberia subirse al repositorio si contiene datos reales de personas.

## Estados

- `available`: numero disponible para reservar.
- `reserved`: numero reservado por una persona, pendiente de pago.
- `sold`: numero pagado y confirmado por el administrador.
- `cancelled`: reserva cancelada; sus numeros vuelven a estar disponibles.

## Endpoints principales

- `GET /api/config`: devuelve configuracion de la rifa.
- `GET /api/numbers`: devuelve numeros y estados publicos.
- `POST /api/auth/register`: registra o actualiza comprador.
- `GET /api/me`: devuelve datos y reservas del comprador autenticado.
- `POST /api/reservations`: crea una reserva.
- `GET /api/admin/reservations`: lista reservas para administrador.
- `POST /api/admin/reservations/:id/confirm`: marca una reserva como pagada.
- `POST /api/admin/reservations/:id/reserve`: vuelve una reserva pagada a reservada.
- `POST /api/admin/reservations/:id/cancel`: libera los numeros y cancela la reserva.
- `POST /api/admin/reservations/:id/delete`: borra la reserva y libera sus numeros.
- `GET /api/receipt/:id.pdf`: descarga comprobante solo si la reserva esta pagada.
- `GET /api/admin/numbers-report.pdf`: descarga listado PDF para administrador.

## Como correr localmente

Requisitos:

- Node.js 18 o superior.

Instalar no requiere dependencias. Solo ejecutar:

```powershell
npm start
```

Luego abrir:

```text
http://localhost:3000
```

## Como replicarlo con otra IA

Para reconstruir esta aplicacion desde cero, pedirle a la IA:

1. Crear una app web con Node.js nativo, sin frameworks obligatorios.
2. Servir archivos estaticos desde `public/`.
3. Guardar datos en `data/db.json`.
4. Usar los numeros de rifa definidos arriba.
5. Implementar comprador con nombre, DNI y telefono.
6. Implementar reservas multiples por comprador.
7. Implementar panel administrador con acciones de confirmacion, correccion, liberacion y borrado.
8. Generar PDFs desde el backend sin depender de servicios externos.
9. No permitir comprobantes PDF hasta que el estado sea `sold`.
10. No subir datos reales de compradores al repositorio.

## Seguridad y despliegue

Esta version es ideal para uso simple o despliegue controlado. Antes de ponerla en produccion:

- Cambiar la clave de administrador.
- Usar HTTPS.
- No subir `data/db.json` con datos reales.
- Considerar una base de datos real si se usara desde varios dispositivos al mismo tiempo.
- Agregar autenticacion mas fuerte si el enlace sera publico.
