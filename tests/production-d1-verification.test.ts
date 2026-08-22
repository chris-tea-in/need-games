import { describe, expect, test } from 'vitest'

import {
  assertProductionD1Verification,
  type ProductionD1VerificationInput,
  productionDatabaseName,
} from '../scripts/verify-production-d1.mjs'

const productionDatabaseId = '11111111-1111-4111-8111-111111111111'
const sourceHash = 'da26d8f94ebbc932bc6cb7ea70591a19ab316e028f8bc013dcb0fbb8356a9a65'

const expectedMappings = [
  ['auth-game-apex-legends', '1172470', 'steam-1172470'],
  ['auth-game-baldurs-gate-3', '1086940', 'steam-1086940'],
  ['auth-game-counter-strike-2', '730', 'steam-730'],
  ['auth-game-elden-ring', '1245620', 'steam-1245620'],
  ['auth-game-marvel-rivals', '2767030', 'steam-2767030'],
  ['auth-game-monster-hunter-wilds', '2246340', 'steam-2246340'],
  ['auth-game-palworld', '1623730', 'steam-1623730'],
  ['auth-game-rainbow-six-siege', '359550', 'steam-359550'],
] as const

const expectedSnapshotMembers = [
  ['auth-game-apex-legends', 'auth-score-apex-legends-v1'],
  ['auth-game-baldurs-gate-3', 'auth-score-baldurs-gate-3-v1'],
  ['auth-game-counter-strike-2', 'auth-score-counter-strike-2-v1'],
  ['auth-game-elden-ring', 'auth-score-elden-ring-v1'],
  ['auth-game-league-of-legends', 'auth-score-league-of-legends-v1'],
  ['auth-game-marvel-rivals', 'auth-score-marvel-rivals-v1'],
  ['auth-game-monster-hunter-wilds', 'auth-score-monster-hunter-wilds-v1'],
  ['auth-game-palworld', 'auth-score-palworld-v1'],
  ['auth-game-rainbow-six-siege', 'auth-score-rainbow-six-siege-v1'],
  ['auth-game-valorant', 'auth-score-valorant-v1'],
] as const

const expectedAuthorityIdentities = [
  {
    id: 'auth-game-apex-legends',
    identity_key: 'apex-legends',
    canonical_title: 'Apex Legends',
    introduced_manifest_version: 'owner-authoritative-mimma-v1',
    introduced_source_hash: sourceHash,
    created_on: '2026-08-21',
  },
  {
    id: 'auth-game-baldurs-gate-3',
    identity_key: 'baldurs-gate-3',
    canonical_title: "Baldur's Gate 3",
    introduced_manifest_version: 'owner-authoritative-mimma-v1',
    introduced_source_hash: sourceHash,
    created_on: '2026-08-21',
  },
  {
    id: 'auth-game-counter-strike-2',
    identity_key: 'counter-strike-2',
    canonical_title: 'Counter-Strike 2',
    introduced_manifest_version: 'owner-authoritative-mimma-v1',
    introduced_source_hash: sourceHash,
    created_on: '2026-08-21',
  },
  {
    id: 'auth-game-elden-ring',
    identity_key: 'elden-ring',
    canonical_title: 'ELDEN RING',
    introduced_manifest_version: 'owner-authoritative-mimma-v1',
    introduced_source_hash: sourceHash,
    created_on: '2026-08-21',
  },
  {
    id: 'auth-game-league-of-legends',
    identity_key: 'league-of-legends',
    canonical_title: 'League of Legends',
    introduced_manifest_version: 'owner-authoritative-mimma-v1',
    introduced_source_hash: sourceHash,
    created_on: '2026-08-21',
  },
  {
    id: 'auth-game-marvel-rivals',
    identity_key: 'marvel-rivals',
    canonical_title: 'Marvel Rivals',
    introduced_manifest_version: 'owner-authoritative-mimma-v1',
    introduced_source_hash: sourceHash,
    created_on: '2026-08-21',
  },
  {
    id: 'auth-game-monster-hunter-wilds',
    identity_key: 'monster-hunter-wilds',
    canonical_title: 'Monster Hunter Wilds',
    introduced_manifest_version: 'owner-authoritative-mimma-v1',
    introduced_source_hash: sourceHash,
    created_on: '2026-08-21',
  },
  {
    id: 'auth-game-palworld',
    identity_key: 'palworld',
    canonical_title: 'Palworld',
    introduced_manifest_version: 'owner-authoritative-mimma-v1',
    introduced_source_hash: sourceHash,
    created_on: '2026-08-21',
  },
  {
    id: 'auth-game-rainbow-six-siege',
    identity_key: 'rainbow-six-siege',
    canonical_title: "Tom Clancy's Rainbow Six Siege",
    introduced_manifest_version: 'owner-authoritative-mimma-v1',
    introduced_source_hash: sourceHash,
    created_on: '2026-08-21',
  },
  {
    id: 'auth-game-valorant',
    identity_key: 'valorant',
    canonical_title: 'Valorant',
    introduced_manifest_version: 'owner-authoritative-mimma-v1',
    introduced_source_hash: sourceHash,
    created_on: '2026-08-21',
  },
] as const

const expectedScoreVersions = [
  ['auth-score-apex-legends-v1', 'auth-game-apex-legends', 1, 80, 80, 100, '80.0', '80.0', '100.0'],
  [
    'auth-score-baldurs-gate-3-v1',
    'auth-game-baldurs-gate-3',
    1,
    20,
    20,
    100,
    '20.0',
    '20.0',
    '100.0',
  ],
  [
    'auth-score-counter-strike-2-v1',
    'auth-game-counter-strike-2',
    1,
    100,
    65,
    80,
    '100.0',
    '65.0',
    '80.0',
  ],
  ['auth-score-elden-ring-v1', 'auth-game-elden-ring', 1, 80, 100, 40, '80.0', '100.0', '40.0'],
  [
    'auth-score-league-of-legends-v1',
    'auth-game-league-of-legends',
    1,
    69,
    77,
    100,
    '68.6',
    '77.1',
    '100.0',
  ],
  ['auth-score-marvel-rivals-v1', 'auth-game-marvel-rivals', 1, 80, 60, 80, '80.0', '60.0', '80.0'],
  [
    'auth-score-monster-hunter-wilds-v1',
    'auth-game-monster-hunter-wilds',
    1,
    80,
    40,
    60,
    '80.0',
    '40.0',
    '60.0',
  ],
  ['auth-score-palworld-v1', 'auth-game-palworld', 1, 40, 20, 70, '40.0', '20.0', '70.0'],
  [
    'auth-score-rainbow-six-siege-v1',
    'auth-game-rainbow-six-siege',
    1,
    80,
    60,
    80,
    '80.0',
    '60.0',
    '80.0',
  ],
  ['auth-score-valorant-v1', 'auth-game-valorant', 1, 100, 73, 80, '100.0', '73.3', '80.0'],
] as const

const canonicalSchemaOracle = [
  {
    name: 'catalog_release_metadata',
    type: 'table',
    sql: `create table catalog_release_metadata ( dataset_version text primary key not null, schema_version integer not null check (typeof(schema_version) = 'integer' and schema_version > 0), generated_at text not null )`,
  },
  {
    name: 'games',
    type: 'table',
    sql: `create table games ( id text primary key not null, slug text not null collate nocase unique, steam_app_id integer not null unique check (typeof(steam_app_id) = 'integer' and steam_app_id > 0), title text not null, steam_title text not null, short_description text not null, source_tags_json text not null check (json_valid(source_tags_json) and json_type(source_tags_json) = 'array'), review_category text not null, review_count integer not null check (typeof(review_count) = 'integer' and review_count >= 0), review_scope text not null, catalog_status text not null check (catalog_status = 'main_catalog'), source_app_details_url text not null, source_store_page_url text not null, source_fetched_at text not null, title_mapping_note text )`,
  },
  {
    name: 'authoritative_mimma_scores',
    type: 'table',
    sql: `create table authoritative_mimma_scores ( id text primary key not null, game_id text not null references games(id) on delete restrict, version integer not null check (typeof(version) = 'integer' and version > 0), micro_score integer not null check (typeof(micro_score) = 'integer' and micro_score between 0 and 100), meso_score integer not null check (typeof(meso_score) = 'integer' and meso_score between 0 and 100), macro_score integer not null check (typeof(macro_score) = 'integer' and macro_score between 0 and 100), provenance text not null check (provenance = 'owner_authoritative'), approval_reason text not null, approved_at text not null, version_metadata_json text not null check (json_valid(version_metadata_json)), approval_status text not null check (approval_status = 'approved'), check (micro_score <> 0 or meso_score <> 0 or macro_score <> 0), check (micro_score <> 100 or meso_score <> 100 or macro_score <> 100), unique (game_id, version) )`,
  },
  {
    name: 'games_slug_lookup_idx',
    type: 'index',
    sql: 'create index games_slug_lookup_idx on games(slug)',
  },
  {
    name: 'games_steam_app_id_lookup_idx',
    type: 'index',
    sql: 'create index games_steam_app_id_lookup_idx on games(steam_app_id)',
  },
  {
    name: 'games_catalog_title_idx',
    type: 'index',
    sql: 'create index games_catalog_title_idx on games(catalog_status, title collate nocase, steam_app_id)',
  },
  {
    name: 'games_catalog_review_count_idx',
    type: 'index',
    sql: 'create index games_catalog_review_count_idx on games(catalog_status, review_count desc, title collate nocase, steam_app_id)',
  },
  {
    name: 'authoritative_mimma_scores_game_version_idx',
    type: 'index',
    sql: 'create index authoritative_mimma_scores_game_version_idx on authoritative_mimma_scores(game_id, version)',
  },
  {
    name: 'authoritative_mimma_scores_latest_approved_idx',
    type: 'index',
    sql: 'create index authoritative_mimma_scores_latest_approved_idx on authoritative_mimma_scores(game_id, approval_status, version desc)',
  },
  {
    name: 'authoritative_mimma_scores_prevent_update',
    type: 'trigger',
    sql: `create trigger authoritative_mimma_scores_prevent_update before update on authoritative_mimma_scores begin select raise(abort, 'authoritative score history is immutable'); end`,
  },
  {
    name: 'authoritative_mimma_scores_prevent_delete',
    type: 'trigger',
    sql: `create trigger authoritative_mimma_scores_prevent_delete before delete on authoritative_mimma_scores begin select raise(abort, 'authoritative score history cannot be deleted'); end`,
  },
  {
    name: 'authoritative_mimma_seeds',
    type: 'table',
    sql: `create table authoritative_mimma_seeds ( id text primary key not null, conceptual_name text not null collate nocase unique, micro_score integer not null check (typeof(micro_score) = 'integer' and micro_score between 0 and 100), meso_score integer not null check (typeof(meso_score) = 'integer' and meso_score between 0 and 100), macro_score integer not null check (typeof(macro_score) = 'integer' and macro_score between 0 and 100), provenance text not null check (provenance = 'authoritative_sample_seed'), dataset_version text not null check (dataset_version = 'authoritative-mimma-seed-v1'), created_at text not null, check ( (micro_score = 100 and meso_score = 0 and macro_score = 0) or (micro_score = 0 and meso_score = 100 and macro_score = 0) or (micro_score = 0 and meso_score = 0 and macro_score = 100) ) )`,
  },
  {
    name: 'authoritative_mimma_seeds_prevent_update',
    type: 'trigger',
    sql: `create trigger authoritative_mimma_seeds_prevent_update before update on authoritative_mimma_seeds begin select raise(abort, 'authoritative mimma seeds are immutable'); end`,
  },
  {
    name: 'authoritative_mimma_seeds_prevent_delete',
    type: 'trigger',
    sql: `create trigger authoritative_mimma_seeds_prevent_delete before delete on authoritative_mimma_seeds begin select raise(abort, 'authoritative mimma seeds cannot be deleted'); end`,
  },
  {
    name: 'authoritative_mimma_seeds_prevent_insert',
    type: 'trigger',
    sql: `create trigger authoritative_mimma_seeds_prevent_insert before insert on authoritative_mimma_seeds begin select raise(abort, 'authoritative mimma seed set is immutable'); end`,
  },
  {
    name: 'users',
    type: 'table',
    sql: `create table users ( id text primary key not null, steam_id text not null unique check (length(steam_id) = 17 and steam_id not glob '*[^0-9]*'), steam_display_name text check ( steam_display_name is null or ( length(steam_display_name) between 1 and 64 and steam_display_name = trim(steam_display_name) ) ), profile_lookup_status text not null check (profile_lookup_status in ('verified', 'unavailable')), profile_checked_at integer not null check (typeof(profile_checked_at) = 'integer' and profile_checked_at >= 0), created_at integer not null check (typeof(created_at) = 'integer' and created_at >= 0), check (created_at <= profile_checked_at), check (profile_lookup_status <> 'verified' or steam_display_name is not null) )`,
  },
  {
    name: 'steam_login_transactions',
    type: 'table',
    sql: `create table steam_login_transactions ( token_hash text primary key not null check (length(token_hash) = 64 and token_hash not glob '*[^0-9a-f]*'), return_path text not null check (substr(return_path, 1, 1) = '/' and substr(return_path, 1, 2) <> '//'), created_at integer not null check (typeof(created_at) = 'integer' and created_at >= 0), expires_at integer not null check (typeof(expires_at) = 'integer' and expires_at > created_at), consumed_at integer check ( consumed_at is null or (typeof(consumed_at) = 'integer' and consumed_at >= created_at) ), steam_response_nonce text unique check ( steam_response_nonce is null or length(steam_response_nonce) between 1 and 512 ) )`,
  },
  {
    name: 'sessions',
    type: 'table',
    sql: `create table sessions ( token_hash text primary key not null check (length(token_hash) = 64 and token_hash not glob '*[^0-9a-f]*'), user_id text not null references users(id) on delete cascade, created_at integer not null check (typeof(created_at) = 'integer' and created_at >= 0), expires_at integer not null check (typeof(expires_at) = 'integer' and expires_at > created_at), revoked_at integer check ( revoked_at is null or (typeof(revoked_at) = 'integer' and revoked_at >= created_at) ) )`,
  },
  {
    name: 'steam_login_transactions_expiry_idx',
    type: 'index',
    sql: 'create index steam_login_transactions_expiry_idx on steam_login_transactions(expires_at)',
  },
  {
    name: 'sessions_expiry_idx',
    type: 'index',
    sql: 'create index sessions_expiry_idx on sessions(expires_at)',
  },
  {
    name: 'sessions_user_idx',
    type: 'index',
    sql: 'create index sessions_user_idx on sessions(user_id, expires_at)',
  },
  {
    name: 'authoritative_games',
    type: 'table',
    sql: `create table authoritative_games ( id text primary key not null check (id glob 'auth-game-*' and id not glob 'auth-game-steam-*'), identity_key text not null collate nocase unique check ( length(identity_key) > 0 and identity_key not glob '*[^a-z0-9-]*' and identity_key not like '-%' and identity_key not like '%-' and identity_key not like '%--%' ), canonical_title text not null collate nocase unique check (length(trim(canonical_title)) > 0), introduced_manifest_version text not null check (length(trim(introduced_manifest_version)) > 0), introduced_source_hash text not null check ( length(introduced_source_hash) = 64 and introduced_source_hash not glob '*[^0-9a-f]*' ), created_on text not null check (created_on glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]') )`,
  },
  {
    name: 'authoritative_mimma_score_versions',
    type: 'table',
    sql: `create table authoritative_mimma_score_versions ( id text primary key not null, game_id text not null references authoritative_games(id) on delete restrict, version integer not null check (typeof(version) = 'integer' and version > 0), micro_score integer not null check (typeof(micro_score) = 'integer' and micro_score between 0 and 100), meso_score integer not null check (typeof(meso_score) = 'integer' and meso_score between 0 and 100), macro_score integer not null check (typeof(macro_score) = 'integer' and macro_score between 0 and 100), micro_original_decimal text not null check ( micro_original_decimal not glob '*[^0-9.]*' and length(micro_original_decimal) between 3 and 5 and instr(micro_original_decimal, '.') = length(micro_original_decimal) - 1 and (length(micro_original_decimal) = 3 or substr(micro_original_decimal, 1, 1) <> '0') and cast(replace(micro_original_decimal, '.', '') as integer) between 0 and 1000 ), meso_original_decimal text not null check ( meso_original_decimal not glob '*[^0-9.]*' and length(meso_original_decimal) between 3 and 5 and instr(meso_original_decimal, '.') = length(meso_original_decimal) - 1 and (length(meso_original_decimal) = 3 or substr(meso_original_decimal, 1, 1) <> '0') and cast(replace(meso_original_decimal, '.', '') as integer) between 0 and 1000 ), macro_original_decimal text not null check ( macro_original_decimal not glob '*[^0-9.]*' and length(macro_original_decimal) between 3 and 5 and instr(macro_original_decimal, '.') = length(macro_original_decimal) - 1 and (length(macro_original_decimal) = 3 or substr(macro_original_decimal, 1, 1) <> '0') and cast(replace(macro_original_decimal, '.', '') as integer) between 0 and 1000 ), decimal_scale integer not null check (decimal_scale = 1), rounding_mode text not null check (rounding_mode = 'half-up-to-integer-v1'), source_manifest_version text not null check (length(trim(source_manifest_version)) > 0), source_hash text not null check ( length(source_hash) = 64 and source_hash not glob '*[^0-9a-f]*' ), provenance text not null check (provenance = 'owner_authoritative'), approval_reason text not null check (approval_reason in ('initial-owner-snapshot', 'owner-correction', 'owner-restore')), approved_on text not null check (approved_on glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'), unique (game_id, version), unique (id, game_id), check (micro_score <> 0 or meso_score <> 0 or macro_score <> 0), check (micro_score <> 100 or meso_score <> 100 or macro_score <> 100), check (micro_score = cast((cast(replace(micro_original_decimal, '.', '') as integer) + 5) / 10 as integer)), check (meso_score = cast((cast(replace(meso_original_decimal, '.', '') as integer) + 5) / 10 as integer)), check (macro_score = cast((cast(replace(macro_original_decimal, '.', '') as integer) + 5) / 10 as integer)) )`,
  },
  {
    name: 'authoritative_snapshots',
    type: 'table',
    sql: `create table authoritative_snapshots ( id text primary key not null, version integer not null unique check (typeof(version) = 'integer' and version > 0), manifest_version text not null check (length(trim(manifest_version)) > 0), source_hash text not null check ( length(source_hash) = 64 and source_hash not glob '*[^0-9a-f]*' ), expected_member_count integer not null check (typeof(expected_member_count) = 'integer' and expected_member_count > 0), state text not null check (state in ('draft', 'frozen')), created_on text not null check (created_on glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'), frozen_on text, check ((state = 'draft' and frozen_on is null) or (state = 'frozen' and frozen_on is not null and frozen_on glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')) )`,
  },
  {
    name: 'authoritative_snapshot_members',
    type: 'table',
    sql: `create table authoritative_snapshot_members ( snapshot_id text not null references authoritative_snapshots(id) on delete restrict, game_id text not null references authoritative_games(id) on delete restrict, score_id text not null, primary key (snapshot_id, game_id), unique (snapshot_id, score_id), foreign key (score_id, game_id) references authoritative_mimma_score_versions(id, game_id) on delete restrict )`,
  },
  {
    name: 'authoritative_game_mappings',
    type: 'table',
    sql: `create table authoritative_game_mappings ( id text primary key not null, game_id text not null references authoritative_games(id) on delete restrict, provider text not null check (length(provider) > 0 and provider = lower(provider) and provider not glob '*[^a-z0-9_-]*'), external_id text not null check (length(external_id) > 0), catalog_game_id text not null references games(id) on delete restrict, mapping_version integer not null check (typeof(mapping_version) = 'integer' and mapping_version > 0), decision text not null check (decision in ('verified', 'rejected', 'revoked')), verification_ref text not null check (length(trim(verification_ref)) > 0), supersedes_mapping_id text references authoritative_game_mappings(id) on delete restrict, source_manifest_version text not null check (length(trim(source_manifest_version)) > 0), source_hash text not null check ( length(source_hash) = 64 and source_hash not glob '*[^0-9a-f]*' ), decided_on text not null check (decided_on glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'), unique (game_id, provider, mapping_version), unique (id, game_id, provider, mapping_version) )`,
  },
  {
    name: 'authoritative_mimma_score_versions_game_version_idx',
    type: 'index',
    sql: 'create index authoritative_mimma_score_versions_game_version_idx on authoritative_mimma_score_versions(game_id, version desc)',
  },
  {
    name: 'authoritative_snapshots_state_version_idx',
    type: 'index',
    sql: 'create index authoritative_snapshots_state_version_idx on authoritative_snapshots(state, version desc)',
  },
  {
    name: 'authoritative_game_mappings_game_provider_version_idx',
    type: 'index',
    sql: 'create index authoritative_game_mappings_game_provider_version_idx on authoritative_game_mappings(game_id, provider, mapping_version desc)',
  },
  {
    name: 'authoritative_game_mappings_provider_external_version_idx',
    type: 'index',
    sql: 'create index authoritative_game_mappings_provider_external_version_idx on authoritative_game_mappings(provider, external_id, mapping_version desc)',
  },
  {
    name: 'authoritative_game_mappings_catalog_version_idx',
    type: 'index',
    sql: 'create index authoritative_game_mappings_catalog_version_idx on authoritative_game_mappings(catalog_game_id, mapping_version desc)',
  },
  {
    name: 'authoritative_games_prevent_update',
    type: 'trigger',
    sql: `create trigger authoritative_games_prevent_update before update on authoritative_games begin select raise(abort, 'authoritative games are immutable'); end`,
  },
  {
    name: 'authoritative_games_prevent_delete',
    type: 'trigger',
    sql: `create trigger authoritative_games_prevent_delete before delete on authoritative_games begin select raise(abort, 'authoritative games cannot be deleted'); end`,
  },
  {
    name: 'authoritative_mimma_score_versions_prevent_update',
    type: 'trigger',
    sql: `create trigger authoritative_mimma_score_versions_prevent_update before update on authoritative_mimma_score_versions begin select raise(abort, 'authoritative score versions are immutable'); end`,
  },
  {
    name: 'authoritative_mimma_score_versions_prevent_delete',
    type: 'trigger',
    sql: `create trigger authoritative_mimma_score_versions_prevent_delete before delete on authoritative_mimma_score_versions begin select raise(abort, 'authoritative score versions cannot be deleted'); end`,
  },
  {
    name: 'authoritative_snapshots_freeze_guard',
    type: 'trigger',
    sql: `create trigger authoritative_snapshots_freeze_guard before update on authoritative_snapshots when old.state = 'draft' and new.state = 'frozen' begin select raise(abort, 'snapshot freeze requires complete membership') where new.frozen_on is null or (select count(*) from authoritative_snapshot_members where snapshot_id = new.id) <> new.expected_member_count or (select count(distinct game_id) from authoritative_snapshot_members where snapshot_id = new.id) <> new.expected_member_count or (select count(distinct score_id) from authoritative_snapshot_members where snapshot_id = new.id) <> new.expected_member_count; select raise(abort, 'snapshot identity is immutable') where new.id <> old.id or new.version <> old.version or new.manifest_version <> old.manifest_version or new.source_hash <> old.source_hash or new.expected_member_count <> old.expected_member_count or new.created_on <> old.created_on; end`,
  },
  {
    name: 'authoritative_snapshots_prevent_frozen_insert',
    type: 'trigger',
    sql: `create trigger authoritative_snapshots_prevent_frozen_insert before insert on authoritative_snapshots when new.state = 'frozen' begin select raise(abort, 'snapshots must be inserted as draft before freezing'); end`,
  },
  {
    name: 'authoritative_snapshots_prevent_frozen_update',
    type: 'trigger',
    sql: `create trigger authoritative_snapshots_prevent_frozen_update before update on authoritative_snapshots when old.state = 'frozen' or not (old.state = 'draft' and new.state = 'frozen') begin select raise(abort, 'authoritative snapshots are immutable'); end`,
  },
  {
    name: 'authoritative_snapshots_prevent_delete',
    type: 'trigger',
    sql: `create trigger authoritative_snapshots_prevent_delete before delete on authoritative_snapshots begin select raise(abort, 'authoritative snapshots cannot be deleted'); end`,
  },
  {
    name: 'authoritative_snapshot_members_prevent_frozen_insert',
    type: 'trigger',
    sql: `create trigger authoritative_snapshot_members_prevent_frozen_insert before insert on authoritative_snapshot_members when (select state from authoritative_snapshots where id = new.snapshot_id) <> 'draft' begin select raise(abort, 'snapshot members can only be inserted into a draft'); end`,
  },
  {
    name: 'authoritative_snapshot_members_prevent_update',
    type: 'trigger',
    sql: `create trigger authoritative_snapshot_members_prevent_update before update on authoritative_snapshot_members begin select raise(abort, 'authoritative snapshot members are immutable'); end`,
  },
  {
    name: 'authoritative_snapshot_members_prevent_delete',
    type: 'trigger',
    sql: `create trigger authoritative_snapshot_members_prevent_delete before delete on authoritative_snapshot_members begin select raise(abort, 'authoritative snapshot members cannot be deleted'); end`,
  },
  {
    name: 'authoritative_game_mappings_prevent_update',
    type: 'trigger',
    sql: `create trigger authoritative_game_mappings_prevent_update before update on authoritative_game_mappings begin select raise(abort, 'authoritative mapping history is immutable'); end`,
  },
  {
    name: 'authoritative_game_mappings_prevent_delete',
    type: 'trigger',
    sql: `create trigger authoritative_game_mappings_prevent_delete before delete on authoritative_game_mappings begin select raise(abort, 'authoritative mapping history cannot be deleted'); end`,
  },
  {
    name: 'authoritative_game_mappings_insert_guard',
    type: 'trigger',
    sql: `create trigger authoritative_game_mappings_insert_guard before insert on authoritative_game_mappings begin select raise(abort, 'steam mapping does not match catalog identity') where new.provider = 'steam' and not exists ( select 1 from games as g where g.id = new.catalog_game_id and cast(g.steam_app_id as text) = new.external_id ); select raise(abort, 'mapping versions must be contiguous') where new.mapping_version <> coalesce(( select max(mapping_version) + 1 from authoritative_game_mappings where game_id = new.game_id and provider = new.provider ), 1); select raise(abort, 'mapping version 1 cannot supersede a row') where new.mapping_version = 1 and new.supersedes_mapping_id is not null; select raise(abort, 'mapping supersession must name the prior same-game row') where new.mapping_version > 1 and not exists ( select 1 from authoritative_game_mappings as prior where prior.id = new.supersedes_mapping_id and prior.game_id = new.game_id and prior.provider = new.provider and prior.mapping_version = new.mapping_version - 1 ); end`,
  },
] as const

type VerificationRow = Record<string, unknown>
type VerificationFixture = ProductionD1VerificationInput & {
  queryResults: Array<{ results: VerificationRow[] }>
}

function validVerification(): VerificationFixture {
  return {
    expectedDatabaseId: productionDatabaseId,
    expectedDatabaseName: productionDatabaseName,
    info: { uuid: productionDatabaseId, name: productionDatabaseName },
    queryResults: [
      { results: [{ dataset_version: 'catalog-release-v1', schema_version: 1 }] },
      {
        results: [
          { id: 1, name: '0001_schema.sql' },
          { id: 2, name: '0002_seed_beta_catalog.sql' },
          { id: 3, name: '0003_authoritative_mimma_seed.sql' },
          { id: 4, name: '0004_identity_sessions.sql' },
          { id: 5, name: '0005_owner_authoritative_mimma_v1.sql' },
        ],
      },
      {
        results: canonicalSchemaOracle.map(({ name, type, sql }) => ({
          name,
          type,
          sql,
        })),
      },
      {
        results: [
          {
            authoritative_seed_count: 62,
            legacy_score_count: 0,
            authoritative_game_count: 10,
            authoritative_score_version_count: 10,
            authoritative_snapshot_count: 1,
            authoritative_snapshot_member_count: 10,
            authoritative_mapping_count: 8,
            frozen_snapshot_count: 1,
            unmapped_authority_game_count: 2,
          },
        ],
      },
      { results: [...expectedAuthorityIdentities] },
      {
        results: expectedScoreVersions.map(
          ([
            id,
            game_id,
            version,
            micro_score,
            meso_score,
            macro_score,
            micro_original_decimal,
            meso_original_decimal,
            macro_original_decimal,
          ]) => ({
            id,
            game_id,
            version,
            micro_score,
            meso_score,
            macro_score,
            micro_original_decimal,
            meso_original_decimal,
            macro_original_decimal,
            decimal_scale: 1,
            rounding_mode: 'half-up-to-integer-v1',
            source_manifest_version: 'owner-authoritative-mimma-v1',
            source_hash: sourceHash,
            provenance: 'owner_authoritative',
            approval_reason: 'initial-owner-snapshot',
            approved_on: '2026-08-21',
          }),
        ),
      },
      {
        results: [
          {
            id: 'snapshot-owner-authoritative-mimma-v1',
            version: 1,
            manifest_version: 'owner-authoritative-mimma-v1',
            source_hash: sourceHash,
            state: 'frozen',
            expected_member_count: 10,
            member_count: 10,
            distinct_game_count: 10,
            distinct_score_count: 10,
            created_on: '2026-08-21',
            frozen_on: '2026-08-21',
          },
        ],
      },
      {
        results: expectedSnapshotMembers.map(([gameId, scoreId]) => ({
          game_id: gameId,
          score_id: scoreId,
        })),
      },
      {
        results: expectedMappings.map(([gameId, externalId, catalogGameId]) => ({
          id: `auth-map-steam-${gameId.replace('auth-game-', '')}-v1`,
          game_id: gameId,
          provider: 'steam',
          external_id: externalId,
          catalog_game_id: catalogGameId,
          mapping_version: 1,
          decision: 'verified',
          verification_ref: 'owner-approved-manifest-v1',
          supersedes_mapping_id: null,
          source_manifest_version: 'owner-authoritative-mimma-v1',
          source_hash: sourceHash,
          decided_on: '2026-08-21',
        })),
      },
      { results: [{ game_id: 'auth-game-league-of-legends' }, { game_id: 'auth-game-valorant' }] },
      {
        results: [
          {
            source_table: 'authoritative_games',
            row_count: 10,
            source_hash_count: 1,
            source_hash: sourceHash,
            source_hash_max: sourceHash,
          },
          {
            source_table: 'authoritative_mimma_score_versions',
            row_count: 10,
            source_hash_count: 1,
            source_hash: sourceHash,
            source_hash_max: sourceHash,
          },
          {
            source_table: 'authoritative_snapshots',
            row_count: 1,
            source_hash_count: 1,
            source_hash: sourceHash,
            source_hash_max: sourceHash,
          },
          {
            source_table: 'authoritative_game_mappings',
            row_count: 8,
            source_hash_count: 1,
            source_hash: sourceHash,
            source_hash_max: sourceHash,
          },
        ],
      },
    ],
  }
}

describe('production D1 verification', () => {
  test('keeps an independently authored exact SQL identity for every schema object', () => {
    expect(canonicalSchemaOracle).toHaveLength(45)
    expect(canonicalSchemaOracle[0].sql).toBe(
      "create table catalog_release_metadata ( dataset_version text primary key not null, schema_version integer not null check (typeof(schema_version) = 'integer' and schema_version > 0), generated_at text not null )",
    )
  })

  test('accepts the exact owner-authoritative schema, release, counts, and mapping state', () => {
    expect(() => assertProductionD1Verification(validVerification())).not.toThrow()
  })

  test('accepts expected operational identity rows during recurring verification', () => {
    const operationalIdentity = validVerification()
    Object.assign(operationalIdentity.queryResults[3].results[0], {
      user_count: 1,
      login_transaction_count: 2,
      session_count: 1,
    })
    expect(() => assertProductionD1Verification(operationalIdentity)).not.toThrow()
  })

  test.each([
    ['an unexpected database identity', { info: { uuid: productionDatabaseId, name: 'other-db' } }],
    ['a missing catalog release', { queryResults: [{ results: [] }, { results: [] }] }],
    [
      'an unexpected migration prefix',
      {
        queryResults: [
          { results: [{ dataset_version: 'catalog-release-v1', schema_version: 1 }] },
          { results: [{ id: 1, name: '0009_unexpected.sql' }] },
        ],
      },
    ],
    [
      'an additional migration after the owner release',
      {
        queryResults: [
          { results: [{ dataset_version: 'catalog-release-v1', schema_version: 1 }] },
          {
            results: [
              { id: 1, name: '0001_schema.sql' },
              { id: 2, name: '0002_seed_beta_catalog.sql' },
              { id: 3, name: '0003_authoritative_mimma_seed.sql' },
              { id: 4, name: '0004_identity_sessions.sql' },
              { id: 5, name: '0005_owner_authoritative_mimma_v1.sql' },
              { id: 6, name: '0006_unexpected.sql' },
            ],
          },
        ],
      },
    ],
    [
      'unexpected migration IDs with the expected names',
      {
        queryResults: [
          { results: [{ dataset_version: 'catalog-release-v1', schema_version: 1 }] },
          {
            results: [
              { id: 7, name: '0001_schema.sql' },
              { id: 8, name: '0002_seed_beta_catalog.sql' },
            ],
          },
        ],
      },
    ],
  ])('rejects %s before release', (_description, overrides) => {
    expect(() =>
      assertProductionD1Verification({
        ...validVerification(),
        ...(overrides as Partial<VerificationFixture>),
      }),
    ).toThrow(/production D1 verification failed/i)
  })

  test('rejects a missing schema object', () => {
    const fixture = validVerification()
    fixture.queryResults[2].results = fixture.queryResults[2].results.slice(1)
    expect(() => assertProductionD1Verification(fixture)).toThrow(/schema objects/i)
  })

  test('rejects a schema object with the wrong SQLite object type', () => {
    const fixture = validVerification()
    const row = fixture.queryResults[2].results.find(
      (candidate) => candidate.name === 'sessions_user_idx',
    )
    if (row === undefined) throw new Error('fixture row missing')
    row.type = 'table'
    expect(() => assertProductionD1Verification(fixture)).toThrow(/schema objects/i)
  })

  test('rejects altered schema SQL even when object names and types remain present', () => {
    const fixture = validVerification()
    const row = fixture.queryResults[2].results.find((candidate) => candidate.name === 'games')
    if (row === undefined) throw new Error('fixture row missing')
    row.sql = 'CREATE TABLE games (steam_app_id TEXT)'
    expect(() => assertProductionD1Verification(fixture)).toThrow(/schema SQL/i)
  })

  test('rejects a constraint-preserving schema mutation that retains the old fragment', () => {
    const fixture = validVerification()
    const row = fixture.queryResults[2].results.find((candidate) => candidate.name === 'games')
    if (row === undefined) throw new Error('fixture row missing')
    row.sql = 'CREATE TABLE games (steam_app_id integer not null, altered_constraint TEXT)'
    expect(() => assertProductionD1Verification(fixture)).toThrow(/schema SQL/i)
  })

  test('rejects an extra schema object', () => {
    const fixture = validVerification()
    fixture.queryResults[2].results.push({
      name: 'unexpected_object',
      type: 'table',
      sql: 'CREATE TABLE unexpected_object (id TEXT)',
    })
    expect(() => assertProductionD1Verification(fixture)).toThrow(/schema objects/i)
  })

  test('rejects count, frozen state, mapping, unmapped, or source-hash drift', () => {
    const mutations: Array<(fixture: VerificationFixture) => void> = [
      (fixture) => {
        fixture.queryResults[3].results[0].authoritative_game_count = 9
      },
      (fixture) => {
        fixture.queryResults[6].results[0].state = 'draft'
      },
      (fixture) => {
        fixture.queryResults[8].results.pop()
      },
      (fixture) => {
        fixture.queryResults[9].results[0].game_id = 'auth-game-counter-strike-2'
      },
      (fixture) => {
        fixture.queryResults[10].results[0].source_hash = '0'.repeat(64)
      },
    ]
    for (const mutate of mutations) {
      const fixture = validVerification()
      mutate(fixture)
      expect(() => assertProductionD1Verification(fixture)).toThrow(
        /production D1 verification failed/i,
      )
    }
  })

  test('rejects altered identity, score, snapshot metadata, and mapping decision payloads', () => {
    const mutations: Array<(fixture: VerificationFixture) => void> = [
      (fixture) => {
        fixture.queryResults[4].results[0].canonical_title = 'Changed title'
      },
      (fixture) => {
        fixture.queryResults[5].results[0].micro_original_decimal = '80.1'
      },
      (fixture) => {
        fixture.queryResults[5].results[0].micro_score = 81
      },
      (fixture) => {
        fixture.queryResults[6].results[0].created_on = '2026-08-22'
      },
      (fixture) => {
        fixture.queryResults[8].results[0].decided_on = '2026-08-22'
      },
    ]
    for (const mutate of mutations) {
      const fixture = validVerification()
      mutate(fixture)
      expect(() => assertProductionD1Verification(fixture)).toThrow(
        /production D1 verification failed/i,
      )
    }
  })
})
