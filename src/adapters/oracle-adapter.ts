// src/adapters/oracle-adapter.ts
import { BaseAdapter, QueryOptions, FieldType } from './base-adapter.js';
import oracledb from 'oracledb';

interface OracleConfig {
  user: string;
  password: string;
  connectString: string; // e.g. "localhost:1521/XEPDB1"
}

export class OracleAdapter extends BaseAdapter {
  private connection: oracledb.Connection | null = null;
  private tableName: string;
  private config: OracleConfig;

  constructor(config: OracleConfig, tableName: string) {
    super();
    this.config = config;
    this.tableName = tableName;
    this.sourceName = `Oracle (${tableName})`;
  }

  async initialize(): Promise<void> {
    // Establecer formato de salida a objetos para facilitar el manejo
    oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
    this.connection = await oracledb.getConnection({
      user: this.config.user,
      password: this.config.password,
      connectString: this.config.connectString,
    });
    await this.reloadData();
  }

  private async reloadData(): Promise<void> {
    if (!this.connection) throw new Error('Conexión no inicializada');
    const result = await this.connection.execute(
      `SELECT * FROM "${this.tableName}"`
    );
    // Convertir claves a minúsculas y normalizar tipos
    this.data = (result.rows as any[]).map(row => this.normalizeRow(row));
    if (this.data.length > 0) {
      this.inferSchema(this.data);
    }
    this.clearCache();
  }

  private normalizeRow(row: any): Record<string, any> {
    const normalized: Record<string, any> = {};
    for (const [key, value] of Object.entries(row)) {
      // Oracle suele devolver claves en mayúsculas, las convertimos a minúsculas
      const lowerKey = key.toLowerCase();
      // Convertir objetos LOB o tipos especiales a string si es necesario
      normalized[lowerKey] = value;
    }
    return normalized;
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
    if (!this.connection) throw new Error('Conexión no inicializada');
    const columns = Object.keys(record);
    const placeholders = columns.map((_, i) => `:${i + 1}`).join(', ');
    const sql = `INSERT INTO "${this.tableName}" (${columns.map(c => `"${c.toUpperCase()}"`).join(', ')}) VALUES (${placeholders})`;
    await this.connection.execute(sql, columns.map(col => record[col]), { autoCommit: true });
    await this.reloadData();
    return record;
  }

  async updateRecord(id: string, updates: Record<string, any>): Promise<any> {
    if (!this.connection) throw new Error('Conexión no inicializada');
    const setClause = Object.keys(updates)
      .map((key, i) => `"${key.toUpperCase()}" = :${i + 1}`)
      .join(', ');
    const values = [...Object.values(updates), id];
    const sql = `UPDATE "${this.tableName}" SET ${setClause} WHERE id = :${values.length}`;
    await this.connection.execute(sql, values, { autoCommit: true });
    await this.reloadData();
    return this.data.find(r => String(r.id) === String(id));
  }

  async deleteRecord(id: string): Promise<boolean> {
    if (!this.connection) throw new Error('Conexión no inicializada');
    await this.connection.execute(
      `DELETE FROM "${this.tableName}" WHERE id = :1`,
      [id],
      { autoCommit: true }
    );
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

    return { type, nullable, unique, description: `Campo ${fieldName} de Oracle` };
  }

  private clearCache(): void {
    this.cache.clear();
  }

  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
  }
}