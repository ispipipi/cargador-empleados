# Arquitectura y guía para desarrollo

Este documento describe la estructura vigente de Transformator y señala dónde continuar al modificar un flujo. La regla principal es mantener separadas la interfaz, la orquestación, las reglas del negocio y los conectores de cada sistema.

## Recorrido de una carga

1. `src/main.jsx` inicia la aplicación principal; `src/geovictoria-main.jsx` inicia la aplicación independiente de GeoVictoria.
2. `src/App.jsx` mantiene el estado del flujo, selecciona origen/destino/módulo y conecta acciones con la interfaz. La composición de pantallas vive en `src/components/AppFlowContent.jsx`.
3. Los componentes de `src/components/` muestran pasos, revisiones y resultados. No deberían contener reglas de negocio extensas ni acceso directo a servicios externos.
4. `src/lib/appUploadActions.js`, `appResultActions.js` y `appConfigurationActions.js` contienen acciones de carga, transformación/descarga y configuración. `useAppTemplates.js` carga los templates iniciales.
5. `src/connectors/origins/` define formatos de entrada y sus validaciones. `src/connectors/destinations/` transforma hacia el sistema de destino.
6. `src/engine/` contiene utilidades genéricas de transformación y matching que no pertenecen a un sistema particular.
7. `src/workers/sourceParser.worker.js` procesa archivos de origen en un Web Worker para no bloquear la interfaz.

## Mapa de carpetas

```text
src/
  App.jsx                         Orquestador del flujo principal
  components/                     UI por paso y revisión
  connectors/
    origins/                      Formatos, columnas y validaciones de origen
    destinations/                 Transformaciones por sistema de destino
  engine/                         Transformación y matching reutilizables
  lib/                            Persistencia, archivos, memoria y reglas de flujos
    concepts/                     Parsers e identificadores de conceptos
    historicalConcepts/           Matching, exportación y soporte histórico
    talanaHistorical/             Reglas y catálogo del libro histórico Talana
  workers/                        Lectura pesada fuera del hilo de UI
functions/                        Backend desplegable en Firebase Functions
  visma/                           Proxy VISMA separado por recurso/responsabilidad
proxy/                             Proxies para desarrollo local
public/                            Templates, catálogos y opciones de referencia
scripts/                           Utilidades puntuales de análisis/mantenimiento
docs/                              Arquitectura, decisiones y descubrimientos técnicos
```

## Flujos de producto

La selección visible se define en `MODULE_GROUPS` y `MODULE_OPTIONS` de `src/components/FormatSelector.jsx`. Mantener esas opciones y el enrutamiento de `src/components/AppFlowContent.jsx` alineados al agregar o renombrar un flujo.

| Grupo | Flujo | Entrada de UI y revisión | Reglas principales |
|---|---|---|---|
| Carga de empleados | Meta 4 → REX+ | `FormatSelector.jsx`, `AppFlowContent.jsx`, `TransformResult.jsx` | `connectors/origins/meta4.js`, `connectors/destinations/rex_empleados.js` |
| Carga de empleados | VISMA → REX+ y maestros VISMA | `VismaSidebar.jsx`, `VismaWorkspaceProvider.jsx`, `VismaEmployeesReview.jsx` | `lib/vismaEmployees.js`, `lib/vismaMasters.js`, `functions/visma/` |
| Carga de libros históricos | Meta 4 → REX+ Liquidaciones en Detalle | `HistoricalConceptsMapper.jsx` y paneles `HistoricalConcepts*` | `lib/historicalConcepts.js`, `lib/historicalConcepts/`, catálogo y template REX+ |
| Carga de libros históricos | VISMA → REX+ Liquidaciones Detalle | `VismaHistoricalSetup.jsx`, `VismaHistoricalMapper.jsx` | `lib/vismaHistorical.js`, `functions/visma/` |
| Carga de libros históricos | Talana → BUK Liquidaciones Históricas | `TalanaHistoricalMapper.jsx` | `lib/talanaHistorical.js`, `lib/talanaHistorical/` |
| Carga de conceptos | Meta 4 → REX+ Conceptos | `ConceptsMapper.jsx` | `lib/concepts.js`, `lib/concepts/` |

GeoVictoria tiene una entrada web separada (`geovictoria/index.html`) que usa `src/geovictoria-main.jsx`; comparte utilidades y componentes cuando corresponde, pero su proxy de desarrollo y Cloud Function deben seguir separados.

## Dónde cambiar cada cosa

| Necesidad | Punto de partida | Mantener fuera de |
|---|---|---|
| Aceptar un nuevo formato de entrada | `src/connectors/origins/` y el parser correspondiente en `src/lib/` | Componentes React |
| Cambiar campos/reglas de salida BUK | `src/connectors/destinations/buk_colaboradores.js` o `buk_trabajos.js` | `App.jsx` |
| Cambiar reglas Meta 4 → REX+ Empleados | `src/connectors/destinations/rex_empleados.js` y sus helpers del mismo subdirectorio | UI de revisión |
| Cambiar el mapeo de conceptos | `src/lib/concepts/` y `src/components/ConceptsMapper.jsx` | Adaptadores de empleados |
| Cambiar libros históricos | Módulo correspondiente en `src/lib/historicalConcepts/`, `src/lib/talanaHistorical/` o `src/lib/vismaHistorical.js` | Un único componente monolítico |
| Añadir una pantalla o mejorar revisión | Componente correspondiente en `src/components/` | Conectores y persistencia |
| Cambiar memoria local/cloud | `src/lib/storage.js`, `sessionPersistence.js`, `cloudMemory.js` y `firebase.js` | Componentes que escriben directamente en Firestore |
| Cambiar integración VISMA | `functions/visma/` y el cliente de `src/lib/visma*.js` | Frontend con secretos o credenciales |
| Cambiar integración GeoVictoria | `functions/geovictoria.js`, `src/lib/geovictoria.js` y `proxy/geovictoria-proxy.mjs` | El proxy VISMA |

### REX+ Empleados

`src/connectors/destinations/rex_empleados.js` conserva el flujo público y coordina la construcción de filas. Las reglas auxiliares están separadas por tema:

- `catalogs.js`: aliases, defaults y reglas de catálogo.
- `normalizers.js` y `catalogMatching.js`: normalización y matching de catálogos.
- `fieldResolvers.js`: resolución de campos individuales.
- `geography.js` y `geographyResolvers.js`: parsing, catálogos y reglas geográficas.
- `contractValues.js`: fechas, sedes, contrato, RUT, teléfono y formatos.
- `employeeValues.js`: estado, sexo, previsión, jornada y otros valores del empleado.
- `pending.js`: estructura de pendientes y correcciones intencionales en blanco.

Al cambiar este conector, conserva la interfaz exportada que consumen `App.jsx` y los componentes de revisión; ejecuta lint y build, y verifica que las correcciones sigan generando el mismo resultado.

## Convenciones para mantenerlo entendible

- Objetivo: máximo 700 líneas por archivo fuente activo. Si se acerca al límite, dividir por responsabilidad antes de añadir otra regla.
- Un módulo debe depender de capas inferiores; evitar ciclos entre `components`, `lib` y `connectors`.
- `App.jsx` conecta estados y acciones, pero las reglas de un sistema viven en su conector o módulo de dominio.
- Compartir helpers solo si tienen semántica realmente común. No crear un `utils.js` genérico para reglas específicas de BUK, REX+ o VISMA.
- Mantener templates y catálogos de referencia en `public/`; documentar nombre, origen y forma de actualización cuando cambien.
- Los archivos con sufijos como ` 2.js` o ` 2.jsx` no se deben importar como módulos activos. Revisar su procedencia antes de archivarlos o eliminarlos.
- No guardar credenciales ni datos sensibles en el frontend, `public/`, logs, scripts versionados o `.env` compartido. Para Firebase Functions, usar Secret Manager.
- Preferir nombres de funciones descriptivos y exports explícitos entre módulos.

## Desarrollo y comprobaciones

Desde la raíz del proyecto:

```bash
npm install
npm run dev
npm run lint
npm run build
```

Para GeoVictoria en local, iniciar también `npm run proxy:geovictoria`. Las Functions tienen dependencias propias dentro de `functions/`; al cambiar backend, instalar allí y validar el despliegue de forma independiente.

Las dependencias del frontend se declaran en `package.json`; las Cloud Functions tienen su propio `functions/package.json` y lockfile. No mezclar instalaciones ni actualizar ambos manifiestos sin una razón concreta.

Antes de entregar un cambio, revisar `git diff --check`, `git status` y no incluir archivos de entrada/salida de nómina, credenciales ni catálogos de cliente que no deban versionarse.
