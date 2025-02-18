/**
 * @file typed-event-emitter.ts
 * @description Mock implementation of TypedEventEmitter for testing.
 */

export class MockEventEmitter<
  T extends Record<string, (...args: Parameters<T[keyof T]>) => void>,
> {
  private handlers: Map<keyof T, Set<T[keyof T]>> = new Map();

  on<K extends keyof T>(event: K, handler: T[K]): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)?.add(handler);
  }

  off<K extends keyof T>(event: K, handler: T[K]): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(...args);
      }
    }
  }
}
