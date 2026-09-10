
---

# 📄 README.md

```markdown
# MCP GraphQL Server Multi-Fuente



Servidor MCP (Model Context Protocol) que expone una API GraphQL dinámica sobre múltiples fuentes de datos: CSV, Google Sheets, SQLite, PostgreSQL, MySQL, MongoDB y Oracle.

## ✨ Características

- 🔌 **Adaptadores múltiples**: CSV, Google Sheets, SQLite, PostgreSQL, MySQL, MongoDB, Oracle (preparado).
- 🧠 **Esquema GraphQL dinámico**: genera automáticamente el esquema según los datos.
- 🔍 **Consultas flexibles**: filtros avanzados (`where` con operadores), ordenamiento, paginación, selección de campos.
- ✍️ **Mutaciones**: crear, actualizar y eliminar registros con confirmación para eliminaciones.
- 🚀 **Batching**: ejecuta varias consultas en una sola petición.
- 💾 **Persisted Queries**: guarda consultas frecuentes y reutilízalas por hash.
- 📊 **Métricas**: seguimiento de rendimiento de consultas y mutaciones.
- 🛡️ **Seguridad**: límite de complejidad, errores personalizados, directiva `@auth` de ejemplo.
- 🔄 **Cambio de fuente dinámico**: alterna entre bases de datos sin reiniciar.

## 🏗️ Arquitectura

```
Cliente MCP (LM Studio, Claude Desktop)
        │ (stdio)
        ▼
Servidor MCP (index.ts)
        │
        ├── Herramientas: graphql_query, graphql_mutation, switch_source, list_sources, etc.
        │
        ▼
Capa GraphQL (schema.ts + resolvers.ts)
        │
        ├── Adaptadores (BaseAdapter)
        │    ├── CSVAdapter
        │    ├── GoogleSheetsAdapter
        │    ├── SQLiteAdapter
        │    ├── PostgresAdapter
        │    ├── MySQLAdapter
        │    ├── MongoDBAdapter
        │    └── OracleAdapter
        │
        ▼
Fuentes de datos (CSV, Google Sheets, SQLite, ...)
```

## 📦 Requisitos

- Node.js 18 o superior
- npm 9+
- Para SQLite: `better-sqlite3`
- Para PostgreSQL: `pg`
- Para MySQL: `mysql2`
- Para MongoDB: `mongodb`
- Para Oracle: `oracledb` (requiere cliente nativo)

## 🛠️ Instalación

```bash
# Clonar o descargar el proyecto
git clone <url-del-repo>
cd mcp-graphql-server

# Instalar dependencias base
npm install

# Instalar dependencias específicas según adaptadores a usar
npm install better-sqlite3   # SQLite
npm install pg               # PostgreSQL
npm install mysql2           # MySQL
npm install mongodb          # MongoDB
npm install oracledb         # Oracle (requiere Oracle Instant Client)
```

## ⚙️ Configuración

Crea un archivo `.env` en la raíz con las variables de entorno:

```env
# Fuente activa por defecto: csv, google-sheets, sqlite, postgres, mysql, mongodb, oracle
DEFAULT_SOURCE=google-sheets

# CSV
CSV_FILE_PATH=./src/data/sample.csv

# Google Sheets
GOOGLE_SHEETS_API_URL=https://script.google.com/macros/s/TU_ID/exec
GOOGLE_SHEETS_NAME=Empleados

# SQLite
SQLITE_DB_PATH=./src/data/sample.db
SQLITE_TABLE=empleados

# PostgreSQL
PG_CONNECTION_STRING=postgres://user:password@localhost:5432/dbname
PG_TABLE=empleados

# MySQL
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=secret
MYSQL_DATABASE=test
MYSQL_TABLE=empleados

# MongoDB
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=test
MONGO_COLLECTION=empleados

# Oracle
ORACLE_USER=system
ORACLE_PASSWORD=oracle
ORACLE_CONNECT_STRING=localhost:1521/XEPDB1
ORACLE_TABLE=empleados
```

## 🚀 Uso

### Compilar

```bash
npm run build
```

### Iniciar el servidor

```bash
node dist/index.js
```

El servidor se conecta por stdio, listo para que un cliente MCP (como LM Studio o Claude Desktop) lo utilice.

### Configurar en LM Studio

1. Abre LM Studio y carga un modelo (ej. Gemma).
2. Ve a la configuración del chat y agrega un servidor MCP.
3. Comando: `node`
4. Argumentos: `H:\deepseek-graphql-mcp\dist\index.js`
5. Variables de entorno: copia las de tu `.env`.

Reinicia la conversación para que el modelo reconozca las herramientas.

### Herramientas disponibles

- `graphql_query` – Ejecuta consultas GraphQL.
- `graphql_batch` – Ejecuta varias consultas en una llamada.
- `graphql_mutation` – Crea, actualiza o elimina registros (con confirmación para DELETE).
- `switch_source` – Cambia la fuente de datos activa.
- `list_sources` – Lista las fuentes disponibles.
- `register_persisted_query` – Registra una consulta persistida.
- `get_metrics` – Obtiene métricas de rendimiento.
- `get_schema` – Muestra el esquema de la fuente activa.

## 🧪 Ejemplos de consultas

### Obtener todos los registros

```graphql
{
  records {
    id
    nombre
    email
  }
}
```

### Filtrar y ordenar

```graphql
{
  records(
    where: { salario: { operator: gt, value: "50000" } },
    orderBy: [{ field: "salario", direction: "desc" }]
  ) {
    nombre
    salario
  }
}
```

### Obtener departamentos (solo Google Sheets)

```graphql
{
  departamentos {
    id
    nombre
    ubicacion
  }
}
```

### Crear registro

```graphql
mutation {
  createRecord(input: { nombre: "Nuevo", email: "nuevo@email.com" }) {
    id
    nombre
  }
}
```

### Eliminar con confirmación

```graphql
mutation {
  deleteRecord(id: "11")
}
```

La primera llamada devuelve una advertencia; el modelo debe llamar de nuevo con `confirm: true`.

## 🔌 Adaptadores incluidos

| Adaptador | Archivo | Dependencia | Estado |
|-----------|---------|-------------|--------|
| CSV | `csv-adapter.ts` | `csv-parse`, `csv-stringify` | ✅ Probado |
| Google Sheets | `google-sheets-adapter.ts` | `axios` | ✅ Probado |
| SQLite | `sqlite-adapter.ts` | `better-sqlite3` | ✅ Probado |
| PostgreSQL | `postgres-adapter.ts` | `pg` | 📦 Catálogo |
| MySQL | `mysql-adapter.ts` | `mysql2` | 📦 Catálogo |
| MongoDB | `mongodb-adapter.ts` | `mongodb` | 📦 Catálogo |
| Oracle | `oracle-adapter.ts` | `oracledb` | 📦 Catálogo |

Consulta `EXTRA.md` para más detalles sobre los adaptadores de base de datos.

## 🧰 Solución de problemas

- **El modelo no cambia de fuente**: Refuerza el system prompt con instrucciones claras sobre `switch_source`.
- **Error de tipos en GraphQL**: Asegúrate de que el esquema se haya inferido correctamente (revisa logs de inicialización).
- **Google Sheets no carga**: Verifica que la URL de Apps Script sea pública y que el nombre de la hoja coincida.
- **SQLite no funciona**: Comprueba que la base de datos exista y tenga la tabla indicada.
- **Error de compilación TS5055**: Revisa que `tsconfig.json` incluya solo `src/**/*` y no archivos sueltos en la raíz.

## 📄 Licencia

MIT – Libre uso y modificación.

---

