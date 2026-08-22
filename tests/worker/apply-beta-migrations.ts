import schemaMigration from '../../migrations/0001_schema.sql?raw'
import seedMigration from '../../migrations/0002_seed_beta_catalog.sql?raw'
import authoritativeSeedMigration from '../../migrations/0003_authoritative_mimma_seed.sql?raw'
import identitySessionsMigration from '../../migrations/0004_identity_sessions.sql?raw'
import ownerAuthoritativeMigration from '../../migrations/0005_owner_authoritative_mimma_v1.sql?raw'

function removeComments(statement: string): string {
  return statement.replaceAll(/--.*$/gm, '').trim()
}

export function prepareMigrationStatements(
  database: D1Database,
  sql: string,
): D1PreparedStatement[] {
  return sql
    .split('--> statement-breakpoint')
    .filter((statement) => removeComments(statement).length > 0)
    .map((statement) => database.prepare(statement))
}

function prepareSeedStatements(database: D1Database): D1PreparedStatement[] {
  return seedMigration
    .split('\n')
    .filter((statement) => statement.startsWith('INSERT INTO'))
    .map((statement) => database.prepare(statement))
}

export async function applyBetaMigrations(database: D1Database): Promise<void> {
  await database.batch(prepareMigrationStatements(database, schemaMigration))
  await database.batch(prepareSeedStatements(database))
  await database.batch(prepareMigrationStatements(database, authoritativeSeedMigration))
  await database.batch(prepareMigrationStatements(database, identitySessionsMigration))
  await database.batch(prepareMigrationStatements(database, ownerAuthoritativeMigration))
}

export async function applyMigrationWithInjectedFailure(
  database: D1Database,
  migration: string,
): Promise<void> {
  await database.batch([
    ...prepareMigrationStatements(database, migration),
    database.prepare('SELECT * FROM table_that_does_not_exist_for_rollback_test'),
  ])
}
