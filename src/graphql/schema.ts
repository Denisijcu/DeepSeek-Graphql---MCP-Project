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
    fields: {
      field: { type: new GraphQLNonNull(GraphQLString) },
      direction: { type: GraphQLString, defaultValue: 'asc' },
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

  const RecordType = new GraphQLObjectType({
    name: 'Record',
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
        args: {
          limit: { type: GraphQLInt },
          offset: { type: GraphQLInt },
          orderBy: { type: new GraphQLList(OrderByInputType) },
          where: { type: WhereInputType },
          ...Object.fromEntries(
            Object.keys(schema).map((key) => [key, { type: GraphQLString }])
          ),
        },
        resolve: resolvers.Query.records,
      },
      record: {
        type: RecordType,
        args: { id: { type: new GraphQLNonNull(GraphQLID) } },
        resolve: resolvers.Query.record,
      },
      departamentos: {
        type: new GraphQLList(DepartmentType),
        args: {
          limit: { type: GraphQLInt },
          offset: { type: GraphQLInt },
        },
        resolve: resolvers.Query.departamentos,
      },
      stats: {
        type: new GraphQLObjectType({
          name: 'DataStats',
          fields: {
            totalRecords: { type: GraphQLInt },
            source: { type: GraphQLString },
            fields: { type: GraphQLString },
          },
        }),
        resolve: resolvers.Query.stats,
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