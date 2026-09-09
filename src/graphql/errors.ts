// src/graphql/errors.ts
import { GraphQLError } from 'graphql';

export class CustomGraphQLError extends GraphQLError {
  constructor(message: string, code: string, details?: any) {
    super(message, {
      extensions: {
        code,
        details,
      },
    });
  }
}

export function formatError(error: GraphQLError) {
  return {
    message: error.message,
    code: error.extensions?.code || 'INTERNAL_ERROR',
    details: error.extensions?.details || null,
    path: error.path,
  };
}