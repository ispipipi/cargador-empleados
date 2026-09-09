# Descubrimiento VISMA API -> REX+

Fecha de prueba: 2026-08-24.

## Resumen ejecutivo

La API VISMA autentica correctamente contra `https://apim.vismalatam.com` usando password grant y retorna un bearer token con vigencia aproximada de 12 horas.

El usuario probado tiene acceso al tenant `ABB Chile SA Test`, id `4408`, con `WebApiEnabled=true`.

La familia `vlwebapi` responde correctamente con el header `X-RAET-Tenant-Id` y permite consultar colaboradores y subrecursos por legajo/internal id. La muestra de colaboradores activos reporto `totalCount=431`.

Con `Ocp-Apim-Subscription-Key`, la familia moderna ya responde en `Search`, `Organization`, `Contact emails` y listado de `Payroll processes`. Siguen bloqueados por permisos especificos (`NeedPermissions`) el catalogo de conceptos, detalle de proceso, empleados de proceso, conceptos liquidados por empleado/proceso y banking exports.

## Credenciales y seguridad

Las credenciales no deben quedar en frontend, repositorio, `.env` versionado, logs ni scripts.

Para produccion, el conector debe vivir en Firebase Functions o backend equivalente, usando secretos administrados:

- `VISMA_USERNAME`
- `VISMA_PASSWORD`
- `VISMA_SUBSCRIPTION_KEY`

El frontend solo debe llamar al proxy propio autenticado.

## Endpoints probados

| Endpoint | Header tenant | Estado | Hallazgo |
|---|---:|---:|---|
| `POST /vlwebapiadmin/authentication/login` | N/A | 200 | Retorna `access_token`, `token_type`, `expires_in`. |
| `GET /vlwebapiadmin/account/tenants` | N/A | 200 | Retorna tenant `ABB Chile SA Test`, id `4408`. |
| `GET /vlwebapiadmin/account/user-info` | N/A | 200 | Retorna informacion basica del usuario. |
| `GET /vlwebapiadmin/account/roles` | `X-RAET-Tenant-Id` | 200 | Retorna roles asignados; muestra de 1 rol. |
| `GET /vlwebapiadmin/account/tenants/dbinfo` | `X-RAET-Tenant-Id` | 200 | Retorna metadata del tenant y confirma `WebApiEnabled`. |
| `GET /vlwebapi/employees?page=1&pageSize=5&active=true` | `X-RAET-Tenant-Id` | 200 | Retorna `totalCount=431` y `values[]`. |
| `GET /vlwebapi/employees/{fileNumber}` | `X-RAET-Tenant-Id` | 200 | Retorna ficha extendida del colaborador. |
| `GET /vlwebapi/employees/{fileNumber}/addresses` | `X-RAET-Tenant-Id` | 200 | Retorna domicilio; campos de calle, numero, pais, ciudad, zona, estado. |
| `GET /vlwebapi/employees/{fileNumber}/phones` | `X-RAET-Tenant-Id` | 200 | Endpoint disponible; muestra sin telefonos para el colaborador probado. |
| `GET /vlwebapi/employees/{fileNumber}/phases` | `X-RAET-Tenant-Id` | 200 | Retorna fases laborales activas; incluye inicio, fin, status, salary/real/holidays. |
| `GET /vlwebapi/employees/{fileNumber}/structures` | `X-RAET-Tenant-Id` | 200 | Retorna estructuras historicas; muestra `totalCount=37`. |
| `GET /vlwebapi/employees/{fileNumber}/bank-accounts` | `X-RAET-Tenant-Id` | 200 | Retorna cuenta bancaria activa; incluye metodo de pago, banco y cuenta. |
| `GET /search/api/search-engines/employees` | `X-Tenant-Id` + subscription key | 200 | Retorna colaboradores con `fileNumber`, nombres, documento, `idPerson`, `hireDate` y `additionalAttributes.IdEmployee`. |
| `GET /organization/api/structure-types` | `X-Tenant-Id` + subscription key | 200 | Retorna 73 tipos de estructura; sirve para identificar empresa/sede/centro costo/area/cargo. |
| `GET /organization/api/organization-models` | `X-Tenant-Id` + subscription key | 200 | Retorna 1 modelo organizacional. |
| `GET /organization/api/position` | `X-Tenant-Id` + subscription key | 200 | Retorna 283 posiciones/cargos. |
| `GET /organization/api/grade` | `X-Tenant-Id` + subscription key | 200 | Retorna grados. |
| `GET /organization/api/payment-methods` | `X-Tenant-Id` + subscription key | 200 | Retorna 7 formas de pago. |
| `GET /organization/api/payment-types` | `X-Tenant-Id` + subscription key | 200 | Retorna 18 tipos de pago. |
| `GET /organization/api/structures/41/Structures` | `X-Tenant-Id` + subscription key | 200 | Retorna 24 bancos/estructuras bancarias. |
| `GET /contact/api/emails?idEntity={id}&idEntityType=1` | `X-Tenant-Id` + subscription key | 200 | Retorna 2 emails para el colaborador probado. |
| `GET /contact/api/phones?idEntity={id}&idEntityType=1` | `X-Tenant-Id` + subscription key | 404 | Endpoint o entidad sin telefonos validos para la muestra; usar `vlwebapi` como fuente primaria. |
| `GET /Payroll/api/payroll-processes` | `X-Tenant-Id` + subscription key | 200 | Retorna procesos; muestra de 5 procesos con periodo, modelo, fechas y conteos de empleados. |
| `GET /PayrollOperationSettings/api/payroll-concepts` | `X-Tenant-Id` + subscription key | 401 | `NeedPermissions`: falta permiso de producto/rol para catalogo de conceptos. |
| `GET /Payroll/api/payroll-processes/{id}` | `X-Tenant-Id` + subscription key | 401 | `NeedPermissions`: falta permiso de detalle de proceso. |
| `GET /Payroll/api/payroll-processes/{id}/employees` | `X-Tenant-Id` + subscription key | 401 | `NeedPermissions`: falta permiso para empleados de proceso. |
| `GET /Payroll/api/payroll-processes/{id}/employees/{idEmployee}/concepts` | `X-Tenant-Id` + subscription key | 401 | `NeedPermissions`: falta permiso para conceptos liquidados. |
| `GET /Payroll/api/banking-exports` | `X-Tenant-Id` + subscription key | 401 | `NeedPermissions`. |

## Matriz VISMA -> REX+

### Empleados REX+

Cobertura estimada: alta con `vlwebapi`, pendiente homologacion de catalogos REX+.

| Campo REX+ | Fuente VISMA candidata | Estado |
|---|---|---|
| `Id empleado` | `nationalIdentificationNumbers[].number` o `externalId` | Disponible; definir regla RUT oficial. |
| `Nombres` | `firstName`, `middleName` | Disponible. |
| `Apellido paterno` | `lastName` | Disponible. |
| `Apellido materno` | `familyName` | Disponible. |
| `Sexo` | `genre` | Disponible; requiere tabla M/F REX+. |
| `Fecha de nacimiento` | `dateOfBirth` | Disponible. |
| `Estado civil` | `maritalStatus.id/description` | Disponible; requiere homologacion a codigos REX+. |
| `Id nacion` | `nationalities[]`, `countryOfBirth` | Disponible; requiere homologacion. |
| `Email institucional/personal` | `email` o `contact/api/emails` | Disponible con subscription key. |
| `Telefono` | `phones` o `/phones` | Endpoint disponible; muestra sin datos. |
| `Nombre Calle`, `Numero Calle`, `Comuna/Ciudad/Region` | `/addresses` | Disponible; requiere mapeo geografico a IDs REX+. |
| `Id banco`, `Cuenta del banco`, `Id forma de pago` | `/bank-accounts` | Disponible; requiere homologacion bancos/formas REX+. |
| `Fecha inicio contrato` | `hiringDate`, `/phases.startDate` | Disponible. |
| `Fecha termino contrato` | `/phases.endDate` | Disponible si existe. |
| `Tipo del contrato` | `/phases` y/o estructuras | Parcial; confirmar significado de phase/status. |
| `Sueldo base` | `/phases` tipo salary o payroll | Parcial; falta validar detalle de salary. |
| `Cargo`, `Centro costo`, `Sede`, `Area`, `Empresa` | `/structures` | Disponible como historial; requiere identificar `type.id` por cada dimension. |
| `AFP`, `Salud`, `Seguro cesantia` | Payroll/conceptos o campos adicionales | Pendiente; falta encontrar endpoint autorizado o permiso Payroll adicional. |

### Conceptos REX+

Cobertura estimada: media/alta, pero bloqueada por permisos del usuario/API aunque la subscription key ya es valida.

| Campo REX+ | Fuente VISMA candidata | Estado |
|---|---|---|
| `concepto_id` | `PayrollOperationSettings/api/payroll-concepts.id/code` | `NeedPermissions`. |
| `Nombre` | `description/name` | `NeedPermissions`. |
| `Tipo` | metadata de concepto/parametros | `NeedPermissions`; requiere reglas de equivalencia REX+. |
| `Secuencia` | orden/codigo VISMA o regla Transformator | Pendiente de diseno. |
| `Codigo LRE` | metadata de concepto o tabla homologacion | Pendiente; probablemente no viene directo en VISMA. |

### Liquidaciones historicas REX+

Cobertura estimada: alta si se habilitan permisos de detalle Payroll. Hoy solo esta disponible el listado de procesos.

| Campo REX+ | Fuente VISMA candidata | Estado |
|---|---|---|
| `Fecha de proceso` | proceso payroll / periodo | Disponible desde listado de procesos. |
| `Id empleado` | empleado del proceso + documento/RUT | Viable cruzando empleados. |
| `Numero de contrato` | fase/contrato activo | Disponible por `/phases`; confirmar regla. |
| `Id del concepto` | concepto liquidado | `NeedPermissions` en detalle por proceso/empleado. |
| `Monto del concepto` | concepto liquidado por empleado/proceso | `NeedPermissions` en detalle por proceso/empleado. |
| `Dias trabajados` | concepto/parametro payroll o ausencias | Pendiente. |
| `Empresa` | tenant/estructura empresa | Parcial. |
| `Jornada` | estructura/fase/payroll | Pendiente. |

## Decisiones tecnicas recomendadas

1. Implementar `vismaProxy` en Firebase Functions, no en frontend. Estado: implementado para REX+ Empleados.
2. Separar clientes HTTP por familia:
   - `vlwebapiadmin`: login, tenants, roles.
   - `vlwebapi`: empleados y subrecursos con `X-RAET-Tenant-Id`.
   - servicios modernos: `People`, `Organization`, `Payroll`, `Contact`, `Search` con `X-Tenant-Id` y subscription key.
3. Construir primero el exportador REX+ Empleados usando `vlwebapi`, `Search`, `Organization` y `Contact emails`.
4. Mantener Conceptos y Liquidaciones historicas como fase 2 hasta que VISMA habilite permisos de detalle Payroll.
5. Guardar una tabla de homologacion editable para:
   - genero
   - estado civil
   - nacionalidad
   - bancos
   - formas de pago
   - tipos de estructura VISMA -> empresa/sede/centro costo/area/cargo
   - conceptos VISMA -> conceptos REX+

## Proximo experimento

Pedir a VISMA/cliente que habilite permisos para estas rutas o roles equivalentes:

- `PayrollOperationSettings/api/payroll-concepts`
- `Payroll/api/payroll-processes/{idProcess}`
- `Payroll/api/payroll-processes/{idProcess}/employees`
- `Payroll/api/payroll-processes/{idProcess}/employees/{idEmployee}/concepts`

Con eso se puede cerrar si el modulo genera conceptos y libros historicos sin exportaciones manuales.
