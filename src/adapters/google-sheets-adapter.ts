// src/adapters/google-sheets-adapter.ts
import { BaseAdapter, QueryOptions, FieldType } from './base-adapter.js';
import axios from 'axios';

interface GoogleSheetsConfig {
  apiUrl: string;
  apiKey?: string;
  cacheTTL?: number;
  timeout?: number;
  sheets?: string[];
}

export class GoogleSheetsAdapter extends BaseAdapter {
  private config: GoogleSheetsConfig;
  private lastFetch: Date | null = null;
  private fetching: Promise<void> | null = null;
  private primarySheetName: string;
  private allSheets: string[];
  private sheetsData: Map<string, any[]> = new Map();
  private timeout: number;

  constructor(config: GoogleSheetsConfig, primarySheetName: string = 'Empleados') {
    super();
    this.config = { cacheTTL: 60000, timeout: 10000, ...config };
    this.primarySheetName = primarySheetName;
    this.allSheets = this.config.sheets || [primarySheetName];
    this.timeout = this.config.timeout || 10000;
    this.cacheTTL = this.config.cacheTTL!;
    this.sourceName = `Google Sheets (${primarySheetName})`;
  }

  async initialize(): Promise<void> {
    await this.fetchAllSheets();
  }

  async getData(options?: QueryOptions): Promise<any[]> {
    return this.getDataFromSheet(this.primarySheetName, options);
  }

  async getDataFromSheet(sheetName: string, options?: QueryOptions): Promise<any[]> {
    if (!this.sheetsData.has(sheetName)) {
      console.error(`[GoogleSheets] Hojas cargadas: ${Array.from(this.sheetsData.keys())}`);
      throw new Error(`Hoja "${sheetName}" no cargada`);
    }
    const data = this.sheetsData.get(sheetName)!;
    const cacheKey = this.getCacheKey(options) + `:sheet:${sheetName}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    let result = this.applyFilters(data, options?.filters);
    result = this.applySorting(result, options?.orderBy);
    result = this.applyPagination(result, options?.limit, options?.offset);
    result = this.applyFieldSelection(result, options?.fields);

    this.setCache(cacheKey, result);
    return result;
  }

  async createRecord(record: Record<string, any>): Promise<any> {
    await this.performMutation('create', { data: JSON.stringify(record) });
    await this.fetchAllSheets(true);
    return record;
  }

  async updateRecord(id: string, updates: Record<string, any>): Promise<any> {
    await this.performMutation('update', { id, data: JSON.stringify(updates) });
    await this.fetchAllSheets(true);
    return (this.sheetsData.get(this.primarySheetName) || []).find(r => String(r.id) === String(id));
  }

  async deleteRecord(id: string): Promise<boolean> {
    await this.performMutation('delete', { id });
    await this.fetchAllSheets(true);
    return true;
  }

  private async performMutation(action: string, params: Record<string, string>) {
    try {
      await axios.get(this.config.apiUrl, {
        params: { sheet: this.primarySheetName, action, ...params },
        headers: this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {},
        timeout: this.timeout,
      });
    } catch (error: any) {
      throw new Error(`Error en mutación Google Sheets: ${error.message}`);
    }
  }

  private shouldRefresh(): boolean {
    if (!this.lastFetch) return true;
    return Date.now() - this.lastFetch.getTime() > this.cacheTTL;
  }

  private async fetchAllSheets(force: boolean = false): Promise<void> {
    if (this.fetching) { await this.fetching; return; }
    if (!force && !this.shouldRefresh()) return;

    this.fetching = this.performFetchAllSheets();
    try {
      await this.fetching;
    } finally {
      this.fetching = null;
    }
  }

  private async performFetchAllSheets(): Promise<void> {
    console.error('[GoogleSheets] Cargando hojas:', this.allSheets);
    for (const sheetName of this.allSheets) {
      try {
        const response = await axios.get(this.config.apiUrl, {
          params: { sheet: sheetName, action: 'read' },
          headers: this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {},
          timeout: this.timeout,
        });

        let records: any[] = [];
        if (response.data && response.data.success) {
          records = response.data.data || [];
        } else if (Array.isArray(response.data)) {
          records = response.data;
        } else {
          throw new Error(`Formato de respuesta no reconocido para hoja ${sheetName}`);
        }

        this.sheetsData.set(sheetName, records);
        console.error(`[GoogleSheets] ${records.length} registros cargados de "${sheetName}"`);
        // Mostrar primer registro para depuración
        if (records.length > 0) {
          console.error(`[GoogleSheets] Ejemplo ${sheetName}:`, JSON.stringify(records[0]));
        }
      } catch (error: any) {
        console.error(`[GoogleSheets] Error al obtener hoja "${sheetName}":`, error.message);
        if (sheetName === this.primarySheetName && !this.sheetsData.has(sheetName)) {
          throw error;
        }
      }
    }

    const primaryData = this.sheetsData.get(this.primarySheetName) || [];
    if (primaryData.length > 0) {
      this.data = primaryData;
      this.inferSchema(primaryData);
    }
    this.lastFetch = new Date();
    this.clearCache();
  }

  private inferSchema(records: any[]): void {
    if (records.length === 0) return;
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

    return { type, nullable, unique, description: `Campo ${fieldName} de Google Sheets` };
  }
}