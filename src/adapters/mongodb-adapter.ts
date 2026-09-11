// src/adapters/mongodb-adapter.ts
import { BaseAdapter, QueryOptions, FieldType } from './base-adapter.js';
import { MongoClient, Db, Collection, ObjectId, type Filter, type Document } from 'mongodb';

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

  /**
   * Construye el filtro para buscar un documento por su identificador.
   *
   * En MongoDB el campo _id es un ObjectId, NO una cadena. Comparar
   * { _id: "68b2f1..." } contra un ObjectId no coincide nunca, asi que la
   * version anterior de este metodo no habria encontrado ningun documento
   * aunque hubiera compilado.
   *
   * Se prueban las dos posibilidades:
   *   - _id como ObjectId, si la cadena tiene forma valida de ObjectId
   *   - un campo "id" propio del documento, que muchas colecciones traen
   */
  private filtroPorId(id: string): Filter<Document> {
    const condiciones: Filter<Document>[] = [{ id: id }];

    if (ObjectId.isValid(id)) {
      condiciones.unshift({ _id: new ObjectId(id) });
    }

    return { $or: condiciones };
  }

  async createRecord(record: Record<string, any>): Promise<any> {
    if (!this.collection) throw new Error('Colección no inicializada');
    const result = await this.collection.insertOne(record);
    await this.reloadData();
    return { ...record, _id: result.insertedId };
  }

  async updateRecord(id: string, updates: Record<string, any>): Promise<any> {
    if (!this.collection) throw new Error('Colección no inicializada');

    const resultado = await this.collection.updateOne(
      this.filtroPorId(id),
      { $set: updates }
    );

    // Si no coincidio ningun documento hay que decirlo. Devolver undefined
    // en silencio hace pensar al modelo que la actualizacion funciono.
    if (resultado.matchedCount === 0) {
      throw new Error(`No existe ningun documento con id "${id}".`);
    }

    await this.reloadData();
    return this.data.find(
      doc => String(doc._id) === String(id) || String(doc.id) === String(id)
    );
  }

  async deleteRecord(id: string): Promise<boolean> {
    if (!this.collection) throw new Error('Colección no inicializada');

    const resultado = await this.collection.deleteOne(this.filtroPorId(id));
    await this.reloadData();

    // Devolver el resultado REAL, no true siempre. Un borrado que no borro
    // nada no es un borrado con exito.
    return resultado.deletedCount > 0;
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

}