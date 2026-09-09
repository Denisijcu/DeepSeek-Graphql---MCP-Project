// src/adapters/mongodb-adapter.ts
import { BaseAdapter, QueryOptions, FieldType } from './base-adapter.js';
import { MongoClient, Db, Collection } from 'mongodb';

export class MongoDBAdapter extends BaseAdapter {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private collection: Collection | null = null;
  private collectionName: string;

  constructor(uri: string, dbName: string, collectionName: string) {
    super();
    this.collectionName = collectionName;
    this.sourceName = `MongoDB (${collectionName})`;
    this.uri = uri;
    this.dbName = dbName;
  }

  private uri: string;
  private dbName: string;

  async initialize(): Promise<void> {
    this.client = new MongoClient(this.uri);
    await this.client.connect();
    this.db = this.client.db(this.dbName);
    this.collection = this.db.collection(this.collectionName);
    await this.reloadData();
  }

  private async reloadData(): Promise<void> {
    if (!this.collection) throw new Error('Colección no inicializada');
    const documents = await this.collection.find({}).toArray();
    this.data = documents;
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
    if (!this.collection) throw new Error('Colección no inicializada');
    const result = await this.collection.insertOne(record);
    await this.reloadData();
    return record;
  }

  async updateRecord(id: string, updates: Record<string, any>): Promise<any> {
    if (!this.collection) throw new Error('Colección no inicializada');
    // Asumimos que el documento tiene un campo _id o id
    const filter = { $or: [{ _id: id }, { id: id }] };
    await this.collection.updateOne(filter, { $set: updates });
    await this.reloadData();
    return this.data.find(doc => String(doc._id) === String(id) || String(doc.id) === String(id));
  }

  async deleteRecord(id: string): Promise<boolean> {
    if (!this.collection) throw new Error('Colección no inicializada');
    const filter = { $or: [{ _id: id }, { id: id }] };
    await this.collection.deleteOne(filter);
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

    return { type, nullable, unique, description: `Campo ${fieldName} de MongoDB` };
  }

  private clearCache(): void {
    this.cache.clear();
  }
}