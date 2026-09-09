// src/adapters/csv-adapter.ts
import { parse } from 'csv-parse';
import { createReadStream } from 'fs';
import { BaseAdapter, QueryOptions, FieldType } from './base-adapter.js';

export class CSVAdapter extends BaseAdapter {
  constructor(private filePath: string) {
    super();
  }

  async initialize(): Promise<void> {
    const records: any[] = [];
    const parser = createReadStream(this.filePath).pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        cast: true,
        cast_date: true,
      })
    );

    for await (const record of parser) {
      records.push(record);
    }

    this.data = records;

    if (records.length > 0) {
      const firstRecord = records[0];
      const schema: Record<string, FieldType> = {};
      for (const [key, value] of Object.entries(firstRecord)) {
        schema[key] = this.inferFieldType(key, value, records);
      }
      this.schema = schema;
    }
  }

  private inferFieldType(fieldName: string, sampleValue: any, records: any[]): FieldType {
    let type: FieldType['type'] = 'string';
    let nullable = false;
    let unique = true;

    if (typeof sampleValue === 'number') {
      type = 'number';
    } else if (typeof sampleValue === 'boolean') {
      type = 'boolean';
    } else if (sampleValue instanceof Date) {
      type = 'date';
    } else if (typeof sampleValue === 'string') {
      const allNumbers = records.every(record => {
        const val = record[fieldName];
        return val === null || val === undefined || !isNaN(Number(val));
      });
      if (allNumbers) type = 'number';
    }

    nullable = records.some(record => record[fieldName] === null || record[fieldName] === undefined);
    const values = records.map(record => record[fieldName]);
    unique = new Set(values).size === values.length;

    return {
      type,
      nullable,
      unique,
      description: `Campo ${fieldName} del CSV`,
    };
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

  getSourceName(): string {
    return 'CSV';
  }

  // ========== MÉTODOS PARA MUTACIONES ==========
  async createRecord(record: Record<string, any>): Promise<any> {
    if (!record.id) {
      const maxId = this.data.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0);
      record.id = String(maxId + 1);
    }
    this.data.push(record);
    await this.persistData();
    this.clearCache();
    return record;
  }

  async updateRecord(id: string, updates: Record<string, any>): Promise<any> {
    const index = this.data.findIndex(r => String(r.id) === String(id));
    if (index === -1) {
      throw new Error(`Registro con id "${id}" no encontrado`);
    }
    this.data[index] = { ...this.data[index], ...updates, id: this.data[index].id };
    await this.persistData();
    this.clearCache();
    return this.data[index];
  }

  async deleteRecord(id: string): Promise<boolean> {
    const index = this.data.findIndex(r => String(r.id) === String(id));
    if (index === -1) {
      throw new Error(`Registro con id "${id}" no encontrado`);
    }
    this.data.splice(index, 1);
    await this.persistData();
    this.clearCache();
    return true;
  }

  private async persistData(): Promise<void> {
    const { stringify } = await import('csv-stringify');
    const fs = await import('fs/promises');
    
    const stringifier = stringify({
      header: true,
      columns: Object.keys(this.schema),
    });
    
    const csvString = await new Promise<string>((resolve, reject) => {
      let output = '';
      stringifier.on('readable', () => {
        let row;
        while ((row = stringifier.read()) !== null) {
          output += row;
        }
      });
      stringifier.on('error', reject);
      stringifier.on('finish', () => resolve(output));
      
      this.data.forEach(record => stringifier.write(record));
      stringifier.end();
    });
    
    await fs.writeFile(this.filePath, csvString, 'utf-8');
  }

  private clearCache(): void {
    this.cache.clear();
  }
}