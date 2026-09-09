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

  protected applyFilters(data: any[], filters?: Record<string, any>): any[] {
    if (!filters || Object.keys(filters).length === 0) return data;

    return data.filter(record => {
      return Object.entries(filters).every(([key, value]) => {
        if (value === undefined || value === null) return true;

        if (typeof value === 'object' && value !== null && 'operator' in value) {
          const { operator, operand } = value as any;
          switch (operator) {
            case 'eq': return record[key] === operand;
            case 'neq': return record[key] !== operand;
            case 'gt': return record[key] > operand;
            case 'gte': return record[key] >= operand;
            case 'lt': return record[key] < operand;
            case 'lte': return record[key] <= operand;
            case 'contains': return String(record[key]).includes(operand);
            case 'startsWith': return String(record[key]).startsWith(operand);
            case 'endsWith': return String(record[key]).endsWith(operand);
            case 'in': return Array.isArray(operand) && operand.includes(record[key]);
            case 'between': return Array.isArray(operand) && record[key] >= operand[0] && record[key] <= operand[1];
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
        if (a[field] < b[field]) return direction === 'asc' ? -1 : 1;
        if (a[field] > b[field]) return direction === 'asc' ? 1 : -1;
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
}