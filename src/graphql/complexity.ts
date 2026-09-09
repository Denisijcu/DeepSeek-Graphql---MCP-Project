// src/graphql/complexity.ts
import { GraphQLSchema, DocumentNode, visit, OperationDefinitionNode } from 'graphql';

const MAX_DEPTH = 5;        // Profundidad máxima
const MAX_FIELDS = 20;      // Máximo de campos por objeto

export function validateComplexity(schema: GraphQLSchema, document: DocumentNode): void {
  let depth = 0;
  let maxDepth = 0;
  let totalFields = 0;

  visit(document, {
    OperationDefinition(node: OperationDefinitionNode) {
      depth = 0;
    },
    enter(node) {
      if ('selectionSet' in node) {
        depth++;
        maxDepth = Math.max(maxDepth, depth);
      }
      if ('name' in node && node.name?.value) {
        totalFields++;
      }
    },
    leave(node) {
      if ('selectionSet' in node) {
        depth--;
      }
    },
  });

  if (maxDepth > MAX_DEPTH) {
    throw new Error(`La consulta excede la profundidad máxima permitida (${MAX_DEPTH}). Profundidad actual: ${maxDepth}`);
  }
  if (totalFields > MAX_FIELDS) {
    throw new Error(`La consulta excede el número máximo de campos (${MAX_FIELDS}). Campos actuales: ${totalFields}`);
  }
}