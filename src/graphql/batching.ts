// src/graphql/batching.ts
import { graphql, GraphQLSchema, DocumentNode, parse, validate } from 'graphql';

export async function executeBatch(
  schema: GraphQLSchema,
  queries: string[],
  variables?: Record<string, any>[],
): Promise<any[]> {
  const results = [];
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    const vars = variables?.[i] || {};
    const document = parse(query);
    const validationErrors = validate(schema, document);
    if (validationErrors.length > 0) {
      results.push({ errors: validationErrors.map(e => e.message) });
      continue;
    }
    const result = await graphql({ schema, source: query, variableValues: vars });
    results.push(result);
  }
  return results;
}