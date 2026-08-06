# Maper

App client-side en React + Vite + Tailwind + SheetJS para mapear archivos de Meta 4 a REX+ y mantener los flujos Talana → BUK, sin backend.

## Stack

- React 18
- Vite 5
- Tailwind CSS
- SheetJS (`xlsx`)
- Persistencia local con `localStorage`
- Deploy en GitHub Pages

## Flujo funcional

1. Seleccionar el módulo `Empleados`, `Conceptos` o `Conceptos históricos`
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

`Conceptos históricos` recibe el libro de remuneraciones Meta 4 de formato ancho, con los encabezados en la fila 5 y una fila por colaborador. Detecta los conceptos con montos distintos de cero, conserva las columnas repetidas del origen y los compara contra el catálogo actual de REX+.

El flujo permite aprobar matches exactos, asignar una propuesta o cualquier concepto del catálogo en forma individual o masiva, y excluir conceptos que no deban cargarse. Mientras exista un concepto pendiente, el CSV queda bloqueado para evitar una carga incompleta.

La descarga principal es `REX_conceptos_detalle_historicos_YYYY-MM-DD.csv`, en UTF-8 con BOM, encabezados y separador `;`. Usa `M` como origen, `M` como período mensual, acción `C`, y deja fechas, institución, dato adicional, comentario y centro de costo vacíos para que no se inventen datos.

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
npm run dev
```

Abre la URL que entregue Vite, normalmente `http://localhost:5173/cargador-empleados/` o `http://localhost:5173/`.

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

```text
src/
  components/
  connectors/
    destinations/
    origins/
  engine/
  lib/
```

## Notas

- No se guardan datos de empleados en `localStorage`, solo configuraciones.
- Las listas controladas se resuelven contra la hoja `Listas` del template embebido.
- Si un valor no encuentra match, el campo se deja vacío y queda reportado en el resumen final.
