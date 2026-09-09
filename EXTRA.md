# 📄 EXTRA.md

```markdown
# Adaptadores de Base de Datos – Guía de Integración

Este documento explica cómo añadir y configurar los adaptadores de bases de datos incluidos en el catálogo. No todos han sido probados; se proporcionan como base para futuras implementaciones.

## 📌 Requisitos generales

Cada adaptador extiende `BaseAdapter` y debe implementar:
- `initialize()`: conexión y carga inicial.
- `getData(options?)`: consulta con filtros, orden, paginación.
- `createRecord(record)`, `updateRecord(id, updates)`, `deleteRecord(id)`: mutaciones.

Además, se encargan de inferir el esquema de campos y tipos automáticamente.

## 🐘 PostgreSQL

**Archivo:** `src/adapters/postgres-adapter.ts`  
**Dependencia:** `pg`  
**Instalación:** `npm install pg && npm install -D @types/pg`

### Configuración

En `.env`:
```
PG_CONNECTION_STRING=postgres://user:password@localhost:5432/dbname
PG_TABLE=empleados
```

### Uso

```typescript
import { PostgresAdapter } from './adapters/postgres-adapter.js';
const adapter = new PostgresAdapter(process.env.PG_CONNECTION_STRING!, process.env.PG_TABLE || 'empleados');
await adapter.initialize();
```

### Notas
- La tabla debe existir previamente.
- La columna `id` se usa para mutaciones.

## 🐬 MySQL

**Archivo:** `src/adapters/mysql-adapter.ts`  
**Dependencia:** `mysql2`  
**Instalación:** `npm install mysql2`

### Configuración

```
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=secret
MYSQL_DATABASE=test
MYSQL_TABLE=empleados
```

### Uso

```typescript
import { MySQLAdapter } from './adapters/mysql-adapter.js';
const adapter = new MySQLAdapter({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
}, process.env.MYSQL_TABLE || 'empleados');
await adapter.initialize();
```

### Notas
- Similar a PostgreSQL en estructura.
- Usa backticks para nombres de tabla/columna.

## 🍃 MongoDB

**Archivo:** `src/adapters/mongodb-adapter.ts`  
**Dependencia:** `mongodb`  
**Instalación:** `npm install mongodb`

### Configuración

```
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=test
MONGO_COLLECTION=empleados
```

### Uso

```typescript
import { MongoDBAdapter } from './adapters/mongodb-adapter.js';
const adapter = new MongoDBAdapter(process.env.MONGO_URI!, process.env.MONGO_DB_NAME!, process.env.MONGO_COLLECTION || 'empleados');
await adapter.initialize();
```

### Notas
- Los documentos no tienen un esquema fijo; la inferencia se hace con el primer documento.
- Las mutaciones usan `_id` o `id` para localizar registros.

## 🏛️ Oracle

**Archivo:** `src/adapters/oracle-adapter.ts`  
**Dependencia:** `oracledb`  
**Instalación:** `npm install oracledb`  
**Requisito adicional:** Oracle Instant Client instalado en el sistema.

### Configuración

```
ORACLE_USER=system
ORACLE_PASSWORD=oracle
ORACLE_CONNECT_STRING=localhost:1521/XEPDB1
ORACLE_TABLE=empleados
```

### Uso

```typescript
import { OracleAdapter } from './adapters/oracle-adapter.js';
const adapter = new OracleAdapter({
  user: process.env.ORACLE_USER!,
  password: process.env.ORACLE_PASSWORD!,
  connectString: process.env.ORACLE_CONNECT_STRING!,
}, process.env.ORACLE_TABLE || 'empleados');
await adapter.initialize();
```

### Notas
- Convierte nombres de columnas a minúsculas.
- Requiere que la tabla tenga columna `id` (o se adapte el código).

## 🧩 Integración en `index.ts`

Para activar cualquiera de estos adaptadores:

1. Importa el adaptador al principio de `index.ts`.
2. Declara una propiedad en la clase (ej. `private postgresAdapter: PostgresAdapter | null = null;`).
3. En el constructor, crea la instancia si las variables de entorno existen.
4. Añade la opción en `switch_source` (ej. `'postgres'`).
5. Inclúyelo en `list_sources` y `getSchemaInfo`.
6. Inicialízalo en `start()` con un `try-catch`.

Ejemplo para PostgreSQL:

```typescript
// En el constructor
if (process.env.PG_CONNECTION_STRING) {
  this.postgresAdapter = new PostgresAdapter(process.env.PG_CONNECTION_STRING, process.env.PG_TABLE || 'empleados');
}

// En switchSource
else if (source === 'postgres') {
  if (!this.postgresAdapter) throw new Error('PostgreSQL no está configurado');
  this.activeAdapter = this.postgresAdapter;
}

// En start()
if (this.postgresAdapter) {
  try { await this.postgresAdapter.initialize(); } catch (e) { console.error(e); }
}
```

---

Con estos documentos tienes todo listo para mantener y escalar tu sistema.  🚀
```

---



