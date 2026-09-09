// src/adapters/sqlite-adapter.ts
import Database from 'better-sqlite3';
import { BaseAdapter, QueryOptions, FieldType } from './base-adapter.js';

export class SQLiteAdapter extends BaseAdapter {
  private db: Database.Database | null = null;
  private tableName: string;
  private dbPath: string;

  constructor(dbPath: string, tableName: string) {
    super();
    this.dbPath = dbPath;
    this.tableName = tableName;
    this.sourceName = `SQLite (${tableName})`;
  }

  async initialize(): Promise<void> {
    this.db = new Database(this.dbPath);
    const rows = this.db.prepare(`SELECT * FROM "${this.tableName}"`).all() as any[];
    this.data = rows;

    console.error(`[SQLite] Cargando tabla "${this.tableName}" desde ${this.dbPath}`);
    console.error(`[SQLite] Registros obtenidos: ${rows.length}`);

    if (rows.length > 0) {
      this.inferSchema(rows);
    }
  }

  async getData(options?: QueryOptions): Promise<any[]> {
    if (!this.db) {
      throw new Error('Base de datos no inicializada');
    }
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
    if (!this.db) throw new Error('Base de datos no inicializada');
    const columns = Object.keys(record);
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT INTO "${this.tableName}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`;
    const stmt = this.db.prepare(sql);
    stmt.run(...columns.map(col => record[col]));
    // Recargar datos y caché
    await this.reloadData();
    return record;
  }

  async updateRecord(id: string, updates: Record<string, any>): Promise<any> {
    if (!this.db) throw new Error('Base de datos no inicializada');
    const setClause = Object.keys(updates).map(key => `"${key}" = ?`).join(', ');
    const sql = `UPDATE "${this.tableName}" SET ${setClause} WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...Object.values(updates), id);
    await this.reloadData();
    return this.data.find(r => String(r.id) === String(id));
  }

  async deleteRecord(id: string): Promise<boolean> {
    if (!this.db) throw new Error('Base de datos no inicializada');
    const stmt = this.db.prepare(`DELETE FROM "${this.tableName}" WHERE id = ?`);
    stmt.run(id);
    await this.reloadData();
    return true;
  }

  private async reloadData(): Promise<void> {
    if (!this.db) return;
    this.data = this.db.prepare(`SELECT * FROM "${this.tableName}"`).all() as any[];
    if (this.data.length > 0) {
      this.inferSchema(this.data);
    }
    this.clearCache();
  }

  private inferSchema(records: any[]): void {
    const firstRecord = records[0];
    const schema: Record<string, FieldType> = {};
    for (const [key, value] of Object.entries(firstRecord)) {
      schema[key] = this.inferFieldType(key, value, records);
    }
    this.schema = schema;
    console.error('[SQLite] Esquema inferido:', this.schema);
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

    return { type, nullable, unique, description: `Campo ${fieldName} de SQLite` };
  }

  private clearCache(): void {
    this.cache.clear();
  }
}