
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
- `graphql_mutation` – Crea, actualiza o elimina registros. Acepta `source` para
  declarar sobre qué fuente crees estar trabajando; si no coincide con la activa,
  la operación se cancela sin tocar nada.
- `switch_source` – Cambia la fuente de datos activa.
- `list_sources` – Lista las fuentes disponibles.
- `register_persisted_query` – Registra una consulta persistida.
- `get_metrics` – Obtiene métricas de rendimiento.
- `get_schema` – Muestra el esquema de la fuente activa, derivado del esquema real.

### Agregaciones

```graphql
{ aggregate(field: "salario") { avg min max sum countNoNulos aviso } }
```

Devuelve las cinco operaciones a la vez, con **nombres fijos** (no alias dinámicos del
tipo `salario_avg`). El campo `aviso` aparece cuando hay algo que el usuario debería
saber: filas sin dato, o un campo que no es numérico.

Evita que el modelo se traiga todos los registros para calcular una media él mismo.

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

La primera llamada devuelve un aviso con el registro concreto que se va a borrar. La
segunda debe llevar `confirm: true` **y el mismo id**.

La confirmación está atada al **objetivo**, no al texto de la consulta: el modelo puede
reescribir la mutación, pero no puede confirmar el borrado de otro registro. Es de un
solo uso y caduca a los 120 segundos.

### Declarar la fuente en las mutaciones

```json
{
  "query": "mutation { deleteRecord(id: \"1\") }",
  "source": "sqlite",
  "confirm": true
}
```

Si `source` no coincide con la fuente activa, la operación se cancela **sin modificar
nada** y el error dice qué hacer. Existe porque la fuente activa es un estado invisible
para quien llama, y una suposición equivocada puede escribir en la base de datos que no
era.

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

- **El modelo escribe en la fuente equivocada**: pasa cuando asume que ya cambió de
  fuente sin llamar a `switch_source`. Desde la v0.5 las mutaciones aceptan `source` y
  el servidor lo verifica antes de ejecutar. Revisa que el modelo lo esté declarando.
- **Compilar no despliega**: tras `npm run build` hay que **reiniciar el proceso del
  servidor**. Cerrar la ventana del cliente no siempre lo mata. Si arreglas algo y el
  comportamiento no cambia, empieza por aquí.
- **El servidor probado no es el que usa el cliente**: `dotenv` busca el `.env` en el
  directorio de trabajo **actual**, que no es el de tu proyecto cuando lo lanza el
  cliente. Pon todas las variables en la configuración del cliente MCP, con rutas
  absolutas.
- **Un visor de base de datos muestra datos viejos**: los visores cachean al abrir el
  archivo y no se enteran de los cambios de otros procesos. Recarga antes de concluir
  que algo no se guardó.
- **Error de tipos en GraphQL**: revisa los logs de inicialización para ver el esquema
  inferido.
- **Google Sheets no carga**: verifica que la URL de Apps Script sea accesible y que el
  nombre de la hoja coincida.
- **SQLite no funciona**: comprueba que la base de datos exista y tenga la tabla
  indicada.
- **Error de compilación TS5055**: revisa que `tsconfig.json` incluya solo `src/**/*`.

## 📝 Cambios recientes

### v0.5 — correcciones de integridad

Salieron de probar el servidor contra un modelo local y observar qué hacía. Todas
compilaban sin error antes del arreglo.

**Datos**

- Las comparaciones y la ordenación se hacían sobre **texto**: en CSV y Google Sheets
  todo llega como cadena, así que `"9" > "50000"` era verdadero. Un salario de nueve
  mil apareciendo en un filtro de "mayor que cincuenta mil". Añadido `coaccionar()`,
  que convierte según el tipo declarado antes de comparar.
- La caché podía servir datos de antes de una modificación. Ahora la clave lleva un
  número de versión que sube en cada cambio: una entrada vieja no puede servirse.
- `clearCache` estaba duplicado en los **siete** adaptadores. Ahora hay uno solo en
  `BaseAdapter`.
- Un filtro sin valor devolvía lista vacía en silencio, y el modelo entraba en bucle
  reescribiendo la consulta. Ahora lanza un error que explica la sintaxis correcta.

**Esquema**

- Todos los tipos se llamaban `Record`, en todas las fuentes. Con dos fuentes de
  campos parecidos, el modelo no tenía nada con que distinguirlas. Ahora el nombre
  incluye la fuente: `RecordSqliteEmpleados`.
- `get_schema` llevaba su **propia lista** de consultas escrita a mano. Al añadir
  `aggregate` al esquema, ahí no aparecía, y el modelo seguía diciendo que no había
  agregaciones. Ahora se deriva del esquema real.
- Cada campo se podía filtrar de dos maneras: por `where` y por un argumento suelto.
  Se pagaba dos veces en el esquema. Eliminados los sueltos.
- La consulta `departamentos` se declaraba siempre, incluso en fuentes sin tabla de
  departamentos. Ahora solo donde existe.
- Expuestas las agregaciones, que ya estaban implementadas y no se podían usar.

**Seguridad**

- La confirmación de borrado no estaba atada a nada: `confirm: true` valía para
  cualquier mutación. Se podía aprobar el borrado del registro 11 y ejecutar el del 12.
  Ahora se ata al id, es de un solo uso y caduca.
- Las mutaciones aceptan `source` y el servidor lo verifica. Evita escribir en la
  fuente equivocada cuando el modelo asume mal.

**Adaptadores de base de datos**

- MongoDB comparaba `_id` como cadena contra un `ObjectId`: no coincidía nunca.
- `deleteRecord` de MongoDB devolvía `true` aunque no borrara nada.
- Oracle no compilaba por falta de tipos. Añadido `src/types/oracledb.d.ts`.

### Estado de los adaptadores

Los cuatro de base de datos **compilan pero no se han ejecutado** contra un servidor
real. En el único que se revisó a fondo, MongoDB, aparecieron dos bugs de lógica que
solo se ven al conectarse. Es razonable esperar más en los otros.

## 📄 Licencia

MIT – Libre uso y modificación.

---

