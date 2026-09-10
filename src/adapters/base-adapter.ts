// src/adapters/base-adapter.ts

export interface DataAdapter {
  initialize(): Promise<void>;
  getData(options?: QueryOptions): Promise<any[]>;
  getSchema(): Record<string, FieldType>;
  getSourceName(): string;
  getStats(): Promise<DataStats>;
}

export interface OrderBy {
  field: string;
  direction: 'asc' | 'desc';
}

export interface Aggregation {
  field: string;
  operation: 'sum' | 'avg' | 'count' | 'min' | 'max';
  alias?: string;
}

export interface FieldType {
  type: 'string' | 'number' | 'boolean' | 'date';
  nullable: boolean;
  unique?: boolean;
  description?: string;
}

export interface DataStats {
  totalRecords: number;
  fields: Record<string, FieldType>;
  lastUpdated: Date;
  sizeInBytes: number;
}

export interface QueryOptions {
  fields?: string[];
  filters?: Record<string, any>;
  limit?: number;
  offset?: number;
  orderBy?: OrderBy[];
  groupBy?: string[];
  aggregations?: Aggregation[];
}

export abstract class BaseAdapter implements DataAdapter {
  protected data: any[] = [];
  protected schema: Record<string, FieldType> = {};
  protected sourceName: string = 'Base';
  protected cache: Map<string, { data: any[]; timestamp: number }> = new Map();
  protected cacheTTL: number = 60000;

  abstract initialize(): Promise<void>;
  abstract getData(options?: QueryOptions): Promise<any[]>;

  getSchema(): Record<string, FieldType> {
    return this.schema;
  }

  getSourceName(): string {
    return this.sourceName;
  }

  async getStats(): Promise<DataStats> {
    return {
      totalRecords: this.data.length,
      fields: this.schema,
      lastUpdated: new Date(),
      sizeInBytes: JSON.stringify(this.data).length,
    };
  }

  protected getCacheKey(options?: QueryOptions): string {
    if (!options) return 'all';
    return JSON.stringify(options);
  }

  protected getFromCache(key: string): any[] | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    return null;
  }

  protected setCache(key: string, data: any[]): void {
    this.cache.set(key, { data, timestamp: Date.now() });
    if (this.cache.size > 100) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
  }

  /**
   * Convierte un valor al tipo declarado en el esquema antes de compararlo.
   *
   * Sin esto, los operadores de rango comparan CADENAS. En CSV y en Google
   * Sheets todo llega como texto, asi que "9" > "50000" es verdadero: el
   * orden lexicografico pone el 9 por delante del 5.
   *
   * El resultado es un filtro que no da error y devuelve lo que no es.
   */
  protected coaccionar(campo: string, valor: any): any {
    if (valor === null || valor === undefined) return valor;

    const tipo = this.schema[campo]?.type;

    if (tipo === 'number') {
      const n = typeof valor === 'number' ? valor : Number(String(valor).replace(/[\s,]/g, ''));
      return Number.isFinite(n) ? n : null;
    }
    if (tipo === 'boolean') {
      if (typeof valor === 'boolean') return valor;
      return /^(true|1|si|yes)$/i.test(String(valor).trim());
    }
    if (tipo === 'date') {
      // Las fechas en formato ISO se ordenan bien como texto. Convertirlas
      // a Date aqui abriria el problema de zonas horarias sin necesidad.
      return String(valor);
    }
    return valor;
  }

  protected applyFilters(data: any[], filters?: Record<string, any>): any[] {
    if (!filters || Object.keys(filters).length === 0) return data;

    return data.filter(record => {
      return Object.entries(filters).every(([key, value]) => {
        if (value === undefined || value === null) return true;

        if (typeof value === 'object' && value !== null && 'operator' in value) {
          const filtro = value as any;
          const operator = filtro.operator;

          // De donde sale el valor a comparar.
          //
          // Historia de esto, que merece la pena conocer: el esquema
          // (FilterInput) define "value" para un valor suelto y "values"
          // para listas, mientras que este adaptador leia "operand". Vista
          // asi, la discrepancia parece un bug evidente.
          //
          // No lo era: buildFilters, en resolvers.ts, traduce value/values
          // a operand antes de llamar aqui. El nombre "operand" es el
          // contrato interno entre el resolver y el adaptador.
          //
          // Se aceptan las tres formas para que el adaptador funcione
          // tanto llamado desde el resolver como directamente en pruebas.
          const bruto =
            filtro.operand !== undefined ? filtro.operand :
            filtro.values  !== undefined ? filtro.values  :
            filtro.value;

          // Un filtro cuyo valor no llega es un ERROR, no un filtro vacio.
          //
          // Aqui hubo dos versiones malas antes de esta:
          //
          //   return true  -> deja pasar todo. Quien consulta cree que
          //                   filtro y recibe la tabla entera.
          //   return false -> no devuelve nada, sin explicar por que. Con
          //                   un modelo al otro lado esto es peor: recibe
          //                   cero filas, supone que se equivoco al
          //                   escribir la consulta, la reescribe, vuelve a
          //                   recibir cero, y entra en bucle. Se observo
          //                   con 25 consultas seguidas.
          //
          // Las dos fallan en silencio. Un filtro que no se puede aplicar
          // tiene que decirlo en voz alta.
          if (bruto === undefined || bruto === null) {
            throw new Error(
              `El filtro sobre "${key}" no trae valor. Usa ` +
              `{ ${key}: { operator: eq, value: "algo" } } o, para los ` +
              `operadores in y between, { ${key}: { operator: in, values: [...] } }.`
            );
          }

          const campo = this.coaccionar(key, record[key]);
          const operand = Array.isArray(bruto)
            ? bruto.map((v: any) => this.coaccionar(key, v))
            : this.coaccionar(key, bruto);

          switch (operator) {
            case 'eq': return campo === operand;
            case 'neq': return campo !== operand;
            case 'gt': return campo !== null && campo > operand;
            case 'gte': return campo !== null && campo >= operand;
            case 'lt': return campo !== null && campo < operand;
            case 'lte': return campo !== null && campo <= operand;
            // Las de texto trabajan sobre el valor original, sin coaccionar.
            case 'contains': return String(record[key] ?? '').includes(String(bruto));
            case 'startsWith': return String(record[key] ?? '').startsWith(String(bruto));
            case 'endsWith': return String(record[key] ?? '').endsWith(String(bruto));
            case 'in': return Array.isArray(operand) && operand.includes(campo);
            case 'between':
              return Array.isArray(operand) && operand.length >= 2 &&
                     campo !== null && campo >= operand[0] && campo <= operand[1];
            default: return true;
          }
        }

        return record[key] === value;
      });
    });
  }

  protected applySorting(data: any[], orderBy?: OrderBy[]): any[] {
    if (!orderBy || orderBy.length === 0) return data;

    return [...data].sort((a, b) => {
      for (const { field, direction } of orderBy) {
        // Mismo motivo que en applyFilters: ordenar cadenas numericas por
        // orden lexicografico pone el 9 por delante del 50000.
        const va = this.coaccionar(field, a[field]);
        const vb = this.coaccionar(field, b[field]);

        // Los registros sin dato van al final, ordene como ordene.
        if (va === null || va === undefined) return 1;
        if (vb === null || vb === undefined) return -1;

        if (va < vb) return direction === 'asc' ? -1 : 1;
        if (va > vb) return direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  protected applyPagination(data: any[], limit?: number, offset?: number): any[] {
    let result = data;
    if (offset !== undefined) {
      result = result.slice(offset);
    }
    if (limit !== undefined) {
      result = result.slice(0, limit);
    }
    return result;
  }

  protected applyFieldSelection(data: any[], fields?: string[]): any[] {
    if (!fields || fields.length === 0) return data;

    return data.map(record => {
      const selected: any = {};
      fields.forEach(field => {
        if (record[field] !== undefined) {
          selected[field] = record[field];
        }
      });
      return selected;
    });
  }

  protected applyAggregations(data: any[], aggregations?: Aggregation[]): any[] {
    if (!aggregations || aggregations.length === 0) return data;

    const result: any = {};
    aggregations.forEach(agg => {
      const values = data.map(record => record[agg.field]).filter(v => v !== undefined);
      const alias = agg.alias || `${agg.operation}_${agg.field}`;
      switch (agg.operation) {
        case 'sum':
          result[alias] = values.reduce((sum, val) => sum + Number(val), 0);
          break;
        case 'avg':
          result[alias] = values.length > 0
            ? values.reduce((sum, val) => sum + Number(val), 0) / values.length
            : 0;
          break;
        case 'count':
          result[alias] = values.length;
          break;
        case 'min':
          result[alias] = values.length > 0 ? Math.min(...values.map(Number)) : null;
          break;
        case 'max':
          result[alias] = values.length > 0 ? Math.max(...values.map(Number)) : null;
          break;
      }
    });
    return [result];
  }

  protected applyGroupBy(data: any[], groupBy?: string[]): any[] {
    if (!groupBy || groupBy.length === 0) return data;

    const grouped = new Map<string, any[]>();
    data.forEach(record => {
      const key = groupBy.map(field => record[field]).join('|');
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(record);
    });

    return Array.from(grouped.entries()).map(([key, records]) => {
      const result: any = {};
      const keyParts = key.split('|');
      groupBy.forEach((field, index) => {
        result[field] = keyParts[index];
      });
      result._count = records.length;
      result._data = records;
      return result;
    });
  }

  /**
   * Agrega un campo numerico sobre las filas que pasen los filtros.
   *
   * Existe porque el modelo, al no encontrar agregaciones en el esquema,
   * se traia TODOS los registros y calculaba la media en su respuesta.
   * Con tres empleados sale bien; con tres mil, eso es traer tres mil
   * filas al contexto para producir un numero.
   *
   * Devuelve las cinco operaciones a la vez y con nombres FIJOS. La
   * alternativa, alias dinamicos del tipo "salario_avg", obliga al modelo
   * a adivinar como se llamara el campo del resultado: exactamente lo que
   * intento y fallo.
   */
  async aggregate(
    field: string,
    filters?: Record<string, any>
  ): Promise<{
    field: string;
    count: number;
    countNoNulos: number;
    sum: number | null;
    avg: number | null;
    min: number | null;
    max: number | null;
    aviso?: string;
  }> {
    if (!this.schema[field]) {
      const disponibles = Object.keys(this.schema).join(', ');
      throw new Error(
        `El campo "${field}" no existe en esta fuente. Campos: ${disponibles}.`
      );
    }

    const filas = this.applyFilters(this.data, filters);

    // Solo cuentan las filas con dato. Una celda vacia no es un cero: si
    // se tratara como cero, la media bajaria y mentiria.
    const numeros = filas
      .map((r) => this.coaccionar(field, r[field]))
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

    const tipo = this.schema[field]?.type;

    if (numeros.length === 0) {
      return {
        field,
        count: filas.length,
        countNoNulos: 0,
        sum: null, avg: null, min: null, max: null,
        aviso: tipo === 'number'
          ? 'Ninguna de las filas seleccionadas tiene valor numerico en ese campo.'
          : `El campo "${field}" es de tipo ${tipo}, no numerico. ` +
            `Solo count es significativo.`,
      };
    }

    const sum = numeros.reduce((a, b) => a + b, 0);
    const faltan = filas.length - numeros.length;

    return {
      field,
      count: filas.length,
      countNoNulos: numeros.length,
      sum,
      avg: sum / numeros.length,
      min: Math.min(...numeros),
      max: Math.max(...numeros),
      // Si hay filas sin dato hay que decirlo: la media se calculo sobre
      // menos filas de las que el usuario cree.
      ...(faltan > 0
        ? {
            aviso:
              `${faltan} de ${filas.length} filas no tienen valor en "${field}". ` +
              `Los calculos usan solo las ${numeros.length} que si lo tienen.`,
          }
        : {}),
    };
  }
}