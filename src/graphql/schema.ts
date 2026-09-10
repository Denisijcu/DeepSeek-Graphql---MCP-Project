// src/graphql/schema.ts
import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
  GraphQLInt,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLInputObjectType,
  GraphQLEnumType,
  GraphQLNonNull,
  GraphQLID,
  GraphQLScalarType,
  Kind,
  GraphQLDirective,
} from 'graphql';
import { DataAdapter, FieldType } from '../adapters/base-adapter.js';
import { createResolvers } from './resolvers.js';

// Scalar que acepta cualquier tipo de valor
const AnyScalar = new GraphQLScalarType({
  name: 'Any',
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: (ast) => {
    switch (ast.kind) {
      case Kind.STRING: return ast.value;
      case Kind.INT: return parseInt(ast.value, 10);
      case Kind.FLOAT: return parseFloat(ast.value);
      case Kind.BOOLEAN: return ast.value;
      case Kind.NULL: return null;
      case Kind.LIST: return ast.values.map((v: any) => v.value);
      case Kind.OBJECT: return Object.fromEntries(ast.fields.map((f: any) => [f.name.value, f.value.value]));
      default: return null;
    }
  },
});

export function createDynamicSchema(adapter: DataAdapter, options?: { directives?: GraphQLDirective[] }): GraphQLSchema {
  const schema = adapter.getSchema();
  const resolvers = createResolvers(adapter);

  // ---------- Tipos auxiliares para filtros ----------
  const FilterOperatorType = new GraphQLEnumType({
    name: 'FilterOperator',
    values: {
      eq: { value: 'eq' },
      neq: { value: 'neq' },
      gt: { value: 'gt' },
      gte: { value: 'gte' },
      lt: { value: 'lt' },
      lte: { value: 'lte' },
      contains: { value: 'contains' },
      startsWith: { value: 'startsWith' },
      endsWith: { value: 'endsWith' },
      in: { value: 'in' },
      between: { value: 'between' },
    },
  });

  const FilterInputType = new GraphQLInputObjectType({
    name: 'FilterInput',
    fields: {
      operator: { type: new GraphQLNonNull(FilterOperatorType) },
      value: { type: AnyScalar },
      values: { type: new GraphQLList(AnyScalar) },
    },
  });

  const WhereInputType = new GraphQLInputObjectType({
    name: 'WhereInput',
    fields: () =>
      Object.fromEntries(
        Object.keys(schema).map((key) => [key, { type: FilterInputType }])
      ),
  });

  const OrderByInputType = new GraphQLInputObjectType({
    name: 'OrderByInput',
    description:
      'orderBy espera una LISTA. Ej: orderBy: [{ field: "salario", direction: "desc" }]',
    fields: {
      field: {
        type: new GraphQLNonNull(GraphQLString),
        description: 'Nombre exacto del campo.',
      },
      direction: {
        type: GraphQLString,
        defaultValue: 'asc',
        description: '"asc" o "desc".',
      },
    },
  });

  // ---------- Agregacion ----------
  //
  // Se anadio despues de observar que el modelo, al no encontrar
  // agregaciones, se traia TODOS los registros y calculaba la media el
  // mismo. Los nombres del resultado son FIJOS a proposito: con alias
  // dinamicos el modelo tiene que adivinar como se llamara el campo.
  const AggregateResultType = new GraphQLObjectType({
    name: 'AggregateResult',
    description: 'Resultado de agregar un campo numerico.',
    fields: {
      field: { type: GraphQLString, description: 'Campo agregado.' },
      count: {
        type: GraphQLInt,
        description: 'Filas que pasaron el filtro, con valor o sin el.',
      },
      countNoNulos: {
        type: GraphQLInt,
        description: 'Filas con valor. Base de avg, sum, min y max.',
      },
      sum: { type: GraphQLFloat },
      avg: { type: GraphQLFloat },
      min: { type: GraphQLFloat },
      max: { type: GraphQLFloat },
      aviso: {
        type: GraphQLString,
        description: 'Si viene, transmiteselo al usuario.',
      },
    },
  });

  // ---------- Tipo Record dinámico ----------
  const fields: any = {};
  for (const [fieldName, fieldInfo] of Object.entries(schema)) {
    fields[fieldName] = {
      type: getGraphQLType(fieldInfo),
      description: fieldInfo.description,
    };
  }
  fields._id = { type: GraphQLString, description: 'ID interno' };
  fields._index = { type: GraphQLInt, description: 'Índice del registro' };

  // El nombre del tipo tiene que identificar la FUENTE.
  //
  // Con todas las fuentes generando un tipo llamado "Record", el modelo
  // acumula en su contexto varios esquemas homonimos con campos distintos
  // y no tiene forma de saber cual esta activo. Ese es el motivo de que
  // confundiera la tabla de SQLite con la hoja de Google: para el las dos
  // se llamaban igual.
  const nombreFuente = adapter.getSourceName()
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join('');

  const RecordType = new GraphQLObjectType({
    name: `Record${nombreFuente || 'Generico'}`,
    description:
      `Registro de la fuente activa: ${adapter.getSourceName()}. ` +
      `Campos disponibles: ${Object.keys(schema).join(', ')}.`,
    fields,
  });

  // ---------- Tipo Department fijo ----------
  const DepartmentType = new GraphQLObjectType({
    name: 'Department',
    fields: {
      id: { type: GraphQLID },
      nombre: { type: GraphQLString },
      ubicacion: { type: GraphQLString },
    },
  });

  // ---------- Query ----------
  const QueryType = new GraphQLObjectType({
    name: 'Query',
    fields: {
      records: {
        type: new GraphQLList(RecordType),
        description:
          `Registros de "${adapter.getSourceName()}", la fuente activa. ` +
          `Tras switch_source, vuelve a pedir get_schema: los campos cambian.`,
        args: {
          limit: {
            type: GraphQLInt,
            description: 'Maximo de filas. Por defecto 100.',
          },
          offset: { type: GraphQLInt, description: 'Filas a saltar.' },
          orderBy: { type: new GraphQLList(OrderByInputType) },
          where: { type: WhereInputType },
          // Aqui habia ademas un argumento suelto por cada campo:
          //
          //   ...Object.fromEntries(
          //     Object.keys(schema).map((key) => [key, { type: GraphQLString }])
          //   ),
          //
          // Es decir, cada campo se podia filtrar de DOS maneras: por el
          // argumento suelto y por where. Se pagaba dos veces en el
          // esquema, y el modelo tenia dos caminos para la misma pregunta,
          // que es justo lo contrario de lo que se quiere cuando el
          // problema es que elija bien.
          //
          // where cubre todo lo que hacian los argumentos sueltos y ademas
          // permite operadores. Los sueltos solo permitian igualdad.
        },
        resolve: resolvers.Query.records,
      },
      record: {
        type: RecordType,
        args: { id: { type: new GraphQLNonNull(GraphQLID) } },
        resolve: resolvers.Query.record,
      },
      // ---------- Departamentos ----------
      //
      // Este tipo y su consulta estan escritos A MANO, no salen de la
      // fuente. Antes se declaraban SIEMPRE, incluso en fuentes que no
      // tienen tabla de departamentos: en el CSV, "departamento" es una
      // columna de texto (Ventas, Marketing, IT) y no hay nada que
      // consultar.
      //
      // Ofrecerle al modelo una consulta que en esa fuente no significa
      // nada cuesta tokens y ademas induce a un error que luego hay que
      // depurar. Ahora solo aparece donde existe de verdad.
      ...(typeof (adapter as any).getDataFromSheet === 'function'
        ? {
            departamentos: {
              type: new GraphQLList(DepartmentType),
              description:
                'Departamentos. Solo existe en fuentes con varias hojas.',
              args: {
                limit: { type: GraphQLInt },
                offset: { type: GraphQLInt },
              },
              resolve: resolvers.Query.departamentos,
            },
          }
        : {}),
      stats: {
        type: new GraphQLObjectType({
          name: 'DataStats',
          fields: {
            totalRecords: {
              type: GraphQLInt,
              description: 'Numero total de registros en la fuente.',
            },
            source: { type: GraphQLString, description: 'Nombre de la fuente activa.' },
            fields: { type: GraphQLString, description: 'Campos disponibles.' },
          },
        }),
        description:
          'Resumen de la fuente. USA ESTO para "cuantos registros hay": ' +
          'devuelve totalRecords sin traerse las filas.',
        resolve: resolvers.Query.stats,
      },

      aggregate: {
        type: AggregateResultType,
        description:
          'count, sum, avg, min y max de un campo numerico, con filtro opcional. ' +
          'USA ESTO para medias, sumas y maximos en vez de traerte los registros. ' +
          'Ej: { aggregate(field: "salario") { avg max countNoNulos aviso } }',
        args: {
          field: {
            type: new GraphQLNonNull(GraphQLString),
            description: 'Campo a agregar. Debe existir en el esquema.',
          },
          where: { type: WhereInputType },
        },
        resolve: resolvers.Query.aggregate,
      },
    },
  });

  // ---------- Mutation ----------
  const RecordInputType = new GraphQLInputObjectType({
    name: 'RecordInput',
    fields: () =>
      Object.fromEntries(
        Object.keys(schema).map((key) => [key, { type: AnyScalar }])
      ),
  });

  const MutationType = new GraphQLObjectType({
    name: 'Mutation',
    fields: {
      createRecord: {
        type: RecordType,
        args: { input: { type: new GraphQLNonNull(RecordInputType) } },
        resolve: resolvers.Mutation.createRecord,
      },
      updateRecord: {
        type: RecordType,
        args: {
          id: { type: new GraphQLNonNull(GraphQLID) },
          input: { type: new GraphQLNonNull(RecordInputType) },
        },
        resolve: resolvers.Mutation.updateRecord,
      },
      deleteRecord: {
        type: GraphQLBoolean,
        args: { id: { type: new GraphQLNonNull(GraphQLID) } },
        resolve: resolvers.Mutation.deleteRecord,
      },
    },
  });

  return new GraphQLSchema({
    query: QueryType,
    mutation: MutationType,
    directives: options?.directives || [],
  });
}

function getGraphQLType(fieldInfo: FieldType): any {
  switch (fieldInfo.type) {
    case 'number': return GraphQLFloat;
    case 'boolean': return GraphQLBoolean;
    case 'date': return GraphQLString;
    default: return GraphQLString;
  }
}