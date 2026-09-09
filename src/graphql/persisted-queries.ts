// src/graphql/persisted-queries.ts
import { createHash } from 'crypto';

const persistedQueries = new Map<string, string>();

export function registerPersistedQuery(query: string): string {
  const hash = createHash('sha256').update(query).digest('hex');
  persistedQueries.set(hash, query);
  return hash;
}

export function getPersistedQuery(hash: string): string | undefined {
  return persistedQueries.get(hash);
}

export function listPersistedQueries(): string[] {
  return Array.from(persistedQueries.values());
}