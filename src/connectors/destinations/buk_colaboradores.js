import {
  cleanCell,
  formatIsoDate,
  normalizeText,
  parseAntiquityYears,
  parseCurrencyLikeValue,
  titleCase,
  yesNoFromPensionStatus,
} from '../../lib/utils';

const REGION_ALIASES = {
  'de tarapaca': 'I: de Tarapacá',
  'de antofagasta': 'II: de Antofagasta',
  'de atacama': 'III: de Atacama',
  'de coquimbo': 'IV: de Coquimbo',
  'de valparaiso': 'V: de Valparaíso',
  "del libertador gral. bernardo o'higgins": "VI: del Libertador Gral. Bernardo O'Higgins",
  'del libertador bernardo ohiggins': "VI: del Libertador Gral. Bernardo O'Higgins",
  'del maule': 'VII: del Maule',
  'del biobio': 'VIII: del Biobío',
  'del bio bio': 'VIII: del Biobío',
  'de la araucania': 'IX: de la Araucanía',
  'de los lagos': 'X: de Los Lagos',
  'de aysen': 'XI: de Aysén del Gral. Carlos Ibáñez del Campo',
  'de aysen del gral. carlos ibanez del campo': 'XI: de Aysén del Gral. Carlos Ibáñez del Campo',
  'de magallanes y de la antartica chilena': 'XII: de Magallanes y de la Antártica Chilena',
  'metropolitana': 'RM: Metropolitana de Santiago',
  'metropolitana de santiago': 'RM: Metropolitana de Santiago',
  'de los rios': 'XIV: de Los Ríos',
  'de arica y parinacota': 'XV: de Arica y Parinacota',
  'de nuble': 'XVI: de Ñuble',
};

const BANK_ALIASES = {
  bancoestado: 'Banco Estado',
  santander: 'Banco Santander',
  'banco falabella': 'Falabella',
  coopeuch: 'COOPEUCH',
  'banco ripley': 'Ripley',
  itau: 'Itau',
  bci: 'BCI',
  bbva: 'BBVA',
  'banco chile': 'Banco de Chile',
  scotiabank: 'Scotiabank',
};

const AFP_ALIASES = {
  provida: 'ProVida',
  planvital: 'PlanVital',
  habitat: 'Habitat',
  capital: 'Capital',
  modelo: 'Modelo',
  uno: 'Uno',
};

const MARITAL_STATUS_ALIASES = {
  soltera: 'Soltero',
  soltero: 'Soltero',
  casada: 'Casado',
  casado: 'Casado',
  viuda: 'Viudo',
  viudo: 'Viudo',
  divorciada: 'Divorciado',
  divorciado: 'Divorciado',
};

export const bukColaboradoresDestination = {
  id: 'buk',
  nombre: 'BUK',
  hojaTemplate: 'Empleados',
  hojaListas: 'Listas',
  assetPath: 'templates/buk-colaboradores-template.xlsx',
  userParameters: [
    {
      key: 'rolPrivado',
      label: 'Rol Privado*',
      question: '¿Rol privado por defecto?',
      helperText: 'Se aplicará a todos los colaboradores de esta transformación.',
      suggestedValue: 'Sí',
      options: ['Sí', 'No'],
    },
    {
      key: 'aumentarCotizacion',
      label: 'Aumentar la cotización en 1%*',
      question: '¿Aumentar cotización en 1% por defecto?',
      helperText: 'Este valor se usa globalmente en el archivo de salida.',
      suggestedValue: 'No',
      options: ['Sí', 'No'],
    },
    {
      key: 'regimenPrevisionalDefault',
      label: 'Régimen Previsional por defecto',
      question: '¿Régimen previsional por defecto cuando no hay AFP?',
      helperText: 'Se usará solo para filas donde Talana no informe AFP.',
      suggestedValue: 'No Cotiza',
      options: ['AFP', 'No Cotiza', 'IPS (Ex-INP)'],
    },
  ],
};

export function getDefaultParameterValues() {
  return bukColaboradoresDestination.userParameters.reduce((defaults, parameter) => {
    defaults[parameter.key] = parameter.suggestedValue;
    return defaults;
  }, {});
}

export function getBukColaboradoresFieldDefinitions() {
  return [
    { target: 'Tipo de Documento', listName: 'Tipo de Documento', resolve: () => 'RUT' },
    { target: 'Número de Documento*', resolve: ({ row }) => row.RUT },
    { target: 'Apellido*', resolve: ({ row }) => row['Apellido Paterno'] },
    { target: 'Segundo Apellido', resolve: ({ row }) => row['Apellido Materno'] },
    { target: 'Nombre*', resolve: ({ row }) => row.Nombre },
    { target: 'Sexo*', listName: 'Sexo*', resolve: ({ row }) => cleanCell(row.Sexo).toUpperCase() },
    { target: 'Nacionalidad*', listName: 'Nacionalidad*', resolve: ({ row }) => titleCase(row.Nacionalidad) },
    { target: 'Fecha de Nacimiento*', resolve: ({ row }) => formatIsoDate(row['Fecha nacimiento']) },
    {
      target: 'Estado Civil*',
      listName: 'Estado Civil*',
      resolve: ({ row }) => {
        const normalized = normalizeText(row['Estado Civíl']);
        return MARITAL_STATUS_ALIASES[normalized] ?? titleCase(row['Estado Civíl']);
      },
    },
    {
      target: 'Dirección*',
      resolve: ({ row }) => [cleanCell(row.Calle), cleanCell(row.Número)].filter(Boolean).join(' ').trim(),
    },
    {
      target: 'Región*',
      listName: 'Región',
      resolve: ({ row }) => {
        const normalized = normalizeText(row.Región);
        return REGION_ALIASES[normalized] ?? cleanCell(row.Región);
      },
    },
    { target: 'Comuna*', listName: 'Comuna', resolve: ({ row }) => titleCase(row.Comuna) },
    { target: 'Ciudad', resolve: ({ row }) => titleCase(row.Ciudad) },
    { target: 'Teléfono Particular', resolve: ({ row }) => cleanCell(row.Celular) },
    { target: 'Email', resolve: ({ row }) => cleanCell(row.Email) },
    { target: 'Email Personal', resolve: ({ row }) => cleanCell(row['Email Personal']) },
    { target: 'Calle', resolve: ({ row }) => cleanCell(row.Calle) },
    { target: 'Número de Calle', resolve: ({ row }) => cleanCell(row.Número) },
    { target: 'Depto / Oficina', resolve: ({ row }) => cleanCell(row.Departamento) },
    { target: 'Código de Ficha*', resolve: () => 'F1' },
    { target: 'Ingreso Compañía*', resolve: ({ row }) => formatIsoDate(row['Fecha de Ingreso']) },
    { target: 'Rol Privado*', listName: 'Rol Privado*', resolve: ({ parameters }) => parameters.rolPrivado },
    { target: 'Fecha de Inicio Cotización AFC', resolve: ({ row }) => formatIsoDate(row['Fecha de Ingreso']) },
    { target: 'Fecha Reconocimiento de Antigüedad', resolve: ({ row }) => formatIsoDate(row['Fecha de Ingreso']) },
    { target: 'Fecha Inicio Vacaciones Progresivas', resolve: ({ row }) => formatIsoDate(row['Fecha de Ingreso']) },
    {
      target: 'Forma de Pago*',
      listName: 'Forma de Pago*',
      resolve: ({ row }) => {
        const paymentMethod = cleanCell(row['Forma de Pago']);
        return normalizeText(paymentMethod) === 'transferencia' ? 'Transferencia Bancaria' : paymentMethod;
      },
    },
    {
      target: 'Banco',
      listName: 'Banco',
      resolve: ({ row }) => {
        const normalized = normalizeText(row['Sueldo - Banco']);
        return BANK_ALIASES[normalized] ?? cleanCell(row['Sueldo - Banco']);
      },
    },
    { target: 'Tipo de Cuenta', listName: 'Tipo de Cuenta', resolve: () => 'Vista' },
    { target: 'Número de Cuenta', resolve: ({ row }) => cleanCell(row['Sueldo - Cuenta Corriente']) },
    { target: 'Periodo de Pago', listName: 'Periodo de Pago', resolve: () => 'Mensual' },
    { target: 'Anticipo de Remuneración', listName: 'Anticipo de Remuneración', resolve: () => 'Sin anticipo' },
    {
      target: 'Régimen Previsional*',
      listName: 'Régimen Previsional*',
      resolve: ({ row, parameters }) => (cleanCell(row.AFP) ? 'AFP' : parameters.regimenPrevisionalDefault),
    },
    {
      target: 'Fondo de Cotización',
      listName: 'Fondo de Cotización',
      resolve: ({ row }) => {
        const normalized = normalizeText(row.AFP);
        return AFP_ALIASES[normalized] ?? cleanCell(row.AFP);
      },
      allowBlank: true,
    },
    {
      target: 'Aumentar la cotización en 1%*',
      listName: 'Rol Privado*',
      resolve: ({ parameters }) => parameters.aumentarCotizacion,
    },
    {
      target: 'Fonasa/Isapre*',
      listName: 'Fonasa/Isapre*',
      resolve: ({ row }) => cleanCell(row.Isapre) || 'Fonasa',
    },
    {
      target: 'Plan Isapre UF*',
      resolve: ({ row }) => (normalizeText(row['Moneda Isapre']) === 'uf' ? parseCurrencyLikeValue(row['Monto Pactado Isapre']) : '0'),
    },
    {
      target: 'Plan Isapre Pesos*',
      resolve: ({ row }) => (cleanCell(row['Moneda Isapre']) === '$' ? parseCurrencyLikeValue(row['Monto Pactado Isapre']) : '0'),
    },
    {
      target: 'Plan Isapre Porcentual*',
      resolve: ({ row }) => (cleanCell(row['Moneda Isapre']) === '%' ? parseCurrencyLikeValue(row['Monto Pactado Isapre']) : '0'),
    },
    {
      target: 'AFC*',
      listName: 'AFC*',
      resolve: ({ row }) => (parseAntiquityYears(row.Antigüedad) >= 11 ? 'Más de 11 Años' : 'Menos de 11 Años'),
    },
    {
      target: 'Jubilado',
      listName: 'Jubilado',
      resolve: ({ row }) => yesNoFromPensionStatus(row['¿es pensionado?']),
    },
    {
      target: 'Régimen Jubilacion*',
      listName: 'Régimen Jubilacion*',
      resolve: ({ row }) => {
        const isRetired = yesNoFromPensionStatus(row['¿es pensionado?']) === 'Sí';
        return isRetired && cleanCell(row.AFP) ? 'jubilacion_afp: AFP' : 'jubilacion_ips: IPS (Ex-INP)';
      },
    },
    { target: 'Cuenta 2', resolve: () => '' },
    {
      target: 'Moneda',
      listName: 'Moneda*',
      resolve: ({ row }) => (cleanCell(row.Isapre) ? 'UF' : '%'),
    },
    { target: 'En Situación de Discapacidad', listName: 'En Situación de Discapacidad', resolve: () => 'No' },
    { target: 'En Situación de Invalidez', listName: 'En Situación de Invalidez', resolve: () => 'No' },
    {
      target: 'Tramo de Asignación',
      listName: 'Tramo de Asignación',
      resolve: ({ row }) => cleanCell(row['Tramo de Asignación Familiar']),
      allowBlank: true,
    },
    {
      target: 'Tipo de Fuero',
      listName: 'Tipo de Fuero',
      resolve: ({ row }) => cleanCell(row['Tipo de Fuero']),
      allowBlank: true,
    },
    { target: '¿Asignación de sala cuna?', listName: '¿Asignación de sala cuna?', resolve: () => 'No' },
  ];
}
