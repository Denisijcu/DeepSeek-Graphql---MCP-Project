// src/types/oracledb.d.ts
//
// El paquete oracledb no trae definiciones de TypeScript propias y no
// existe un @types/oracledb oficial mantenido, asi que TypeScript falla
// con TS7016 en cuanto se importa.
//
// Esta declaracion minima cubre lo que usa el adaptador. No pretende
// describir la API entera de Oracle: solo lo suficiente para compilar sin
// desactivar las comprobaciones de todo el proyecto.
//
// Alternativa descartada: poner "noImplicitAny": false en tsconfig.json.
// Eso apaga la comprobacion en TODOS los archivos para arreglar uno.
//
// ---------------------------------------------------------------------
// SOBRE EL PATRON `export =`
//
// El adaptador escribe `oracledb.Connection` como TIPO, no solo como
// valor. Para que eso funcione, "oracledb" tiene que ser un espacio de
// nombres, no un objeto.
//
// Un primer intento declaro `const oracledb` y `namespace oracledb` a la
// vez. No compila: TypeScript solo fusiona un namespace con function,
// class o enum, nunca con const.
//
// El patron correcto para un modulo CommonJS que exporta un objeto con
// tipos dentro es declarar el namespace y hacer `export =`. Asi valen
// las dos formas:
//
//   import oracledb from 'oracledb';   ->  oracledb.getConnection(...)
//   let c: oracledb.Connection;        ->  el tipo tambien resuelve
// ---------------------------------------------------------------------

declare module 'oracledb' {
  namespace oracledb {
    interface Connection {
      execute<T = any>(
        sql: string,
        binds?: any[] | Record<string, any>,
        options?: ExecuteOptions
      ): Promise<Result<T>>;
      close(): Promise<void>;
      commit(): Promise<void>;
      rollback(): Promise<void>;
    }

    interface Pool {
      getConnection(): Promise<Connection>;
      close(drainTime?: number): Promise<void>;
    }

    interface ExecuteOptions {
      outFormat?: number;
      autoCommit?: boolean;
      maxRows?: number;
      fetchInfo?: Record<string, { type: number }>;
    }

    interface Result<T = any> {
      rows?: T[];
      metaData?: Array<{ name: string; dbTypeName?: string }>;
      rowsAffected?: number;
      outBinds?: any;
    }

    interface ConnectionAttributes {
      user?: string;
      password?: string;
      connectString?: string;
      poolMin?: number;
      poolMax?: number;
      poolIncrement?: number;
    }

    // Constantes
    const OUT_FORMAT_OBJECT: number;
    const OUT_FORMAT_ARRAY: number;
    const STRING: number;
    const NUMBER: number;
    const DATE: number;

    // Propiedades de configuracion global
    let outFormat: number;
    let autoCommit: boolean;
    let fetchAsString: number[];

    // Funciones
    function getConnection(
      attributes: ConnectionAttributes
    ): Promise<Connection>;

    function createPool(attributes: ConnectionAttributes): Promise<Pool>;

    function initOracleClient(options?: { libDir?: string }): void;
  }

  export = oracledb;
}
