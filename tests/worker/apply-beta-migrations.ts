import schemaMigration from '../../migrations/0001_schema.sql?raw'
import seedMigration from '../../migrations/0002_seed_beta_catalog.sql?raw'
import authoritativeSeedMigration from '../../migrations/0003_authoritative_mimma_seed.sql?raw'

async function applyStatementBreakpoints(database: D1Database, sql: string): Promise<void> {
  for (const statement of sql.split('--> statement-breakpoint')) {
    if (statement.replaceAll(/--.*$/gm, '').trim().length > 0) {
      await database.prepare(statement).run()
    }
  }
}

export async function applyBetaMigrations(database: D1Database): Promise<void> {
  await applyStatementBreakpoints(database, schemaMigration)

  for (const statement of seedMigration.split('\n')) {
    if (statement.startsWith('INSERT INTO')) {
      await database.prepare(statement).run()
    }
  }

  await applyStatementBreakpoints(database, authoritativeSeedMigration)
}
