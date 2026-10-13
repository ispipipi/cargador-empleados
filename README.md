# Transformator

App en React + Vite + Tailwind + SheetJS para preparar cargas de Meta 4 y VISMA hacia REX+, además de flujos Talana → BUK.

## Stack

- React 18
- Vite 5
- Tailwind CSS
- SheetJS (`xlsx`)
- Persistencia local con `IndexedDB` y `localStorage`
- Backend opcional con Firebase Authentication, Firestore y Storage
- Deploy en GitHub Pages

## Backend Firebase

La app funciona localmente sin backend, pero permite activar memoria cloud privada por usuario.

1. Crea un proyecto en Firebase.
2. Activa `Authentication → Google`.
3. Crea Firestore en modo producción.
4. Activa Firebase Storage.
5. Copia `.env.example` a `.env` y completa la configuración web del proyecto.
6. Agrega `https://ispipipi.github.io` y `http://localhost:5173` en `Authentication → Settings → Authorized domains`.
7. Publica las reglas desde la raíz del repo:

```bash
firebase login --reauth
firebase use TU_PROJECT_ID
firebase deploy --only firestore:rules,storage
```

Las reglas de `firestore.rules` y `storage.rules` restringen cada carga y mapeo al usuario autenticado que lo creó. Nunca se debe subir `.env` al repositorio.

## Conector VISMA API

El módulo `VISMA API` consulta VISMA vía backend usando secretos guardados en Firebase Functions. La pantalla no pide usuario, password ni subscription key: solo valida la conexión, permite elegir la empresa VISMA y deja seleccionar si se traerán empleados o libros históricos.

```bash
firebase functions:secrets:set VISMA_USERNAME
firebase functions:secrets:set VISMA_PASSWORD
firebase functions:secrets:set VISMA_SUBSCRIPTION_KEY
firebase deploy --only functions
```

Para GitHub Pages, configura `VITE_VISMA_API_BASE_URL` con la URL base del proxy desplegado. El proxy expone `vismaProxy`, autentica contra VISMA, lista tenants/empresas disponibles y consulta:

- `vlwebapiadmin/account/tenants`
- `vlwebapi/employees`
- ficha, direcciones, teléfonos, fases, estructuras y cuentas bancarias por empleado
- `search/api/search-engines/employees`
- `organization/api/structure-types`, `position`, `payment-methods`, `payment-types`
- `organization/api/structures/41/Structures`
- `contact/api/emails`
- `Payroll/api/payroll-processes`

El conector ya permite generar REX+ Empleados por empresa seleccionada. En libros históricos ya lista procesos Payroll; el detalle de liquidaciones queda condicionado a que VISMA habilite permisos para conceptos y detalle de procesos, porque el usuario probado responde `NeedPermissions` en esas rutas.

## Flujo funcional

1. Seleccionar un grupo y el flujo correspondiente
2. Elegir origen y destino
3. Subir archivo `.xls` o `.xlsx` cuando el módulo lo requiera
4. Responder el wizard de parámetros cuando corresponda
5. Ejecutar transformación campo a campo
6. Revisar advertencias y no-match con corrección masiva
7. Descargar:
   - todos los registros
   - solo filas limpias
8. Guardar, cargar, exportar o importar configuraciones

## Módulo Conceptos

El módulo `Conceptos` usa tres maestros embebidos en `public/concepts/`:

- `lista-conceptos.xlsx`: catálogo actual de REX+.
- `lre-mapeo-general.xlsx`: mapeo Meta 4 → REX+ del cliente.
- `ejemplo-importacion-conceptos.xlsx`: estructura de salida y hojas de opciones.

El flujo identifica matches exactos, propone conceptos nuevos cuando no hay coincidencia, permite asignar otro concepto REX+ existente, aprobar en forma masiva y descargar:

- `REX_conceptos_YYYY-MM-DD.xlsx`: planilla lista para importar.
- `REX_informe_conceptos_YYYY-MM-DD.xlsx`: trazabilidad de matches, altas, exclusiones y advertencias.

Los registros marcados como `NO APLICA` se excluyen del archivo de carga, pero se mantienen en el informe final.

## Módulo Conceptos históricos

`Carga de libros históricos` ofrece tres flujos independientes: Meta 4 → REX+ Liquidaciones en Detalle, VISMA → REX+ Liquidaciones Detalle y Talana → BUK Liquidaciones Históricas. Cada flujo tiene su parser, memoria de mapeos y formato de salida propios; no reutilizar reglas de un origen en otro sin validar el formato y el alcance de empresa.

Meta 4 → REX+ recibe el libro mensual, compara conceptos con el catálogo autorizado y las decisiones guardadas, y valida colaboradores contra el maestro REX+ disponible. La revisión permite confirmar pareos, propuestas, exclusiones y altas. Antes de descargar valida el formato de salida y la cuadratura del líquido; el reporte permite ubicar diferencias y pendientes.

El archivo de carga Meta 4 → REX+ es CSV UTF-8 con BOM y separador `;`, basado en las columnas de la plantilla oficial de Liquidaciones en Detalle. La carga se puede fraccionar por trabajadores; los lotes marcados como realizados se descuentan para evitar duplicar cargas, y un lote fallido se puede descargar de nuevo.

VISMA → REX+ prepara el ámbito de empresa, catálogo REX+, template de Liquidación Detalle y libro del período en un paso de configuración propio. Los pareos se guardan dentro del ámbito elegido para no mezclar catálogos entre empresas.

## Template embebido

La app usa un template BUK Colaboradores embebido en:

`public/templates/buk-colaboradores-template.xlsx`

Y una base de listas para BUK Trabajos en:

`public/templates/buk-trabajos-lists.xlsx`

Ese archivo es la fuente de:

- headers de salida
- hoja `Listas`
- estructura final del libro exportado

## Desarrollo local

```bash
npm install
npm run proxy:geovictoria
npm run dev
```

Abre la URL que entregue Vite, normalmente `http://localhost:5173/cargador-empleados/` o `http://localhost:5173/`.

El módulo `GeoVictoria` necesita un proxy backend para proteger el secreto de API. En local, `npm run proxy:geovictoria` expone `http://127.0.0.1:8787/api/geovictoria/payroll-preview`, y Vite redirige `/api/geovictoria` hacia ese proceso.

En GitHub Pages no puede correr ese proxy porque el sitio es estático. Para usar GeoVictoria en producción se usa la Cloud Function `geovictoriaProxy` y las credenciales se guardan como secretos de Firebase, no en Git:

1. Configura `GEOVICTORIA_API_KEY` y `GEOVICTORIA_API_SECRET` con `firebase functions:secrets:set`.
2. Despliega las Functions con `firebase deploy --only functions`.
3. Agrega el secret `VITE_GEOVICTORIA_API_BASE_URL` en GitHub con la URL base de la Function.
4. Ejecuta nuevamente el workflow de Pages o haz push a `main`.

El proxy filtra GeoVictoria para considerar solo estas razones sociales:

- `COMERCIAL PROGRESO SPA`
- `KAIPOKI SPA`
- `SANTIAGO FBO SPA`

## Validaciones

```bash
npm run lint
npm run build
```

## Deploy en GitHub Pages

La configuración ya viene preparada:

- `vite.config.js` usa `base: '/cargador-empleados/'`
- `.github/workflows/deploy.yml` construye y publica `dist` en GitHub Pages al hacer push a `main`

URL esperada:

`https://ispipipi.github.io/cargador-empleados/`

## Estructura principal

La guía completa de módulos, recorrido de datos y puntos de extensión está en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Resume dónde implementar cambios por origen, destino, pantalla, persistencia o integración backend, y las convenciones para mantener los módulos debajo de 700 líneas.

Puntos de entrada principales:

- `src/main.jsx`: aplicación principal Transformator.
- `src/geovictoria-main.jsx`: aplicación GeoVictoria independiente.
- `functions/index.js`: exportaciones públicas de Cloud Functions.

Las reglas de formato por origen están en `src/connectors/origins/`; las transformaciones de destino en `src/connectors/destinations/`; las reglas compartidas del flujo en `src/lib/`; la UI en `src/components/`.

## Notas

- No se guardan datos de empleados en `localStorage`, solo configuraciones.
- Las listas controladas se resuelven contra la hoja `Listas` del template embebido.
- Si un valor no encuentra match, el campo se deja vacío y queda reportado en el resumen final.
