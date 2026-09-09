// src/adapters/mysql-adapter.ts
import { BaseAdapter, QueryOptions, FieldType } from './base-adapter.js';
import mysql from 'mysql2/promise';

export class MySQLAdapter extends BaseAdapter {
  private connection: mysql.Connection | null = null;
  private tableName: string;
  private config: mysql.ConnectionOptions;

  constructor(config: mysql.ConnectionOptions, tableName: string) {
    super();
    this.config = config;
    this.tableName = tableName;
    this.sourceName = `MySQL (${tableName})`;
  }

  async initialize(): Promise<void> {
    this.connection = await mysql.createConnection(this.config);
    await this.reloadData();
  }

  private async reloadData(): Promise<void> {
    if (!this.connection) throw new Error('Conexión no inicializada');
    const [rows] = await this.connection.execute(`SELECT * FROM \`${this.tableName}\``);
    this.data = rows as any[];
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
    if (!this.connection) throw new Error('Conexión no inicializada');
    const columns = Object.keys(record);
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT INTO \`${this.tableName}\` (${columns.map(c => `\`${c}\``).join(', ')}) VALUES (${placeholders})`;
    await this.connection.execute(sql, columns.map(col => record[col]));
    await this.reloadData();
    return record;
  }

  async updateRecord(id: string, updates: Record<string, any>): Promise<any> {
    if (!this.connection) throw new Error('Conexión no inicializada');
    const setClause = Object.keys(updates).map(key => `\`${key}\` = ?`).join(', ');
    const sql = `UPDATE \`${this.tableName}\` SET ${setClause} WHERE id = ?`;
    await this.connection.execute(sql, [...Object.values(updates), id]);
    await this.reloadData();
    return this.data.find(r => String(r.id) === String(id));
  }

  async deleteRecord(id: string): Promise<boolean> {
    if (!this.connection) throw new Error('Conexión no inicializada');
    await this.connection.execute(`DELETE FROM \`${this.tableName}\` WHERE id = ?`, [id]);
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

    return { type, nullable, unique, description: `Campo ${fieldName} de MySQL` };
  }

  private clearCache(): void {
    this.cache.clear();
  }
}