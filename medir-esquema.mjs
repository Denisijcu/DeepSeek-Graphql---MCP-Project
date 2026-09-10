// medir-esquema.mjs
//
// Capitulo 8: cuanto ocupa el esquema de cada fuente.
//
//   node medir-esquema.mjs
//
// No modifica nada. Monta el esquema de cada fuente y mide lo que
// ocuparia si hubiera que enviarselo al modelo.

import { printSchema } from 'graphql';
import { createDynamicSchema } from './dist/graphql/schema.js';
import { CSVAdapter } from './dist/adapters/csv-adapter.js';
import { SQLiteAdapter } from './dist/adapters/sqlite-adapter.js';
import { GoogleSheetsAdapter } from './dist/adapters/google-sheets-adapter.js';
import 'dotenv/config';

// Regla del pulgar: 4 caracteres por token. No hace falta precision,
// el orden de magnitud es el argumento.
const tokens = (s) => Math.round(s.length / 4);

function fila(nombre, sdl, campos) {
  return {
    fuente: nombre,
    campos,
    caracteres: sdl.length,
    lineas: sdl.split('\n').length,
    tokens: tokens(sdl),
  };
}

const resultados = [];

// ---------- CSV ----------
let csvAdaptador = null;
try {
  csvAdaptador = new CSVAdapter(
    process.env.CSV_FILE_PATH || './src/data/sample.csv'
  );
  await csvAdaptador.initialize();
  const sdl = printSchema(createDynamicSchema(csvAdaptador));
  resultados.push(fila('CSV', sdl, Object.keys(csvAdaptador.getSchema()).length));
} catch (e) {
  console.error('CSV no disponible:', e.message);
}

// ---------- SQLite ----------
try {
  const sqlite = new SQLiteAdapter(
    process.env.SQLITE_DB_PATH || './src/data/sample.db',
    process.env.SQLITE_TABLE || 'empleados'
  );
  await sqlite.initialize();
  const sdl = printSchema(createDynamicSchema(sqlite));
  resultados.push(fila('SQLite', sdl, Object.keys(sqlite.getSchema()).length));
} catch (e) {
  console.error('SQLite no disponible:', e.message);
}

// ---------- Google Sheets ----------
try {
  if (process.env.GOOGLE_SHEETS_API_URL) {
    // El constructor recibe un objeto de configuracion, no una URL suelta.
    const sheets = new GoogleSheetsAdapter(
      { apiUrl: process.env.GOOGLE_SHEETS_API_URL },
      process.env.GOOGLE_SHEETS_NAME || 'Empleados'
    );
    await sheets.initialize();
    const sdl = printSchema(createDynamicSchema(sheets));
    resultados.push(fila('GoogleSheets', sdl, Object.keys(sheets.getSchema()).length));
  } else {
    console.error('Google Sheets: falta GOOGLE_SHEETS_API_URL en el .env');
  }
} catch (e) {
  console.error('Google Sheets no disponible:', e.message);
}

// ---------- Informe ----------
console.log('\n' + '='.repeat(64));
console.log(' COSTE DEL ESQUEMA POR FUENTE');
console.log('='.repeat(64));
console.log(
  'Fuente'.padEnd(14) + 'Campos'.padStart(7) +
  'Caract.'.padStart(10) + 'Lineas'.padStart(8) + 'Tokens'.padStart(9)
);
console.log('-'.repeat(64));

for (const r of resultados) {
  console.log(
    r.fuente.padEnd(14) +
    String(r.campos).padStart(7) +
    String(r.caracteres).padStart(10) +
    String(r.lineas).padStart(8) +
    String(r.tokens).padStart(9)
  );
}

const suma = resultados.reduce((s, r) => s + r.tokens, 0);
console.log('-'.repeat(64));
console.log('Suma de las tres'.padEnd(21) + String(suma).padStart(27));

console.log('\nUNA fuente activa a la vez: el modelo ve el mayor de esos numeros.');
console.log('Las SIETE a la vez: la suma, y con las cuatro de base de datos');
console.log('el numero seria bastante mayor.\n');

// ---------- Lo que pesa dentro del esquema ----------
if (csvAdaptador) {
  const sdl = printSchema(createDynamicSchema(csvAdaptador));

  console.log('='.repeat(64));
  console.log(' DE QUE SE COMPONE (fuente CSV)');
  console.log('='.repeat(64));

  const bloques = sdl.split(/\n(?=type |input |enum |scalar |directive )/);
  const medidos = bloques
    .map((b) => {
      const cabecera = (b.split('\n')[0] || '').trim().slice(0, 46);
      return { cabecera, tokens: tokens(b) };
    })
    .sort((a, b) => b.tokens - a.tokens);

  for (const m of medidos) {
    console.log(String(m.tokens).padStart(6) + '  ' + m.cabecera);
  }

  console.log('\n' + '='.repeat(64));
  console.log(' ARGUMENTOS DE records');
  console.log('='.repeat(64));

  // Este bloque estaba escrito A MANO y afirmaba que cada campo se podia
  // filtrar de dos maneras. Al quitar los argumentos duplicados del
  // esquema, el texto siguio diciendolo: no medía nada.
  //
  // Es el mismo fallo que se arreglo en get_schema (dos fuentes de verdad),
  // cometido en el propio script que mide ese capitulo. Ahora se cuenta
  // del esquema.
  const tipoQuery = createDynamicSchema(csvAdaptador).getQueryType();
  const records = tipoQuery?.getFields()['records'];
  const campos = Object.keys(csvAdaptador.getSchema());

  if (records) {
    console.log(`Campos de la fuente: ${campos.length}`);
    console.log(`Argumentos de records: ${records.args.length}`);
    for (const a of records.args) {
      console.log(`   ${a.name.padEnd(14)} ${String(a.type)}`);
    }

    const sueltos = records.args.filter((a) => campos.includes(a.name));
    console.log(
      sueltos.length > 0
        ? `\nDUPLICADO: ${sueltos.length} argumento(s) repiten campos que where ` +
          `ya cubre: ${sueltos.map((a) => a.name).join(', ')}`
        : `\nSin duplicados: los campos solo se filtran por where.`
    );
  }
}

process.exit(0);
