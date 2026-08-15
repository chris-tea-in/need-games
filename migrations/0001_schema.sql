CREATE TABLE catalog_release_metadata (
  dataset_version TEXT PRIMARY KEY NOT NULL,
  schema_version INTEGER NOT NULL CHECK (typeof(schema_version) = 'integer' AND schema_version > 0),
  generated_at TEXT NOT NULL
);
--> statement-breakpoint

CREATE TABLE games (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL COLLATE NOCASE UNIQUE,
  steam_app_id INTEGER NOT NULL UNIQUE CHECK (typeof(steam_app_id) = 'integer' AND steam_app_id > 0),
  title TEXT NOT NULL,
  steam_title TEXT NOT NULL,
  short_description TEXT NOT NULL,
  source_tags_json TEXT NOT NULL CHECK (json_valid(source_tags_json) AND json_type(source_tags_json) = 'array'),
  review_category TEXT NOT NULL,
  review_count INTEGER NOT NULL CHECK (typeof(review_count) = 'integer' AND review_count >= 0),
  review_scope TEXT NOT NULL,
  catalog_status TEXT NOT NULL CHECK (catalog_status = 'main_catalog'),
  source_app_details_url TEXT NOT NULL,
  source_store_page_url TEXT NOT NULL,
  source_fetched_at TEXT NOT NULL,
  title_mapping_note TEXT
);
--> statement-breakpoint

CREATE TABLE authoritative_mimma_scores (
  id TEXT PRIMARY KEY NOT NULL,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (typeof(version) = 'integer' AND version > 0),
  micro_score INTEGER NOT NULL CHECK (typeof(micro_score) = 'integer' AND micro_score BETWEEN 0 AND 100),
  meso_score INTEGER NOT NULL CHECK (typeof(meso_score) = 'integer' AND meso_score BETWEEN 0 AND 100),
  macro_score INTEGER NOT NULL CHECK (typeof(macro_score) = 'integer' AND macro_score BETWEEN 0 AND 100),
  provenance TEXT NOT NULL CHECK (provenance = 'owner_authoritative'),
  approval_reason TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  version_metadata_json TEXT NOT NULL CHECK (json_valid(version_metadata_json)),
  approval_status TEXT NOT NULL CHECK (approval_status = 'approved'),
  CHECK (micro_score <> 0 OR meso_score <> 0 OR macro_score <> 0),
  CHECK (micro_score <> 100 OR meso_score <> 100 OR macro_score <> 100),
  UNIQUE (game_id, version)
);
--> statement-breakpoint

CREATE INDEX games_slug_lookup_idx ON games(slug);
--> statement-breakpoint
CREATE INDEX games_steam_app_id_lookup_idx ON games(steam_app_id);
--> statement-breakpoint
CREATE INDEX games_catalog_title_idx ON games(catalog_status, title COLLATE NOCASE, steam_app_id);
--> statement-breakpoint
CREATE INDEX games_catalog_review_count_idx ON games(catalog_status, review_count DESC, title COLLATE NOCASE, steam_app_id);
--> statement-breakpoint
CREATE INDEX authoritative_mimma_scores_game_version_idx ON authoritative_mimma_scores(game_id, version);
--> statement-breakpoint
CREATE INDEX authoritative_mimma_scores_latest_approved_idx ON authoritative_mimma_scores(game_id, approval_status, version DESC);
--> statement-breakpoint

CREATE TRIGGER authoritative_mimma_scores_prevent_update
BEFORE UPDATE ON authoritative_mimma_scores
BEGIN
  SELECT RAISE(ABORT, 'authoritative score history is immutable');
END;
--> statement-breakpoint

CREATE TRIGGER authoritative_mimma_scores_prevent_delete
BEFORE DELETE ON authoritative_mimma_scores
BEGIN
  SELECT RAISE(ABORT, 'authoritative score history cannot be deleted');
END;
--> statement-breakpoint
