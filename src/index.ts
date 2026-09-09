// src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { createDynamicSchema } from './graphql/schema.js';
import { CSVAdapter } from './adapters/csv-adapter.js';
import { GoogleSheetsAdapter } from './adapters/google-sheets-adapter.js';
import { SQLiteAdapter } from './adapters/sqlite-adapter.js';
import { graphql, parse, validate } from 'graphql';
import { validateComplexity } from './graphql/complexity.js';
import { registerPersistedQuery, getPersistedQuery, listPersistedQueries } from './graphql/persisted-queries.js';
import { recordMetric, getMetrics } from './graphql/metrics.js';
import { executeBatch } from './graphql/batching.js';
import { formatError } from './graphql/errors.js';
import { AuthDirective } from './graphql/directives.js';
import { DataAdapter } from './adapters/base-adapter.js';
import dotenv from 'dotenv';

dotenv.config();

class MCPGraphQLServer {
  private server: Server;
  private csvAdapter: CSVAdapter;
  private sheetsAdapter: GoogleSheetsAdapter | null = null;
  private sqliteAdapter: SQLiteAdapter | null = null;
  private activeAdapter: DataAdapter;
  private schema: any;

  constructor() {
    const csvPath = process.env.CSV_FILE_PATH || './src/data/sample.csv';
    this.csvAdapter = new CSVAdapter(csvPath);
    this.activeAdapter = this.csvAdapter;

    const sheetsUrl = process.env.GOOGLE_SHEETS_API_URL;
    if (sheetsUrl) {
      this.sheetsAdapter = new GoogleSheetsAdapter(
        {
          apiUrl: sheetsUrl,
          timeout: 10000,
          sheets: ['Empleados', 'Departamentos'],
        },
        'Empleados'
      );
      this.activeAdapter = this.sheetsAdapter;
    }

    const sqliteDbPath = process.env.SQLITE_DB_PATH || './src/data/sample.db';
    const sqliteTable = process.env.SQLITE_TABLE || 'empleados';
    this.sqliteAdapter = new SQLiteAdapter(sqliteDbPath, sqliteTable);

    this.server = new Server(
      { name: 'mcp-graphql-server', version: '0.4.0' },
      { capabilities: { tools: {} } }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: 'graphql_query',
          description: 'Ejecuta una consulta GraphQL contra la fuente de datos activa',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'La consulta GraphQL a ejecutar' },
              variables: { type: 'object', description: 'Variables opcionales', optional: true },
              hash: { type: 'string', description: 'Hash de consulta persistida', optional: true },
            },
            required: ['query'],
          },
        },
        {
          name: 'graphql_batch',
          description: 'Ejecuta múltiples consultas GraphQL en una sola llamada',
          inputSchema: {
            type: 'object',
            properties: {
              queries: { type: 'array', items: { type: 'string' }, description: 'Lista de consultas GraphQL' },
              variables: { type: 'array', items: { type: 'object' }, description: 'Lista de variables', optional: true },
            },
            required: ['queries'],
          },
        },
        {
          name: 'graphql_mutation',
          description: 'Ejecuta una mutación GraphQL. Para eliminar, primero pide confirmación y luego llama con confirm: true',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'La mutación GraphQL' },
              variables: { type: 'object', description: 'Variables opcionales', optional: true },
              confirm: { type: 'boolean', description: 'Confirmación para DELETE', optional: true },
            },
            required: ['query'],
          },
        },
        {
          name: 'switch_source',
          description: 'Usa "sqlite" para trabajar con la base de datos SQLite.',
          inputSchema: {
            type: 'object',
            properties: {
              source: { type: 'string', description: 'Nombre de la fuente: "csv", "google-sheets" o "sqlite"' },
            },
            required: ['source'],
          },
        },
        {
          name: 'list_sources',
          description: 'Lista todas las fuentes de datos disponibles y cuál está activa actualmente',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'register_persisted_query',
          description: 'Registra una consulta persistida y devuelve su hash',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Consulta GraphQL a persistir' },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_metrics',
          description: 'Obtiene métricas de rendimiento',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'get_schema',
          description: 'Obtiene el esquema de la fuente de datos activa, incluyendo consultas disponibles y fuentes',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'graphql_query':
          return this.executeGraphQLQuery(args);
        case 'graphql_batch':
          return this.executeGraphQLBatch(args);
        case 'graphql_mutation':
          return this.executeGraphQLMutation(args);
        case 'switch_source':
          return this.switchSource(args);
        case 'list_sources':
          return this.listSources();
        case 'register_persisted_query':
          return this.registerPersistedQuery(args);
        case 'get_metrics':
          return this.getMetrics();
        case 'get_schema':
          return this.getSchemaInfo();
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private async switchSource(args: any) {
    const { source } = args;
    try {
      if (source === 'csv') {
        this.activeAdapter = this.csvAdapter;
      } else if (source === 'google-sheets') {
        if (!this.sheetsAdapter) throw new Error('Google Sheets no está configurado');
        this.activeAdapter = this.sheetsAdapter;
      } else if (source === 'sqlite') {
        if (!this.sqliteAdapter) throw new Error('SQLite no está configurado');
        this.activeAdapter = this.sqliteAdapter;
      } else {
        throw new Error(`Fuente desconocida: ${source}`);
      }
      this.schema = createDynamicSchema(this.activeAdapter, { directives: [AuthDirective] });
      console.error(`[switch_source] Fuente cambiada a: ${this.activeAdapter.getSourceName()}`);
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, activeSource: this.activeAdapter.getSourceName() }) }],
      };
    } catch (error: any) {
      console.error('[switch_source] Error:', error.message);
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }],
        isError: true,
      };
    }
  }

  private async listSources() {
    const sources = [
      { name: 'csv', active: this.activeAdapter === this.csvAdapter },
      { name: 'google-sheets', active: this.activeAdapter === this.sheetsAdapter },
      { name: 'sqlite', active: this.activeAdapter === this.sqliteAdapter },
    ];
    return {
      content: [{ type: 'text', text: JSON.stringify(sources, null, 2) }],
    };
  }

  private async executeGraphQLQuery(args: any) {
    const start = Date.now();
    try {
      let { query, variables = {}, hash } = args;
      if (hash && !query) {
        query = getPersistedQuery(hash);
        if (!query) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'Hash no encontrado' }) }], isError: true };
        }
      }

      const parsedQuery = parse(query);
      validateComplexity(this.schema, parsedQuery);
      const validationErrors = validate(this.schema, parsedQuery);
      if (validationErrors.length > 0) {
        recordMetric('graphql_query', Date.now() - start, true);
        return { content: [{ type: 'text', text: JSON.stringify({ errors: validationErrors.map(e => formatError(e)) }) }], isError: true };
      }

      const result = await graphql({
        schema: this.schema,
        source: query,
        variableValues: variables,
      });

      recordMetric('graphql_query', Date.now() - start, !!result.errors);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (error: any) {
      recordMetric('graphql_query', Date.now() - start, true);
      return { content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }], isError: true };
    }
  }

  private async executeGraphQLBatch(args: any) {
    const start = Date.now();
    try {
      const { queries, variables } = args;
      if (!Array.isArray(queries) || queries.length === 0) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Lista de consultas vacía' }) }], isError: true };
      }
      const results = await executeBatch(this.schema, queries, variables);
      recordMetric('graphql_batch', Date.now() - start, results.some(r => r.errors));
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    } catch (error: any) {
      recordMetric('graphql_batch', Date.now() - start, true);
      return { content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }], isError: true };
    }
  }

  private async executeGraphQLMutation(args: any) {
    const start = Date.now();
    try {
      const { query, variables = {}, confirm } = args;
      const isDelete = /deleteRecord\s*\(/.test(query);
      if (isDelete && !confirm) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              warning: '⚠️ Esta operación eliminará un registro de forma permanente.',
              instruction: 'Para confirmar, vuelve a llamar esta herramienta con el mismo query y añade "confirm": true en los argumentos.',
              query: query,
            }, null, 2),
          }],
        };
      }

      const parsedQuery = parse(query);
      validateComplexity(this.schema, parsedQuery);
      const validationErrors = validate(this.schema, parsedQuery);
      if (validationErrors.length > 0) {
        recordMetric('graphql_mutation', Date.now() - start, true);
        return { content: [{ type: 'text', text: JSON.stringify({ errors: validationErrors.map(e => formatError(e)) }) }], isError: true };
      }

      const result = await graphql({
        schema: this.schema,
        source: query,
        variableValues: variables,
      });

      recordMetric('graphql_mutation', Date.now() - start, !!result.errors);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (error: any) {
      recordMetric('graphql_mutation', Date.now() - start, true);
      return { content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }], isError: true };
    }
  }

  private async registerPersistedQuery(args: any) {
    try {
      const { query } = args;
      const hash = registerPersistedQuery(query);
      return { content: [{ type: 'text', text: JSON.stringify({ hash, message: 'Consulta persistida registrada' }) }] };
    } catch (error: any) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }], isError: true };
    }
  }

  private async getMetrics() {
    const metrics = getMetrics();
    return { content: [{ type: 'text', text: JSON.stringify(metrics, null, 2) }] };
  }

  private async getSchemaInfo() {
  const active = this.activeAdapter;
  const availableQueries: string[] = ['records', 'record', 'stats'];

  if (active instanceof GoogleSheetsAdapter) {
    availableQueries.push('departamentos');
  }

  const schemaInfo: any = {
    source: active.getSourceName(),
    availableSources: ['csv', 'google-sheets', 'sqlite'],
    fields: active.getSchema(),
    availableQueries,
    directives: ['auth'],
    exampleQueries: [
      '{ records { id nombre email } }',
      '{ record(id: "1") { nombre ciudad } }',
    ],
  };

  if (active instanceof GoogleSheetsAdapter) {
    schemaInfo.exampleQueries.push('{ departamentos { id nombre ubicacion } }');
  }

  schemaInfo.exampleQueries.push(
    'mutation { createRecord(input: { nombre: "Nuevo", email: "nuevo@email.com" }) { id nombre } }',
    'mutation { updateRecord(id: "1", input: { salario: 70000 }) { id nombre salario } }',
    'mutation { deleteRecord(id: "11") }'
  );

  schemaInfo.persistedQueries = listPersistedQueries();

  return { content: [{ type: 'text', text: JSON.stringify(schemaInfo, null, 2) }] };
}

  private setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async start() {
    await this.csvAdapter.initialize();
    if (this.sheetsAdapter) {
      try {
        await this.sheetsAdapter.initialize();
      } catch (error) {
        console.error('No se pudo inicializar Google Sheets, se usará CSV:', error);
        this.activeAdapter = this.csvAdapter;
      }
    }
    if (this.sqliteAdapter) {
      try {
        await this.sqliteAdapter.initialize();
        console.error('[SQLite] Inicializado correctamente');
      } catch (error) {
        console.error('No se pudo inicializar SQLite:', error);
      }
    }
    this.schema = createDynamicSchema(this.activeAdapter, { directives: [AuthDirective] });

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error(`Servidor MCP GraphQL con fuente activa: ${this.activeAdapter.getSourceName()}`);
  }
}

const server = new MCPGraphQLServer();
server.start().catch(console.error);