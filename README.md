# RIFAS CFP (Serverless)

Aplicación web estática y serverless para gestionar una rifa del Centro de Formación Profesional 413 UMUPLA.

Esta versión se ejecuta directamente en el navegador del comprador y se conecta a una base de datos de **Supabase** en la nube, permitiendo desplegar la web de manera 100% gratuita y veloz en **GitHub Pages**.

---

## Características principales

* **Carga instantánea**: Al ser un sitio web estático alojado en GitHub Pages, el sitio carga en menos de un segundo y nunca entra en suspensión.
* **Persistencia segura**: Las reservas y datos de compradores se guardan en una base de datos PostgreSQL en la nube (Supabase).
* **Generación de PDFs local**: Los comprobantes de reservas confirmadas y el reporte general para el administrador se generan directamente en el navegador del cliente mediante la librería `jsPDF`, ahorrando recursos de servidor.
* **Seguridad administrada**: Las acciones del panel de administración (confirmar cobro, liberar números, borrar registros) están protegidas por funciones de base de datos seguras (RPC) en Supabase que validan el código de acceso.

---

## Estructura del proyecto

La aplicación está diseñada sin dependencias de servidor ni procesos complejos de compilación:
* `index.html`: Estructura e interfaz responsiva de la rifa. Carga Supabase y jsPDF desde un CDN.
* `styles.css`: Estilos visuales optimizados para dispositivos móviles y escritorio.
* `app.js`: Lógica de la aplicación en el navegador (conexión con Supabase, cálculo de disponibilidad, descargas de PDFs, panel de administración).
* `logo-umupLA.jpg`: Logotipo oficial del Centro de Formación Profesional.
* `README.md`: Este archivo con la guía de configuración y despliegue.

---

## Configuración y Despliegue Paso a Paso

### Paso 1: Configurar la Base de Datos en Supabase

1. Crea una cuenta gratuita en [Supabase](https://supabase.com/).
2. Crea un nuevo proyecto (asígnale un nombre y una contraseña a la base de datos).
3. Una vez creado el proyecto, ve al menú lateral izquierdo y entra en **SQL Editor** (icono de hoja con código).
4. Presiona **New query** (o "New SQL snippet") y pega el siguiente script SQL completo:

```sql
-- 1. Crear tabla de compradores
create table if not exists buyers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  dni text not null unique,
  phone text not null,
  token text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Crear tabla de reservas
create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid references buyers(id) on delete cascade not null,
  numbers integer[] not null,
  status text not null check (status in ('reserved', 'sold', 'cancelled')),
  total numeric not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  confirmed_at timestamp with time zone,
  cancelled_at timestamp with time zone
);

-- 3. Habilitar seguridad de filas (RLS)
alter table buyers enable row level security;
alter table reservations enable row level security;

-- 4. Crear políticas RLS públicas para compradores
create policy "Permitir inserción pública de compradores" on buyers
  for insert with check (true);

create policy "Permitir lectura pública de compradores" on buyers
  for select using (true);

create policy "Permitir actualización de compradores" on buyers
  for update using (true);

-- 5. Crear políticas RLS públicas para reservas
create policy "Permitir lectura pública de reservas" on reservations
  for select using (true);

create policy "Permitir inserción pública de reservas" on reservations
  for insert with check (true);

-- 6. Crear tabla de números de la rifa y políticas RLS
create table if not exists raffle_numbers (
  number integer primary key
);

alter table raffle_numbers enable row level security;

create policy "Permitir lectura pública de números" on raffle_numbers
  for select using (true);

-- 7. Crear funciones de base de datos seguras (RPC) para administración

-- Función: Agregar números a la rifa masivamente
create or replace function admin_add_numbers(p_numbers integer[], p_admin_code text)
returns jsonb
language plpgsql
security definer
as $$
declare
  num integer;
begin
  if p_admin_code != 'rifa2026' then
    raise exception 'Código de administrador incorrecto.';
  end if;
  
  foreach num in array p_numbers
  loop
    insert into raffle_numbers (number) values (num) on conflict do nothing;
  end loop;
  
  return jsonb_build_object('success', true);
end;
$$;

-- Función: Quitar números de la rifa masivamente
create or replace function admin_remove_numbers(p_numbers integer[], p_admin_code text)
returns jsonb
language plpgsql
security definer
as $$
declare
  num integer;
begin
  if p_admin_code != 'rifa2026' then
    raise exception 'Código de administrador incorrecto.';
  end if;
  
  foreach num in array p_numbers
  loop
    delete from raffle_numbers where number = num;
  end loop;
  
  return jsonb_build_object('success', true);
end;
$$;

-- Función: Confirmar Pago
create or replace function admin_confirm_payment(p_reservation_id uuid, p_admin_code text)
returns jsonb
language plpgsql
security definer
as $$
begin
  if p_admin_code != 'rifa2026' then
    raise exception 'Código de administrador incorrecto.';
  end if;
  
  update reservations
  set status = 'sold', confirmed_at = timezone('utc'::text, now())
  where id = p_reservation_id;
  
  return jsonb_build_object('success', true);
end;
$$;

-- Función: Volver reserva a estado Pendiente de Pago
create or replace function admin_revert_payment(p_reservation_id uuid, p_admin_code text)
returns jsonb
language plpgsql
security definer
as $$
begin
  if p_admin_code != 'rifa2026' then
    raise exception 'Código de administrador incorrecto.';
  end if;
  
  update reservations
  set status = 'reserved', confirmed_at = null
  where id = p_reservation_id;
  
  return jsonb_build_object('success', true);
end;
$$;

-- Función: Cancelar reserva y liberar números
create or replace function admin_cancel_reservation(p_reservation_id uuid, p_admin_code text)
returns jsonb
language plpgsql
security definer
as $$
begin
  if p_admin_code != 'rifa2026' then
    raise exception 'Código de administrador incorrecto.';
  end if;
  
  update reservations
  set status = 'cancelled', confirmed_at = null, cancelled_at = timezone('utc'::text, now())
  where id = p_reservation_id;
  
  return jsonb_build_object('success', true);
end;
$$;

-- Función: Borrar físicamente una reserva
create or replace function admin_delete_reservation(p_reservation_id uuid, p_admin_code text)
returns jsonb
language plpgsql
security definer
as $$
begin
  if p_admin_code != 'rifa2026' then
    raise exception 'Código de administrador incorrecto.';
  end if;
  
  delete from reservations
  where id = p_reservation_id;
  
  return jsonb_build_object('success', true);
end;
$$;

-- 8. Crear tabla de configuraciones globales
create table if not exists raffle_settings (
  id integer primary key default 1,
  config jsonb not null
);

alter table raffle_settings enable row level security;

create policy "Permitir lectura pública de configuraciones" on raffle_settings
  for select using (true);

-- Insertar configuración por defecto
insert into raffle_settings (id, config) values (1, '{
  "price": 5000,
  "drawDate": "18 de junio",
  "drawDateShort": "18/06",
  "drawInfo": "Loteria de la Provincia - jugada nocturna",
  "header": {
    "logoSrc": "logo-umupLA.jpg",
    "eyebrow": "Rifa solidaria",
    "title": "Rifa 2026",
    "institution": "CENTRO DE FORMACION PROFESIONAL 413 UMUPLA",
    "drawCopy": "Números disponibles seleccionados. Sortea el 18 de junio por Lotería de la Provincia, jugada nocturna."
  },
  "prizes": [
    { "name": "1er premio", "desc": "Cocina industrial" },
    { "name": "2do premio", "desc": "Parrilla con pala y tizón plegable de dos mallas" },
    { "name": "3er premio", "desc": "Parrilla con pala y tizón plegable simple" },
    { "name": "4to premio", "desc": "Apoya disco" },
    { "name": "5to premio", "desc": "Picada completa para 4 personas" }
  ]
}'::jsonb) on conflict (id) do nothing;

-- Función para actualizar configuraciones
create or replace function admin_update_settings(p_config jsonb, p_admin_code text)
returns jsonb
language plpgsql
security definer
as $$
begin
  if p_admin_code != 'rifa2026' then
    raise exception 'Código de administrador incorrecto.';
  end if;
  
  update raffle_settings set config = p_config where id = 1;
  
  return jsonb_build_object('success', true);
end;
$$;
```

5. Presiona el botón **Run** (esquina inferior derecha) para ejecutar el script. Esto dejará tu base de datos configurada y lista con las tablas y la lógica de administración protegida.

*(Nota: Si deseas cambiar el código de acceso del administrador en el futuro, solo debes modificar la condición `'rifa2026'` por la contraseña deseada en las 4 funciones RPC del editor SQL).*

---

### Paso 2: Conectar la Web con Supabase
Los datos de conexión se encuentran configurados en las constantes iniciales de tu archivo `app.js`:

```javascript
const SUPABASE_URL = "https://edlubmjtzxowwvbmbjok.supabase.co";
const SUPABASE_KEY = "sb_publishable_LifpUgGDra4o-oirfkNeWA_ObbeGDKc";
```
*(Puedes modificarlos en el código en caso de que desees apuntar a otro proyecto en el futuro).*

---

### Paso 3: Desplegar en GitHub Pages
Para publicar tu aplicación gratis y al instante:

1. Asegúrate de hacer un push de todo el código actualizado a tu repositorio de GitHub en la rama principal (`main`).
2. Entra a tu repositorio en GitHub desde el navegador.
3. Ve a la pestaña **Settings** (Configuración) en el menú superior.
4. En el menú lateral izquierdo, selecciona **Pages**.
5. En la sección **Build and deployment**:
   * **Source**: Selecciona `Deploy from a branch`.
   * **Branch**: Selecciona la rama `main` y la carpeta `/ (root)`.
6. Presiona **Save** (Guardar).
7. Espera aproximadamente un minuto. GitHub Pages te mostrará un enlace arriba con la URL pública de tu rifa (por ejemplo: `https://charly163.github.io/RIFAS-CFP/`).

¡Listo! Ya puedes compartir ese enlace con los compradores de la rifa.
