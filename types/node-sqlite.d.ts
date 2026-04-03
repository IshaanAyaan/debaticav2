declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(location: string, options?: Record<string, unknown>)
    close(): void
    exec(sql: string): void
    prepare(sql: string): StatementSync
  }

  export class StatementSync {
    all(params?: Record<string, unknown>): Record<string, unknown>[]
    get(params?: Record<string, unknown>): Record<string, unknown> | undefined
    run(...params: unknown[]): {
      changes: number
      lastInsertRowid: number | bigint
    }
    iterate(params?: Record<string, unknown>): Iterable<Record<string, unknown>>
  }
}
