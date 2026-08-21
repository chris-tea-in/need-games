CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  steam_id TEXT NOT NULL UNIQUE
    CHECK (length(steam_id) = 17 AND steam_id NOT GLOB '*[^0-9]*'),
  steam_display_name TEXT
    CHECK (
      steam_display_name IS NULL
      OR (
        length(steam_display_name) BETWEEN 1 AND 64
        AND steam_display_name = trim(steam_display_name)
      )
    ),
  profile_lookup_status TEXT NOT NULL
    CHECK (profile_lookup_status IN ('verified', 'unavailable')),
  profile_checked_at INTEGER NOT NULL
    CHECK (typeof(profile_checked_at) = 'integer' AND profile_checked_at >= 0),
  created_at INTEGER NOT NULL
    CHECK (typeof(created_at) = 'integer' AND created_at >= 0),
  CHECK (created_at <= profile_checked_at),
  CHECK (profile_lookup_status <> 'verified' OR steam_display_name IS NOT NULL)
);
--> statement-breakpoint

CREATE TABLE steam_login_transactions (
  token_hash TEXT PRIMARY KEY NOT NULL
    CHECK (length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
  return_path TEXT NOT NULL
    CHECK (substr(return_path, 1, 1) = '/' AND substr(return_path, 1, 2) <> '//'),
  created_at INTEGER NOT NULL
    CHECK (typeof(created_at) = 'integer' AND created_at >= 0),
  expires_at INTEGER NOT NULL
    CHECK (typeof(expires_at) = 'integer' AND expires_at > created_at),
  consumed_at INTEGER
    CHECK (
      consumed_at IS NULL
      OR (typeof(consumed_at) = 'integer' AND consumed_at >= created_at)
    ),
  steam_response_nonce TEXT UNIQUE
    CHECK (
      steam_response_nonce IS NULL
      OR length(steam_response_nonce) BETWEEN 1 AND 512
    )
);
--> statement-breakpoint

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY NOT NULL
    CHECK (length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
    CHECK (typeof(created_at) = 'integer' AND created_at >= 0),
  expires_at INTEGER NOT NULL
    CHECK (typeof(expires_at) = 'integer' AND expires_at > created_at),
  revoked_at INTEGER
    CHECK (
      revoked_at IS NULL
      OR (typeof(revoked_at) = 'integer' AND revoked_at >= created_at)
    )
);
--> statement-breakpoint

CREATE INDEX steam_login_transactions_expiry_idx
ON steam_login_transactions(expires_at);
--> statement-breakpoint

CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
--> statement-breakpoint

CREATE INDEX sessions_user_idx ON sessions(user_id, expires_at);
