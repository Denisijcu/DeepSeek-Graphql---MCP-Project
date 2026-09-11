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
          description:
            'Ejecuta una consulta GraphQL contra la fuente de datos ACTIVA. ' +
            'IMPORTANTE: llama primero a get_schema para saber que campos existen; ' +
            'cada fuente tiene campos distintos y una consulta con un campo que no ' +
            'existe falla. La consulta principal es records(...). No existe ningun ' +
            'argumento "tabla" ni "coleccion": cada fuente expone UNA sola tabla, y ' +
            'para cambiar de tabla hay que cambiar de fuente con switch_source.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description:
                  'Consulta GraphQL. Ej: { records(limit: 10) { id nombre salario } } ' +
                  'Con filtro: { records(where: { salario: { operator: gt, value: 50000 } }) ' +
                  '{ nombre salario } }  Operadores: eq, neq, gt, gte, lt, lte, contains, ' +
                  'startsWith, endsWith, in, between.',
              },
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
          description:
            'Ejecuta una mutacion GraphQL (createRecord, updateRecord, deleteRecord) ' +
            'contra la fuente ACTIVA. Para eliminar, llama primero sin confirm para ' +
            'obtener el aviso, y despues con confirm: true y el MISMO id. ' +
            'DECLARA SIEMPRE el parametro "source" con la fuente sobre la que crees ' +
            'que estas trabajando: si no coincide con la activa, la operacion se ' +
            'rechaza en vez de escribir donde no debe.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'La mutación GraphQL' },
              source: {
                type: 'string',
                enum: ['csv', 'google-sheets', 'sqlite'],
                description:
                  'Fuente sobre la que crees estar trabajando. Se comprueba contra ' +
                  'la activa antes de ejecutar nada.',
              },
              variables: { type: 'object', description: 'Variables opcionales', optional: true },
              confirm: { type: 'boolean', description: 'Confirmación para DELETE', optional: true },
            },
            required: ['query'],
          },
        },
        {
          name: 'switch_source',
          description:
            'Cambia la fuente de datos activa. Solo hay UNA activa a la vez, y ' +
            'todas las consultas van contra ella. Cada fuente tiene sus propios ' +
            'campos, asi que DESPUES de cambiar hay que llamar a get_schema otra ' +
            'vez: el esquema anterior ya no vale. Fuentes: "csv", "google-sheets" ' +
            'y "sqlite".',
          inputSchema: {
            type: 'object',
            properties: {
              source: {
                type: 'string',
                enum: ['csv', 'google-sheets', 'sqlite'],
                description: 'Nombre exacto de la fuente: csv, google-sheets o sqlite',
              },
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
          description:
            'Devuelve el esquema de la fuente ACTIVA: nombre de la fuente, campos ' +
            'con su tipo, consultas disponibles y ejemplos. LLAMA A ESTA HERRAMIENTA ' +
            'ANTES DE LA PRIMERA CONSULTA Y CADA VEZ QUE USES switch_source. Los ' +
            'campos cambian de una fuente a otra.',
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

  /** Nombre corto de la fuente activa: csv, google-sheets o sqlite. */
  private claveFuenteActiva(): string {
    if (this.activeAdapter === this.csvAdapter) return 'csv';
    if (this.activeAdapter === this.sheetsAdapter) return 'google-sheets';
    if (this.activeAdapter === this.sqliteAdapter) return 'sqlite';
    return 'desconocida';
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

  /**
   * Borrados pendientes de confirmar, indexados por OBJETIVO.
   *
   * Historia de este mecanismo, en tres versiones:
   *
   *   v1: confirm:true valia para cualquier mutacion. El modelo podia
   *       pedir confirmacion para borrar el registro 11, el usuario
   *       aprobarlo, y la segunda llamada borrar el 12.
   *
   *   v2: se ataba a la consulta EXACTA, normalizando espacios. Bloqueaba
   *       el ataque y bloqueaba tambien el uso legitimo: el modelo
   *       reescribe la consulta en cada intento, asi que la confirmada
   *       nunca coincidia con la avisada. Observado en pruebas: cuatro
   *       intentos, ningun borrado, y el modelo inventandose un ritual
   *       ("dime: Confirma la eliminacion del empleado 1") para intentar
   *       satisfacer un mecanismo que no entendia.
   *
   *   v3, esta: se ata al OBJETIVO, no al texto. La clave es el id que se
   *       va a borrar. El modelo puede reescribir la consulta como quiera;
   *       lo que no puede es confirmar el borrado de OTRO registro.
   *
   * Que una proteccion bloquee tambien el camino legitimo no es "ser
   * estricto": es empujar a que alguien la desactive entera.
   */
  private borradosPendientes = new Map<string, number>();
  private static readonly TTL_CONFIRMACION_MS = 120000;

  /**
   * Extrae el id que la mutacion pretende borrar.
   *
   * Devuelve null si no se puede determinar, y en ese caso la operacion
   * se rechaza: si no se sabe QUE se va a borrar, no se puede confirmar
   * nada.
   */
  private objetivoDelBorrado(query: string): string | null {
    const m = query.match(/deleteRecord\s*\(\s*id\s*:\s*"([^"]+)"/)
      || query.match(/deleteRecord\s*\(\s*id\s*:\s*([\w-]+)/);
    return m?.[1] ?? null;
  }

  private async executeGraphQLMutation(args: any) {
    const start = Date.now();
    try {
      const { query, variables = {}, confirm, source } = args;

      // Comprobacion de fuente ANTES de tocar nada.
      //
      // Existe por un incidente real: el modelo creia estar en SQLite,
      // nunca llamo a switch_source, y creo y borro registros en Google
      // Sheets. El servidor no tenia forma de saber que se estaba
      // equivocando, porque la fuente activa es un estado invisible para
      // quien llama.
      //
      // Con esto, el modelo DECLARA sobre que cree trabajar y el servidor
      // lo verifica. Una suposicion se convierte en algo comprobable.
      const activa = this.claveFuenteActiva();

      if (source && source !== activa) {
        recordMetric('graphql_mutation', Date.now() - start, true);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error:
                `Operacion CANCELADA. Declaraste trabajar sobre "${source}" pero ` +
                `la fuente activa es "${activa}" (${this.activeAdapter.getSourceName()}). ` +
                `No se ha modificado nada. Llama a switch_source con "${source}" ` +
                `y vuelve a intentarlo.`,
              fuenteDeclarada: source,
              fuenteActiva: activa,
            }, null, 2),
          }],
          isError: true,
        };
      }

      const isDelete = /deleteRecord\s*\(/.test(query);

      if (isDelete) {
        const objetivo = this.objetivoDelBorrado(query);

        if (!objetivo) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error:
                  'No se pudo determinar que registro se quiere borrar. Usa la ' +
                  'forma deleteRecord(id: "...") con el id literal, no una ' +
                  'variable.',
                query,
              }, null, 2),
            }],
            isError: true,
          };
        }

        const ahora = Date.now();
        for (const [k, t] of this.borradosPendientes) {
          if (ahora - t > MCPGraphQLServer.TTL_CONFIRMACION_MS) {
            this.borradosPendientes.delete(k);
          }
        }

        const clave = `${this.activeAdapter.getSourceName()}::${objetivo}`;

        if (!confirm) {
          this.borradosPendientes.set(clave, ahora);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                warning: `Se va a eliminar de forma permanente el registro ${objetivo}.`,
                fuente: this.activeAdapter.getSourceName(),
                registro: objetivo,
                instruction:
                  'Muestra al usuario QUE registro se va a borrar y espera su ' +
                  'aprobacion. Despues vuelve a llamar a esta misma herramienta ' +
                  `borrando el id ${objetivo} y anadiendo "confirm": true. ` +
                  'No hace falta que la consulta sea identica, pero el id SI ' +
                  'tiene que ser el mismo.',
                validaSegundos: MCPGraphQLServer.TTL_CONFIRMACION_MS / 1000,
              }, null, 2),
            }],
          };
        }

        const emitido = this.borradosPendientes.get(clave);

        if (emitido === undefined) {
          const pendientes = [...this.borradosPendientes.keys()]
            .map((k) => k.split('::')[1])
            .filter(Boolean);

          recordMetric('graphql_mutation', Date.now() - start, true);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error:
                  `No hay confirmacion pendiente para el registro ${objetivo}.` +
                  (pendientes.length
                    ? ` Hay una pendiente para: ${pendientes.join(', ')}. ` +
                      `Si de verdad quieres borrar el ${objetivo}, pide primero ` +
                      `el aviso llamando SIN confirm.`
                    : ' Llama primero sin confirm para obtener el aviso.'),
                registroSolicitado: objetivo,
              }, null, 2),
            }],
            isError: true,
          };
        }

        this.borradosPendientes.delete(clave);

        if (Date.now() - emitido > MCPGraphQLServer.TTL_CONFIRMACION_MS) {
          recordMetric('graphql_mutation', Date.now() - start, true);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: 'La confirmacion caduco. Vuelve a pedirla sin confirm.',
              }, null, 2),
            }],
            isError: true,
          };
        }
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
      // La fuente viaja SIEMPRE en la respuesta. Asi el modelo no puede
      // arrastrar una suposicion equivocada de una llamada a la siguiente.
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...result,
            fuenteActiva: activa,
            fuenteNombre: this.activeAdapter.getSourceName(),
          }, null, 2),
        }],
      };
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

    // ANTES esta funcion llevaba su propia lista escrita a mano:
    //
    //     const availableQueries = ['records', 'record', 'stats'];
    //
    // Es decir, HABIA DOS FUENTES DE VERDAD: el esquema de GraphQL, que se
    // genera de los datos, y esta lista, que se actualizaba a mano. Al
    // anadir la consulta aggregate al esquema, aqui no aparecio, y el
    // modelo —que solo lee esto— siguio afirmando que no habia
    // agregaciones. Hizo lo correcto con la informacion que tenia.
    //
    // Ahora la lista se DERIVA del esquema. Si manana se anade otra
    // consulta, aparece sola.
    const tipoQuery = this.schema.getQueryType();
    const tipoMutation = this.schema.getMutationType();

    const describir = (tipo: any) => {
      if (!tipo) return [];
      return Object.values(tipo.getFields()).map((campo: any) => ({
        nombre: campo.name,
        descripcion: campo.description || null,
        argumentos: campo.args.map((a: any) => ({
          nombre: a.name,
          tipo: String(a.type),
          descripcion: a.description || null,
        })),
      }));
    };

    const consultas = describir(tipoQuery);
    const mutaciones = describir(tipoMutation);

    const campos = active.getSchema();
    const numericos = Object.entries(campos)
      .filter(([, info]) => info.type === 'number')
      .map(([nombre]) => nombre);

    const schemaInfo: any = {
      source: active.getSourceName(),
      availableSources: ['csv', 'google-sheets', 'sqlite'],
      fields: campos,
      consultas,
      mutaciones,
      directives: ['auth'],
      exampleQueries: [
        '{ records(limit: 10) { ' + Object.keys(campos).slice(0, 3).join(' ') + ' } }',
        '{ stats { totalRecords source } }',
      ],
    };

    // Los ejemplos se construyen con campos REALES de la fuente activa, no
    // con nombres inventados que pueden no existir aqui.
    if (numericos.length > 0) {
      const n = numericos[0];
      schemaInfo.exampleQueries.push(
        `{ records(where: { ${n}: { operator: gt, value: 0 } }) { ` +
          `${Object.keys(campos)[0]} ${n} } }`,
        `{ records(orderBy: [{ field: "${n}", direction: "desc" }], limit: 1) { ` +
          `${Object.keys(campos)[0]} ${n} } }`,
        `{ aggregate(field: "${n}") { avg min max countNoNulos aviso } }`
      );
    }

    if (active instanceof GoogleSheetsAdapter) {
      schemaInfo.exampleQueries.push('{ departamentos { id nombre ubicacion } }');
    }

    schemaInfo.exampleQueries.push(
      'mutation { updateRecord(id: "1", input: { salario: 70000 }) { id nombre salario } }'
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