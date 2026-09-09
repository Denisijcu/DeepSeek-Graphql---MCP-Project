// src/graphql/metrics.ts
interface Metric {
  count: number;
  totalTime: number;
  avgTime: number;
  lastTime: number;
  errors: number;
}

const metrics: Map<string, Metric> = new Map();

export function recordMetric(operationName: string, duration: number, error: boolean = false) {
  const existing = metrics.get(operationName) || {
    count: 0,
    totalTime: 0,
    avgTime: 0,
    lastTime: 0,
    errors: 0,
  };

  existing.count++;
  existing.totalTime += duration;
  existing.avgTime = existing.totalTime / existing.count;
  existing.lastTime = duration;
  if (error) existing.errors++;

  metrics.set(operationName, existing);
}

export function getMetrics() {
  return Array.from(metrics.entries()).map(([name, m]) => ({
    operation: name,
    ...m,
  }));
}

export function resetMetrics() {
  metrics.clear();
}