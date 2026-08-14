import schemaMigration from '../../migrations/0001_schema.sql?raw'
import seedMigration from '../../migrations/0002_seed_beta_catalog.sql?raw'

export async function applyBetaMigrations(database: D1Database): Promise<void> {
  for (const statement of schemaMigration.split('--> statement-breakpoint')) {
    if (statement.replaceAll(/--.*$/gm, '').trim().length > 0) {
      await database.prepare(statement).run()
    }
  }

  for (const statement of seedMigration.split('\n')) {
    if (statement.startsWith('INSERT INTO')) {
      await database.prepare(statement).run()
    }
  }
}
