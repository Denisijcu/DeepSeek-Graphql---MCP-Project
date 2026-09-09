"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/index.ts
var index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
var stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
var types_js_1 = require("@modelcontextprotocol/sdk/types.js");
var schema_js_1 = require("./graphql/schema.js");
var csv_adapter_js_1 = require("./adapters/csv-adapter.js");
var graphql_1 = require("graphql");
var MCPGraphQLServer = /** @class */ (function () {
    function MCPGraphQLServer() {
        // Usar variable de entorno si existe
        var csvPath = process.env.CSV_FILE_PATH || './src/data/sample.csv';
        this.adapter = new csv_adapter_js_1.CSVAdapter(csvPath);
        this.server = new index_js_1.Server({
            name: 'mcp-graphql-server',
            version: '0.1.0',
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.setupToolHandlers();
        this.setupErrorHandling();
    }
    MCPGraphQLServer.prototype.setupToolHandlers = function () {
        var _this = this;
        this.server.setRequestHandler(types_js_1.ListToolsRequestSchema, function () { return __awaiter(_this, void 0, void 0, function () {
            var tools;
            return __generator(this, function (_a) {
                tools = [
                    {
                        name: 'graphql_query',
                        description: 'Ejecuta una consulta GraphQL contra la base de datos',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                query: {
                                    type: 'string',
                                    description: 'La consulta GraphQL a ejecutar',
                                },
                                variables: {
                                    type: 'object',
                                    description: 'Variables opcionales para la consulta',
                                    optional: true,
                                },
                            },
                            required: ['query'],
                        },
                    },
                    {
                        name: 'get_schema',
                        description: 'Obtiene el esquema GraphQL disponible',
                        inputSchema: {
                            type: 'object',
                            properties: {},
                        },
                    },
                ];
                return [2 /*return*/, { tools: tools }];
            });
        }); });
        this.server.setRequestHandler(types_js_1.CallToolRequestSchema, function (request) { return __awaiter(_this, void 0, void 0, function () {
            var _a, name, args;
            return __generator(this, function (_b) {
                _a = request.params, name = _a.name, args = _a.arguments;
                switch (name) {
                    case 'graphql_query':
                        return [2 /*return*/, this.executeGraphQLQuery(args)];
                    case 'get_schema':
                        return [2 /*return*/, this.getSchemaInfo()];
                    default:
                        throw new Error("Unknown tool: ".concat(name));
                }
                return [2 /*return*/];
            });
        }); });
    };
    MCPGraphQLServer.prototype.executeGraphQLQuery = function (args) {
        return __awaiter(this, void 0, void 0, function () {
            var query, _a, variables, parsedQuery, validationErrors, result, error_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        query = args.query, _a = args.variables, variables = _a === void 0 ? {} : _a;
                        parsedQuery = (0, graphql_1.parse)(query);
                        validationErrors = (0, graphql_1.validate)(this.schema, parsedQuery);
                        if (validationErrors.length > 0) {
                            return [2 /*return*/, {
                                    content: [
                                        {
                                            type: 'text',
                                            text: JSON.stringify({
                                                errors: validationErrors.map(function (e) { return e.message; }),
                                            }),
                                        },
                                    ],
                                    isError: true,
                                }];
                        }
                        return [4 /*yield*/, (0, graphql_1.graphql)({
                                schema: this.schema,
                                source: query,
                                variableValues: variables,
                            })];
                    case 1:
                        result = _b.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: JSON.stringify(result, null, 2),
                                    },
                                ],
                            }];
                    case 2:
                        error_1 = _b.sent();
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: JSON.stringify({ error: error_1.message }),
                                    },
                                ],
                                isError: true,
                            }];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    MCPGraphQLServer.prototype.getSchemaInfo = function () {
        return __awaiter(this, void 0, void 0, function () {
            var schemaInfo;
            return __generator(this, function (_a) {
                schemaInfo = {
                    source: this.adapter.getSourceName(),
                    fields: this.adapter.getSchema(),
                    exampleQueries: [
                        '{ records { id nombre email } }',
                        '{ record(id: "1") { nombre ciudad } }',
                        '{ records(ciudad: "Madrid", limit: 2) { nombre edad } }',
                    ],
                };
                return [2 /*return*/, {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(schemaInfo, null, 2),
                            },
                        ],
                    }];
            });
        });
    };
    MCPGraphQLServer.prototype.setupErrorHandling = function () {
        var _this = this;
        this.server.onerror = function (error) {
            console.error('[MCP Error]', error);
        };
        process.on('SIGINT', function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.server.close()];
                    case 1:
                        _a.sent();
                        process.exit(0);
                        return [2 /*return*/];
                }
            });
        }); });
    };
    MCPGraphQLServer.prototype.start = function () {
        return __awaiter(this, void 0, void 0, function () {
            var transport;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.adapter.initialize()];
                    case 1:
                        _a.sent();
                        this.schema = (0, schema_js_1.createDynamicSchema)(this.adapter);
                        transport = new stdio_js_1.StdioServerTransport();
                        return [4 /*yield*/, this.server.connect(transport)];
                    case 2:
                        _a.sent();
                        console.error('MCP GraphQL Server running on stdio');
                        return [2 /*return*/];
                }
            });
        });
    };
    return MCPGraphQLServer;
}());
var server = new MCPGraphQLServer();
server.start().catch(console.error);
