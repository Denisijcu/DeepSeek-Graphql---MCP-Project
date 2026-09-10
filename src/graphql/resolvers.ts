// src/graphql/resolvers.ts
import { DataAdapter, FieldType } from '../adapters/base-adapter.js';

/**
 * Construye un objeto de filtros compatible con el adaptador a partir de
 * un filtro avanzado "where" y argumentos directos de igualdad.
 */
function buildFilters(
  where: Record<string, any> | undefined,
  directFilters: Record<string, any>,
  schema: Record<string, FieldType>
): Record<string, any> {
  const filters: Record<string, any> = {};

  // Procesa el filtro avanzado "where" (objetos con operator y value/values)
  if (where) {
    for (const [field, condition] of Object.entries(where)) {
      const cond = condition as any;
      let operand = cond.value !== undefined ? cond.value : cond.values;

      // Si el campo es numérico, convierte el operando a número
      if (schema[field]?.type === 'number' && operand !== undefined) {
        if (Array.isArray(operand)) {
          operand = operand.map(Number);
        } else {
          operand = Number(operand);
        }
      }

      filters[field] = {
        operator: cond.operator,
        operand,
      };
    }
  }

  // Procesa los argumentos directos (igualdad simple)
  for (const [key, value] of Object.entries(directFilters)) {
    if (value !== undefined && value !== null) {
      filters[key] = value;
    }
  }

  return filters;
}

/**
 * Crea los resolvers para el esquema dinámico.
 * @param adapter Adaptador que debe incluir métodos opcionales para mutaciones y hojas múltiples.
 */
export function createResolvers(adapter: DataAdapter & {
  createRecord?: (record: any) => Promise<any>;
  updateRecord?: (id: string, updates: any) => Promise<any>;
  deleteRecord?: (id: string) => Promise<boolean>;
  getDataFromSheet?: (sheetName: string, options?: any) => Promise<any[]>;
}) {
  // `schema` es el esquema de la hoja primaria (Empleados)
  const schema = adapter.getSchema();

  return {
    Query: {
      // Obtener todos los registros de la hoja primaria (Empleados)
      records: async (parent: any, args: any) => {
        const { limit, offset, orderBy, where, ...directFilters } = args;
        const filters = buildFilters(where, directFilters, schema);

        return adapter.getData({
          limit: limit || 100,
          offset: offset || 0,
          orderBy: orderBy || [],
          filters,
        });
      },

      // Obtener un registro por id (de la hoja primaria)
      record: async (parent: any, { id }: { id: string }) => {
        const results = await adapter.getData({ filters: { id }, limit: 1 });
        return results[0] || null;
      },

      // Obtener departamentos desde la hoja "Departamentos"
      departamentos: async (parent: any, args: any) => {
  if (!adapter.getDataFromSheet) {
    throw new Error('La fuente activa no soporta múltiples hojas (use Google Sheets para departamentos)');
  }
  const { limit, offset, orderBy, where, ...directFilters } = args;
  const filters = buildFilters(where, directFilters, {});
  return adapter.getDataFromSheet('Departamentos', {
    limit: limit || 100,
    offset: offset || 0,
    orderBy: orderBy || [],
    filters,
  });
},

      // Estadísticas generales
      stats: async () => {
        const stats = await adapter.getStats();
        return {
          totalRecords: stats.totalRecords,
          source: adapter.getSourceName(),
          fields: JSON.stringify(stats.fields),
        };
      },

      // Agregacion sobre un campo numerico.
      //
      // Se anadio despues de observar al modelo traerse TODOS los
      // registros para calcular una media en su respuesta. Con tres
      // empleados funciona; con tres mil es traer tres mil filas al
      // contexto para producir un numero.
      aggregate: async (parent: any, args: any) => {
        // aggregate vive en BaseAdapter, no en la interfaz DataAdapter.
        // Se comprueba antes de llamar para dar un mensaje util en vez de
        // un "is not a function".
        const fn = (adapter as any).aggregate;
        if (typeof fn !== 'function') {
          throw new Error(
            'Esta fuente no soporta agregaciones. Trae los registros con ' +
            'records y calcula sobre ellos.'
          );
        }

        const { field, where } = args;
        const filters = buildFilters(where, {}, schema);
        return fn.call(adapter, field, filters);
      },
    },

    Mutation: {
      // Crear un registro (en la hoja primaria)
      createRecord: async (parent: any, { input }: { input: any }) => {
        if (!adapter.createRecord) throw new Error('Operación no soportada por esta fuente');
        return adapter.createRecord(input);
      },

      // Actualizar un registro (en la hoja primaria)
      updateRecord: async (parent: any, { id, input }: { id: string; input: any }) => {
        if (!adapter.updateRecord) throw new Error('Operación no soportada por esta fuente');
        return adapter.updateRecord(id, input);
      },

      // Eliminar un registro (en la hoja primaria)
      deleteRecord: async (parent: any, { id }: { id: string }) => {
        if (!adapter.deleteRecord) throw new Error('Operación no soportada por esta fuente');
        return adapter.deleteRecord(id);
      },
    },
  };
}