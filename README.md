# Login con Express Session + seguridad por permisos

Proyecto de login con Node.js, Express, Express Session y PostgreSQL. Sobre el
login existente se agrego un modelo de seguridad por perfiles, metodos y
opciones, un objeto `Security` y un unico Dispatcher de operaciones de negocio.
Tambien se implemento en PostgreSQL el modelo de datos de nomina del diagrama
(`PAY_PERIODS`, `PAYROLL_RUNS`, `EMPLOYEES`, etc.) y las operaciones de nomina
ahora persisten y consultan datos reales.

El frontend fue migrado de Web Components a React con Vite. Express, Express
Session, PostgreSQL, `Security` y el Dispatcher conservan el mismo contrato y
las mismas rutas de API. La carpeta `client/` se conserva como referencia, pero
ya no se sirve.

El login anterior sigue usando las mismas rutas y el mismo objeto de sesion:

```js
req.session.user = {
    UserID: 1,
    Name: 'Ana Torres',
    Profile: [{ id: 1, name: 'admin' }, ...]
};
```

La lista `Profile` de la sesion es solo informativa. Para autorizar, el servidor
consulta nuevamente en PostgreSQL los perfiles activos y los permisos vigentes.
No se guardan permisos en la sesion ni se aceptan `userId`, `profileId` o
`allowed` enviados por el cliente.

## Flujo del Dispatcher

1. El cliente hace `POST /api/dispatcher`.
2. `authMiddleware` valida la sesion de Express Session y construye
   `req.securityContext` en el servidor.
3. `Security.execMethod(json, context)` valida la solicitud.
4. Se consultan el usuario, sus perfiles activos y la operacion en PostgreSQL.
5. Se verifica que subsistema, clase y metodo existan, esten activos y
   relacionados correctamente.
6. Se aplican los permisos de metodo de todos los perfiles activos.
7. Si esta autorizado, se busca la funcion en el registro interno.
8. Se validan los parametros y se ejecuta solo la funcion registrada.
9. El Dispatcher responde JSON con un codigo HTTP apropiado.

## Modelo de datos

La migracion `database/security.sql` reutiliza las tablas existentes y no
renombra ni borra datos del login.

| Entidad del diagrama | Implementacion |
|---|---|
| `person` | Tabla nueva. Se vincula uno-a-uno con `users` mediante `users.person_id` (unico). |
| `user` | Tabla existente `users`. Se le agregan `person_id` y `active`. |
| `profile` | Tabla existente `profiles`. Se le agrega `active`. |
| `user_profile` | Tabla existente `user_profiles`. Se le agrega `active`. |
| `subsystem` | Tabla nueva. |
| `class` | Tabla nueva `"class"`. |
| `method` | Tabla nueva. |
| `option` | Tabla nueva `"option"`. |
| `permission_method` | Tabla nueva con `allowed BOOLEAN NOT NULL`. |
| `permission_option` | Tabla nueva con `allowed BOOLEAN NOT NULL`. |

Relaciones principales:

- `person 1 -- 0..1 user` mediante `users.person_id UNIQUE`.
- `user N:M profile` mediante `user_profiles`.
- `subsystem 1:N class 1:N method`.
- `subsystem 1:N option`.
- `profile N:M method` mediante `permission_method`.
- `profile N:M option` mediante `permission_option`.

### Modelo de nomina

La migracion `database/payroll.sql` implementa las trece entidades del diagrama
de nomina. Reutiliza `person` para la identidad del empleado y `users` para
auditar quien calcula y cierra una nomina.

| Entidad del diagrama | Tabla implementada |
|---|---|
| `PAY_PERIODS` | `pay_periods` |
| `PAYROLL_RUNS` | `payroll_runs` |
| `EMPLOYEES` | `employees` (vinculada a `person`) |
| `BONUS_ENTRIES` | `bonus_entries` |
| `EMPLOYEE_LOANS` | `employee_loans` |
| `LOAN_INSTALLMENTS` | `loan_installments` |
| `EMPLOYEE_DEDUCTIONS` | `employee_deductions` |
| `OVERTIME_ENTRIES` | `overtime_entries` |
| `EMPLOYEE_COMPENSATIONS` | `employee_compensations` |
| `PAYROLL_CONCEPTS` | `payroll_concepts` |
| `PAYROLL_RESULTS` | `payroll_results` |
| `PAYROLL_LINES` | `payroll_lines` |
| `PAYROLL_PAYMENTS` | `payroll_payments` |

Relaciones principales:

- `person 1 -- 0..1 employee` mediante `employees.person_id UNIQUE`.
- `pay_periods 1:N payroll_runs`; un solo run activo por periodo y tipo.
- `payroll_runs 1:N payroll_results`; un resultado por empleado y run.
- `payroll_results 1:N payroll_lines` y `payroll_results 1:1 payroll_payments`.
- `payroll_concepts 1:N payroll_lines` y clasifica cada linea como percepcion
  o deduccion.
- `employees 1:N bonus_entries`, `overtime_entries`, `employee_deductions`,
  `employee_compensations` y `employee_loans`.
- `employee_loans 1:N loan_installments`; cada cuota pertenece a un
  `pay_periods`.
- `employees 1:N payroll_results` y `employees 1:N payroll_payments`.

Los importes usan `NUMERIC(14,2)`, las cantidades y tarifas `NUMERIC(14,4)`, y
los estados estan restringidos con `CHECK` (por ejemplo, un periodo solo puede
estar `ABIERTO`, `CALCULADO`, `CERRADO` o `CANCELADO`).

Las claves de permiso son:

```text
permission_method: subsystemId_classId_methodId_profileId
permission_option: subsystemId_optionId_profileId
```

`permission_method` usa una PK compuesta por los cuatro identificadores y claves
foraneas compuestas para garantizar que el metodo pertenezca a la clase y que la
clase pertenezca al subsistema. `permission_option` garantiza que la opcion
pertenezca al subsistema. `allowed` guarda explicitamente `true` o `false`.

Para conservar los nombres del diagrama sin duplicar datos se crean las vistas
de solo lectura `"user"`, `profile` y `user_profile`, que apuntan a las tablas
existentes.

## Politica de autorizacion

Se aplica esta politica cuando un usuario tiene varios perfiles activos:

- **Denegacion por defecto:** sin una concesion explicita no se autoriza.
- **Denegacion prevalente:** si cualquier perfil activo tiene
  `allowed = false` para la combinacion, se rechaza aunque otro perfil conceda.
- **Concesion suficiente:** basta un `allowed = true` de un perfil activo,
  siempre que no exista una denegacion explicita.
- **Ausencia de fila:** no concede ni deniega; no suma.

Vigencia de los mapas:

- `permissionMethodMap` y `permissionOptionMap` son `Map` en memoria.
- Se actualizan en cada ejecucion y en `refreshUserPermissions(userId)`.
- La decision de `execMethod` **siempre** se toma con los permisos leidos de
  PostgreSQL en esa solicitud. Por eso una revocacion administrativa se aplica
  de inmediato, aunque el mapa tuviera un valor anterior.
- La administracion de permisos no tiene endpoints HTTP. Se hace por SQL o por
  codigo de confianza (`SecurityRepository.upsertMethodPermission`, etc.).

## Estructura relevante

```text
server/
  app.js
  src/
    security/
      Security.js
      PermissionMethodMap.js
      PermissionOptionMap.js
      permissionKeys.js
      index.js
    repositories/
      SecurityRepository.js
      PayrollRepository.js
    dispatcher/
      Server.js
      MethodRegistry.js
      registerMethods.js
    middleware/
      authMiddleware.js
    business/
      PayrollCalculator.js
      Empleados.js
      Salarios.js
      Bonos.js
      HorasExtras.js
      Prestamos.js
      Prenomina.js
      NominaDefinitiva.js
      validation.js
    errors/
      AppError.js
database/
  schema.sql
  security.sql
  payroll.sql
  seed.js
  runSql.js
tests/
  Security.test.js
  Dispatcher.test.js
  PayrollCalculator.test.js
```

## Instalacion y migracion

Requisitos: Node.js, PostgreSQL y las variables de `.env` (ver `.env.example`).

### Base de datos existente con login

```bash
npm install
npm run db:security
npm run db:payroll
npm test
npm run build
npm start
```

`npm run db:security` es idempotente: crea lo que falta, vincula las personas con
los usuarios existentes y agrega el catalogo/permisos demo sin borrar datos.
No vuelve a conceder permisos que hayan sido revocados administrativamente.

`npm run db:payroll` tambien es idempotente: crea las tablas de nomina, el
catalogo de conceptos y los datos demo. No borra ni reinicia informacion
existente. Debe ejecutarse despues de `db:security`, porque usa `person` y
`users`.

### Base de datos nueva

```bash
npm install
npm run db:setup
npm test
npm run build
npm start
```

`db:setup` ejecuta, en orden, `schema.sql`, `security.sql`, `seed.js` y
`payroll.sql`.

No ejecutes `npm run seed` sobre datos reales: el seed restablece las contrasenas
de los usuarios demo.

## Frontend React

El frontend vive en `frontend/` y reutiliza los estilos y el diseno del cliente
anterior. La carpeta `client/` queda como respaldo y ya no se sirve.

```text
frontend/
  index.html
  vite.config.mjs
  public/images/
  src/
    main.jsx
    App.jsx
    api/api.js
    components/
      Nav.jsx
      Panel.jsx
      ThemeSwitcher.jsx
    config/menu.js
    pages/
      LoginPage.jsx
      HomePage.jsx
    styles/
```

### Desarrollo

```bash
npm run dev
```

`server/dev.js` inicia Express con Vite en modo middleware. Todo se sirve en
`http://localhost:3000`, de modo que la cookie `sid` y `/api` comparten origen.
Los cambios de React se recargan con Vite.

### Produccion

```bash
npm run build
npm run start:prod
```

`npm run build` genera `frontend/dist`. `npm run start:prod` activa
`NODE_ENV=production` y sirve el build; si falta, el arranque falla con un
mensaje claro. En produccion la cookie conserva `secure`, por lo que el sitio
debe publicarse por HTTPS.

Para uso local, `npm start` sirve el build si existe y usa Vite si no. No fuerza
las cookies `secure`, asi que el login funciona sobre `http://localhost`.

### Previsualizar el build localmente

```bash
npm run preview
```

Compila y sirve `frontend/dist` con cookies no `secure`, para probar el build en
`http://localhost:3000` sin HTTPS.

### Rutas y sesion

| Ruta | Comportamiento |
|---|---|
| `/` | Express exige sesion; React muestra el panel. Sin sesion redirige a `/login`. |
| `/login` | Express solo la entrega sin sesion; React valida de nuevo contra `/api/auth/session`. |

El frontend no guarda usuarios ni permisos en `localStorage`. La identidad sale
de la cookie `sid` HttpOnly y de `/api/auth/session`. El login y el logout usan
los mismos endpoints de siempre.

## Login existente

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/api/auth/profiles` | Perfiles activos disponibles |
| POST | `/api/auth/register` | Crear usuario y persona |
| POST | `/api/auth/login` | Iniciar sesion |
| GET | `/api/auth/session` | Sesion activa |
| POST | `/api/auth/logout` | Cerrar sesion |
| GET | `/api/protected` | Ruta privada existente |

Usuarios demo (despues de ejecutar el seed):

```text
ana@example.com    / password123   (admin + editor)
bruno@example.com  / password123   (editor)
carla@example.com  / password123   (viewer)
```

## Dispatcher

Unico endpoint de operaciones de negocio:

```http
POST /api/dispatcher
Content-Type: application/json
```

Solicitud:

```json
{
  "subsystemId": 1,
  "classId": 1,
  "methodId": 2,
  "params": {
    "estado": "ACTIVO"
  }
}
```

Respuesta exitosa (resumida):

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "codigo": "DEMO-001",
      "nombre": "Empleado Demo Uno",
      "estado": "ACTIVO"
    }
  ]
}
```

Respuesta denegada:

```json
{
  "success": false,
  "message": "No tienes permiso para ejecutar esta operacion.",
  "code": "FORBIDDEN"
}
```

Codigos usados:

| Codigo | Situacion |
|---|---|
| 400 | Solicitud o parametros invalidos |
| 401 | Sin sesion autenticada |
| 403 | Sin permiso, usuario/persona/perfil inactivo u operacion inactiva |
| 404 | Operacion inexistente o no registrada en el servidor |
| 409 | Conflicto de negocio (por ejemplo, cierre duplicado) |
| 500 | Error interno sin detalle al cliente |

### Identificadores reales

Los IDs son `SERIAL`; consultalos en tu base antes de probar:

```sql
SELECT s.id AS subsystem_id,
       c.id AS class_id,
       m.id AS method_id,
       s.name AS subsystem,
       c.name AS class,
       m.name AS method
FROM subsystem s
JOIN "class" c ON c.subsystem_id = s.id
JOIN method m ON m.class_id = c.id
WHERE s.name = 'Nomina'
ORDER BY c.name, m.name;
```

### Operaciones registradas

| Clase.metodo | Parametros |
|---|---|
| `Empleados.listar` | `estado` opcional: `ACTIVO`, `INACTIVO`, `TODOS`; `limite` opcional |
| `Empleados.consultar` | `empleadoId` requerido |
| `Salarios.consultar` | `empleadoId` requerido |
| `Bonos.listar` | `empleadoId` y `periodo` opcionales |
| `HorasExtras.listar` | `empleadoId` y `periodo` opcionales |
| `Prestamos.listar` | `empleadoId` opcional |
| `Prenomina.calcular` | `periodo` (`YYYY-MM`), `empleadoIds` opcional |
| `Prenomina.consultar` | `periodo` requerido |
| `NominaDefinitiva.consultar` | `periodo` requerido |
| `NominaDefinitiva.cerrar` | `periodo` y `confirmar: true`; exige prenomina calculada |

Permisos demo:

| Perfil | Acceso |
|---|---|
| `admin` | Todos los metodos y opciones |
| `editor` | Consultas, empleados, salarios, bonos, horas extras, prestamos, calcular/consultar prenomina; no puede cerrar nomina definitiva |
| `viewer` | Empleados, salarios, prenomina calculada y nomina definitiva en consulta |

`NominaDefinitiva.cerrar` es un ejemplo de validacion de integridad: primero debe
existir una prenomina calculada para el periodo y el cierre solo se permite una
vez. `Prenomina.calcular` puede repetirse mientras el periodo este abierto.

Los IDs de la solicitud de ejemplo corresponden a la base demo. Verificalos con
la consulta SQL de la seccion anterior, porque pueden cambiar si la base ya
tenia registros de seguridad.

### Probar con curl

```bash
curl -i -c cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"userName":"ana@example.com","password":"password123"}' \
  http://localhost:3000/api/auth/login

curl -i -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"subsystemId":1,"classId":1,"methodId":2,"params":{"estado":"ACTIVO"}}' \
  http://localhost:3000/api/dispatcher

curl -i -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"subsystemId":1,"classId":6,"methodId":7,"params":{"periodo":"2026-10"}}' \
  http://localhost:3000/api/dispatcher
```

### Probar con Postman

1. Crear una peticion `POST http://localhost:3000/api/auth/login` con body JSON
   `{"userName":"ana@example.com","password":"password123"}`. Postman guarda la
   cookie `sid` automaticamente.
2. Crear `POST http://localhost:3000/api/dispatcher` con el body de ejemplo.
3. Para comprobar `401`, borrar las cookies del dominio o usar otro cliente.
4. Para comprobar `403`, iniciar sesion como `bruno@example.com` y ejecutar
   `NominaDefinitiva.cerrar` (editor no tiene ese permiso).
5. Para comprobar `409`, calcular `Prenomina.calcular` y cerrar dos veces el
   mismo periodo con `ana@example.com`.
6. Para comprobar `400`, ejecutar `Empleados.consultar` sin `empleadoId`.
7. Para comprobar `404`, cambiar `methodId` por un ID que no este registrado en
   el codigo (o no exista en la base).

## Pruebas

```bash
npm test
```

El runner ejecuta las pruebas de seguridad y Dispatcher. Si existe
`server/src/business/PayrollCalculator.js`, agrega automaticamente las pruebas
de calculo de nomina. Mientras la capa business no este instalada se ejecutan
29 pruebas y se omite la suite de calculo.

Las pruebas usan `node:test` y datos controlados, sin depender de datos
personales reales. Cubren, entre otros:

- lectura de ambos mapas y deteccion de claves duplicadas/invalidas;
- denegacion por defecto y concesion explicita;
- denegacion prevalente con multiples perfiles;
- usuarios, personas, perfiles y metodos inactivos;
- combinaciones invalidas de subsistema/clase/metodo;
- solicitudes sin sesion;
- metodos no registrados en el servidor;
- revocacion de permisos y mapa obsoleto;
- dos operaciones distintas por el mismo endpoint;
- parametros invalidos;
- proteccion de la administracion de permisos;
- consultas parametrizadas y errores de PostgreSQL;
- calculo de percepciones, deducciones, redondeo y neto de prenomina;
- rechazo de deducciones mayores a las percepciones, empleados sin salario y
  lineas sin concepto.

## Persistencia y demo de nomina

> **Modo sin business:** si no existe la carpeta `server/src/business`, el
> servidor arranca igualmente y registra las operaciones en modo `PENDIENTE`.
> Las operaciones autorizadas responden `200` con
> `{ "pendiente": true, "operacion": "..." }`. Esto permite probar login,
> sesion, permisos y validaciones, pero no consulta ni modifica datos reales
> de nomina. Al restaurar la capa business, el registro real se activa solo.

Las operaciones de nomina ya no usan un almacen en memoria. El flujo es:

1. `Prenomina.calcular` carga salario, compensaciones, bonos aprobados, horas
   extra aprobadas, deducciones recurrentes y cuotas de prestamo programadas.
2. Calcula las lineas y las guarda en `payroll_runs`, `payroll_results` y
   `payroll_lines` dentro de una transaccion.
3. Si se vuelve a calcular el mismo periodo abierto, se reemplaza el snapshot
   anterior; no se duplican resultados.
4. `NominaDefinitiva.cerrar` exige un run `CALCULADA`, aplica las cuotas de
   prestamo incluidas, marca bonos y horas extra como `APLICADO`, genera un
   `payroll_payments` por empleado y deja el periodo en `CERRADO`.
5. Un periodo cerrado no se puede recalcular ni cerrar dos veces (HTTP 409).

Datos demo de la migracion:

- Empleados `DEMO-001` a `DEMO-004`; `DEMO-003` esta inactivo para probar
  rechazos.
- Periodos mensuales de `2026-09` a `2027-01`; inicialmente solo `2026-09` esta
  cerrado.
- `2026-10` incluye un bono para `DEMO-001`, horas extra para `DEMO-002` y
  `DEMO-004`, una deduccion recurrente y una cuota de prestamo para `DEMO-002`.
- El prestamo de `DEMO-002` tiene saldo inicial de 2400 y cuatro cuotas de 600.

Los conceptos `ISR` e `IMSS` existen en el catalogo, pero el calculo automatico
de impuestos y aportaciones no se implementa porque depende de reglas fiscales
concretas. Se pueden agregar como deducciones recurrentes o extender el
calculador sin cambiar el modelo de datos.

La migracion `payroll.sql` es idempotente y no elimina datos. Si se ejecuta
varias veces, conserva los calculos y cierres existentes y solo agrega lo que
falte.

## Archivos creados

```text
server/src/errors/AppError.js
server/src/security/Security.js
server/src/security/PermissionMethodMap.js
server/src/security/PermissionOptionMap.js
server/src/security/permissionKeys.js
server/src/security/index.js
server/src/repositories/SecurityRepository.js
server/src/repositories/PayrollRepository.js
server/src/dispatcher/Server.js
server/src/dispatcher/MethodRegistry.js
server/src/dispatcher/registerMethods.js
server/src/middleware/authMiddleware.js
server/src/business/PayrollCalculator.js
server/src/business/Empleados.js
server/src/business/Salarios.js
server/src/business/Bonos.js
server/src/business/HorasExtras.js
server/src/business/Prestamos.js
server/src/business/Prenomina.js
server/src/business/NominaDefinitiva.js
server/src/business/validation.js
database/security.sql
database/payroll.sql
database/runSql.js
tests/Security.test.js
tests/Dispatcher.test.js
tests/PayrollCalculator.test.js
server/frontend.js
server/dev.js
server/start.js
server/preview.js
nodemon.json
frontend/index.html
frontend/vite.config.mjs
frontend/src/main.jsx
frontend/src/App.jsx
frontend/src/api/api.js
frontend/src/config/menu.js
frontend/src/components/Nav.jsx
frontend/src/components/Panel.jsx
frontend/src/components/ThemeSwitcher.jsx
frontend/src/pages/LoginPage.jsx
frontend/src/pages/HomePage.jsx
frontend/src/styles/
```

## Archivos modificados

```text
server/app.js
server/routes/pageRoutes.js
server/models/userModel.js
server/services/Session.js
server/config/session.js
server/middleware/requireSession.js
server/middleware/errorHandler.js
database/schema.sql
database/seed.js
package.json
package-lock.json
.gitignore
README.md
```

## Notas de seguridad

- Consultas SQL parametrizadas; no se interpola entrada del cliente.
- No se usa `eval`, `Function` ni invocacion por nombre en el codigo de negocio
  ni en la autorizacion. El unico `import()` dinamico esta en el arranque de
  Vite para desarrollo y no participa en `Security`.
- Solo se ejecutan funciones registradas en `MethodRegistry`.
- La identidad sale de `req.session`; los perfiles y permisos salen de PostgreSQL.
- No se almacenan permisos en la sesion ni en el cliente.
- La sesion conserva `httpOnly`, `sameSite`, `secure` en produccion y `rolling`.
- En produccion `SESSION_SECRET` es obligatorio.
- Las contrasenas siguen protegidas con bcrypt.
- Los errores 500 devuelven un mensaje generico y el detalle queda en el servidor.
- No existen rutas HTTP para administrar permisos.
