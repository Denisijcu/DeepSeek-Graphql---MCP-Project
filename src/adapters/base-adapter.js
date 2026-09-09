"use strict";
// src/adapters/base-adapter.ts
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseAdapter = void 0;
/**
 * Clase base abstracta que implementa la interfaz DataAdapter
 * y proporciona funcionalidad común a todos los adaptadores.
 */
var BaseAdapter = /** @class */ (function () {
    function BaseAdapter() {
        this.data = [];
        this.schema = {};
        this.sourceName = 'Base';
        this.cache = new Map();
        this.cacheTTL = 60000; // 1 minuto por defecto
    }
    BaseAdapter.prototype.getSchema = function () {
        return this.schema;
    };
    BaseAdapter.prototype.getSourceName = function () {
        return this.sourceName;
    };
    BaseAdapter.prototype.getStats = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, {
                        totalRecords: this.data.length,
                        fields: this.schema,
                        lastUpdated: new Date(),
                        sizeInBytes: JSON.stringify(this.data).length,
                    }];
            });
        });
    };
    // ---------- Utilidades de caché ----------
    BaseAdapter.prototype.getCacheKey = function (options) {
        if (!options)
            return 'all';
        return JSON.stringify(options);
    };
    BaseAdapter.prototype.getFromCache = function (key) {
        var cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            return cached.data;
        }
        return null;
    };
    BaseAdapter.prototype.setCache = function (key, data) {
        this.cache.set(key, { data: data, timestamp: Date.now() });
        // Limpiar caché si crece demasiado (máximo 100 entradas)
        if (this.cache.size > 100) {
            var oldestKey = this.cache.keys().next().value;
            if (oldestKey) {
                this.cache.delete(oldestKey);
            }
        }
    };
    // ---------- Métodos de manipulación de datos (comunes) ----------
    BaseAdapter.prototype.applyFilters = function (data, filters) {
        if (!filters || Object.keys(filters).length === 0)
            return data;
        return data.filter(function (record) {
            return Object.entries(filters).every(function (_a) {
                var key = _a[0], value = _a[1];
                if (value === undefined || value === null)
                    return true;
                // Soporte para operadores avanzados (si el valor es un objeto con 'operator' y 'operand')
                if (typeof value === 'object' && value !== null && 'operator' in value) {
                    var _b = value, operator = _b.operator, operand = _b.operand;
                    switch (operator) {
                        case 'eq': return record[key] === operand;
                        case 'neq': return record[key] !== operand;
                        case 'gt': return record[key] > operand;
                        case 'gte': return record[key] >= operand;
                        case 'lt': return record[key] < operand;
                        case 'lte': return record[key] <= operand;
                        case 'contains': return String(record[key]).includes(operand);
                        case 'startsWith': return String(record[key]).startsWith(operand);
                        case 'endsWith': return String(record[key]).endsWith(operand);
                        case 'in': return Array.isArray(operand) && operand.includes(record[key]);
                        case 'between': return Array.isArray(operand) && record[key] >= operand[0] && record[key] <= operand[1];
                        default: return true;
                    }
                }
                // Comparación directa
                return record[key] === value;
            });
        });
    };
    BaseAdapter.prototype.applySorting = function (data, orderBy) {
        if (!orderBy || orderBy.length === 0)
            return data;
        return __spreadArray([], data, true).sort(function (a, b) {
            for (var _i = 0, orderBy_1 = orderBy; _i < orderBy_1.length; _i++) {
                var _a = orderBy_1[_i], field = _a.field, direction = _a.direction;
                if (a[field] < b[field])
                    return direction === 'asc' ? -1 : 1;
                if (a[field] > b[field])
                    return direction === 'asc' ? 1 : -1;
            }
            return 0;
        });
    };
    BaseAdapter.prototype.applyPagination = function (data, limit, offset) {
        var result = data;
        if (offset !== undefined) {
            result = result.slice(offset);
        }
        if (limit !== undefined) {
            result = result.slice(0, limit);
        }
        return result;
    };
    BaseAdapter.prototype.applyFieldSelection = function (data, fields) {
        if (!fields || fields.length === 0)
            return data;
        return data.map(function (record) {
            var selected = {};
            fields.forEach(function (field) {
                if (record[field] !== undefined) {
                    selected[field] = record[field];
                }
            });
            return selected;
        });
    };
    // Métodos para agregaciones y agrupamiento (opcionales)
    BaseAdapter.prototype.applyAggregations = function (data, aggregations) {
        if (!aggregations || aggregations.length === 0)
            return data;
        var result = {};
        aggregations.forEach(function (agg) {
            var values = data.map(function (record) { return record[agg.field]; }).filter(function (v) { return v !== undefined; });
            var alias = agg.alias || "".concat(agg.operation, "_").concat(agg.field);
            switch (agg.operation) {
                case 'sum':
                    result[alias] = values.reduce(function (sum, val) { return sum + Number(val); }, 0);
                    break;
                case 'avg':
                    result[alias] = values.length > 0
                        ? values.reduce(function (sum, val) { return sum + Number(val); }, 0) / values.length
                        : 0;
                    break;
                case 'count':
                    result[alias] = values.length;
                    break;
                case 'min':
                    result[alias] = values.length > 0 ? Math.min.apply(Math, values.map(Number)) : null;
                    break;
                case 'max':
                    result[alias] = values.length > 0 ? Math.max.apply(Math, values.map(Number)) : null;
                    break;
            }
        });
        return [result];
    };
    BaseAdapter.prototype.applyGroupBy = function (data, groupBy) {
        if (!groupBy || groupBy.length === 0)
            return data;
        var grouped = new Map();
        data.forEach(function (record) {
            var key = groupBy.map(function (field) { return record[field]; }).join('|');
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key).push(record);
        });
        return Array.from(grouped.entries()).map(function (_a) {
            var key = _a[0], records = _a[1];
            var result = {};
            var keyParts = key.split('|');
            groupBy.forEach(function (field, index) {
                result[field] = keyParts[index];
            });
            result._count = records.length;
            result._data = records;
            return result;
        });
    };
    return BaseAdapter;
}());
exports.BaseAdapter = BaseAdapter;
