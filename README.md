# Cargador Universal de Empleados

App client-side en React + Vite + Tailwind + SheetJS para transformar archivos Excel de Talana a BUK Colaboradores y BUK Trabajos, sin backend.

## Stack

- React 18
- Vite 5
- Tailwind CSS
- SheetJS (`xlsx`)
- Persistencia local con `localStorage`
- Deploy en GitHub Pages

## Flujo funcional

1. Seleccionar origen `Talana` y destino `BUK`
2. Subir archivo `.xls` o `.xlsx`
3. Validar columnas clave Talana
4. Responder 3 preguntas globales del wizard
5. Ejecutar transformación campo a campo
6. Revisar advertencias de matching
7. Descargar:
   - todos los registros
   - solo filas limpias
8. Guardar, cargar, exportar o importar configuraciones

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
