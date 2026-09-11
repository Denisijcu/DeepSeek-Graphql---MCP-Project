// src/adapters/postgres-adapter.ts
import { BaseAdapter, QueryOptions, FieldType } from './base-adapter.js';
import pg from 'pg';

export class PostgresAdapter extends BaseAdapter {
  private pool: pg.Pool | null = null;
  private tableName: string;

  constructor(connectionString: string, tableName: string) {
    super();
    this.tableName = tableName;
    this.sourceName = `PostgreSQL (${tableName})`;
    // Guardamos la cadena de conexión para usarla en initialize
    this.connectionString = connectionString;
  }

  private connectionString: string;

  async initialize(): Promise<void> {
    this.pool = new pg.Pool({ connectionString: this.connectionString });
    // Probar conexión y cargar datos
    await this.reloadData();
  }

  private async reloadData(): Promise<void> {
    if (!this.pool) throw new Error('Pool no inicializado');
    const result = await this.pool.query(`SELECT * FROM "${this.tableName}"`);
    this.data = result.rows;
    if (this.data.length > 0) {
      this.inferSchema(this.data);
    }
    this.clearCache();
  }

  async getData(options?: QueryOptions): Promise<any[]> {
    const cacheKey = this.getCacheKey(options);
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    let result = this.applyFilters(this.data, options?.filters);
    result = this.applySorting(result, options?.orderBy);
    result = this.applyPagination(result, options?.limit, options?.offset);
    result = this.applyFieldSelection(result, options?.fields);

    this.setCache(cacheKey, result);
    return result;
  }

  async createRecord(record: Record<string, any>): Promise<any> {
    if (!this.pool) throw new Error('Pool no inicializado');
    const columns = Object.keys(record);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO "${this.tableName}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders}) RETURNING *`;
    const result = await this.pool.query(sql, columns.map(col => record[col]));
    await this.reloadData();
    return result.rows[0];
  }

  async updateRecord(id: string, updates: Record<string, any>): Promise<any> {
    if (!this.pool) throw new Error('Pool no inicializado');
    const setClause = Object.keys(updates).map((key, i) => `"${key}" = $${i + 1}`).join(', ');
    const values = [...Object.values(updates), id];
    const sql = `UPDATE "${this.tableName}" SET ${setClause} WHERE id = $${values.length} RETURNING *`;
    const result = await this.pool.query(sql, values);
    await this.reloadData();
    return result.rows[0];
  }

  async deleteRecord(id: string): Promise<boolean> {
    if (!this.pool) throw new Error('Pool no inicializado');
    await this.pool.query(`DELETE FROM "${this.tableName}" WHERE id = $1`, [id]);
    await this.reloadData();
    return true;
  }

  private inferSchema(records: any[]): void {
    const firstRecord = records[0];
    const schema: Record<string, FieldType> = {};
    for (const [key, value] of Object.entries(firstRecord)) {
      schema[key] = this.inferFieldType(key, value, records);
    }
    this.schema = schema;
  }

  private inferFieldType(fieldName: string, sampleValue: any, records: any[]): FieldType {
    let type: FieldType['type'] = 'string';
    let nullable = false;
    let unique = true;

    if (typeof sampleValue === 'number') type = 'number';
    else if (typeof sampleValue === 'boolean') type = 'boolean';
    else if (sampleValue instanceof Date) type = 'date';
    else if (typeof sampleValue === 'string') {
      const allNumbers = records.every(r => {
        const val = r[fieldName];
        return val === null || val === undefined || !isNaN(Number(val));
      });
      if (allNumbers) type = 'number';
    }

    nullable = records.some(r => r[fieldName] === null || r[fieldName] === undefined);
    unique = new Set(records.map(r => r[fieldName])).size === records.length;

    return { type, nullable, unique, description: `Campo ${fieldName} de PostgreSQL` };
  }

}