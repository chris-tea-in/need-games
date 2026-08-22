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

export async function resetBetaDatabase(database: D1Database): Promise<void> {
  const existingSchema = await database
    .prepare(
      "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'authoritative_games'",
    )
    .first<{ present: number }>()
  if (!existingSchema) {
    await applyBetaMigrations(database)
    return
  }

  const triggerNames = [
    'authoritative_game_mappings_insert_guard',
    'authoritative_game_mappings_prevent_delete',
    'authoritative_game_mappings_prevent_update',
    'authoritative_snapshot_members_prevent_delete',
    'authoritative_snapshot_members_prevent_update',
    'authoritative_snapshot_members_prevent_frozen_insert',
    'authoritative_snapshots_prevent_delete',
    'authoritative_snapshots_prevent_frozen_insert',
    'authoritative_snapshots_prevent_frozen_update',
    'authoritative_snapshots_freeze_guard',
    'authoritative_mimma_score_versions_prevent_delete',
    'authoritative_mimma_score_versions_prevent_update',
    'authoritative_games_prevent_delete',
    'authoritative_games_prevent_update',
    'authoritative_mimma_scores_prevent_delete',
    'authoritative_mimma_scores_prevent_update',
    'authoritative_mimma_seeds_prevent_insert',
    'authoritative_mimma_seeds_prevent_delete',
    'authoritative_mimma_seeds_prevent_update',
  ]
  const indexNames = [
    'authoritative_game_mappings_catalog_version_idx',
    'authoritative_game_mappings_provider_external_version_idx',
    'authoritative_game_mappings_game_provider_version_idx',
    'authoritative_snapshots_state_version_idx',
    'authoritative_mimma_score_versions_game_version_idx',
    'authoritative_mimma_scores_latest_approved_idx',
    'authoritative_mimma_scores_game_version_idx',
    'games_catalog_review_count_idx',
    'games_catalog_title_idx',
    'games_steam_app_id_lookup_idx',
    'games_slug_lookup_idx',
  ]
  const tableNames = [
    'authoritative_game_mappings',
    'authoritative_snapshot_members',
    'authoritative_snapshots',
    'authoritative_mimma_score_versions',
    'authoritative_games',
    'sessions',
    'steam_login_transactions',
    'users',
    'authoritative_mimma_scores',
    'games',
    'catalog_release_metadata',
    'authoritative_mimma_seeds',
  ]

  await database.batch(
    triggerNames.map((name) => database.prepare(`DROP TRIGGER IF EXISTS ${name}`)),
  )
  await database.batch(indexNames.map((name) => database.prepare(`DROP INDEX ${name}`)))
  const mappingRows = await database
    .prepare('SELECT id FROM authoritative_game_mappings ORDER BY mapping_version DESC, id DESC')
    .all<{ id: string }>()
  for (const row of mappingRows.results) {
    await database
      .prepare('DELETE FROM authoritative_game_mappings WHERE id = ?')
      .bind(row.id)
      .run()
  }
  for (const name of tableNames.slice(1)) {
    try {
      await database.prepare(`DELETE FROM ${name}`).run()
    } catch (error) {
      throw new Error(`failed to clear ${name}`, { cause: error })
    }
  }
  for (const name of tableNames) {
    try {
      await database.prepare(`DROP TABLE ${name}`).run()
    } catch (error) {
      throw new Error(`failed to drop ${name}`, { cause: error })
    }
  }
  await applyBetaMigrations(database)
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
