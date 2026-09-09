"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CSVAdapter = void 0;
// src/adapters/csv-adapter.ts
var csv_parse_1 = require("csv-parse");
var fs_1 = require("fs");
var base_adapter_js_1 = require("./base-adapter.js");
var CSVAdapter = /** @class */ (function (_super) {
    __extends(CSVAdapter, _super);
    // No declares data ni schema aquí, ya están en BaseAdapter como protected
    function CSVAdapter(filePath) {
        var _this = _super.call(this) || this; // Llama al constructor de BaseAdapter
        _this.filePath = filePath;
        return _this;
    }
    CSVAdapter.prototype.initialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            var records, parser, _a, parser_1, parser_1_1, record, e_1_1, firstRecord, schema, _i, _b, _c, key, value;
            var _d, e_1, _e, _f;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        records = [];
                        parser = (0, fs_1.createReadStream)(this.filePath).pipe((0, csv_parse_1.parse)({
                            columns: true,
                            skip_empty_lines: true,
                            trim: true,
                            cast: true, // Convierte automáticamente números y booleanos
                            cast_date: true, // Convierte fechas
                        }));
                        _g.label = 1;
                    case 1:
                        _g.trys.push([1, 6, 7, 12]);
                        _a = true, parser_1 = __asyncValues(parser);
                        _g.label = 2;
                    case 2: return [4 /*yield*/, parser_1.next()];
                    case 3:
                        if (!(parser_1_1 = _g.sent(), _d = parser_1_1.done, !_d)) return [3 /*break*/, 5];
                        _f = parser_1_1.value;
                        _a = false;
                        record = _f;
                        records.push(record);
                        _g.label = 4;
                    case 4:
                        _a = true;
                        return [3 /*break*/, 2];
                    case 5: return [3 /*break*/, 12];
                    case 6:
                        e_1_1 = _g.sent();
                        e_1 = { error: e_1_1 };
                        return [3 /*break*/, 12];
                    case 7:
                        _g.trys.push([7, , 10, 11]);
                        if (!(!_a && !_d && (_e = parser_1.return))) return [3 /*break*/, 9];
                        return [4 /*yield*/, _e.call(parser_1)];
                    case 8:
                        _g.sent();
                        _g.label = 9;
                    case 9: return [3 /*break*/, 11];
                    case 10:
                        if (e_1) throw e_1.error;
                        return [7 /*endfinally*/];
                    case 11: return [7 /*endfinally*/];
                    case 12:
                        this.data = records;
                        // Inferir schema del CSV en formato FieldType
                        if (records.length > 0) {
                            firstRecord = records[0];
                            schema = {};
                            for (_i = 0, _b = Object.entries(firstRecord); _i < _b.length; _i++) {
                                _c = _b[_i], key = _c[0], value = _c[1];
                                schema[key] = this.inferFieldType(key, value, records);
                            }
                            this.schema = schema;
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    // Método de inferencia mejorado (retorna FieldType)
    CSVAdapter.prototype.inferFieldType = function (fieldName, sampleValue, records) {
        var type = 'string';
        var nullable = false;
        var unique = true;
        // Inferir tipo básico
        if (typeof sampleValue === 'number') {
            type = 'number';
        }
        else if (typeof sampleValue === 'boolean') {
            type = 'boolean';
        }
        else if (sampleValue instanceof Date) {
            type = 'date';
        }
        else if (typeof sampleValue === 'string') {
            // Verificar si todos los valores son numéricos
            var allNumbers = records.every(function (record) {
                var val = record[fieldName];
                return val === null || val === undefined || !isNaN(Number(val));
            });
            if (allNumbers)
                type = 'number';
            // Si es fecha válida, podrías detectar aquí, pero lo dejamos simple
        }
        // Verificar nullabilidad
        nullable = records.some(function (record) { return record[fieldName] === null || record[fieldName] === undefined; });
        // Verificar unicidad
        var values = records.map(function (record) { return record[fieldName]; });
        unique = new Set(values).size === values.length;
        return {
            type: type,
            nullable: nullable,
            unique: unique,
            description: "Campo ".concat(fieldName, " del CSV"),
        };
    };
    // Sobrescribimos getData para usar los métodos de filtrado/orden/paginación de BaseAdapter
    CSVAdapter.prototype.getData = function (options) {
        return __awaiter(this, void 0, void 0, function () {
            var cacheKey, cached, result;
            return __generator(this, function (_a) {
                cacheKey = this.getCacheKey(options);
                cached = this.getFromCache(cacheKey);
                if (cached)
                    return [2 /*return*/, cached];
                result = this.applyFilters(this.data, options === null || options === void 0 ? void 0 : options.filters);
                result = this.applySorting(result, options === null || options === void 0 ? void 0 : options.orderBy);
                result = this.applyPagination(result, options === null || options === void 0 ? void 0 : options.limit, options === null || options === void 0 ? void 0 : options.offset);
                result = this.applyFieldSelection(result, options === null || options === void 0 ? void 0 : options.fields);
                // Guardar en caché
                this.setCache(cacheKey, result);
                return [2 /*return*/, result];
            });
        });
    };
    // No necesitas sobrescribir getSchema() ni getSourceName() porque ya están en BaseAdapter
    // Pero si quieres cambiar getSourceName, puedes sobrescribirlo (opcional)
    CSVAdapter.prototype.getSourceName = function () {
        return 'CSV';
    };
    return CSVAdapter;
}(base_adapter_js_1.BaseAdapter));
exports.CSVAdapter = CSVAdapter;
