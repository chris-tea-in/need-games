import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V1_SHA256,
  type OwnerAuthoritativeManifestV1,
  hashOwnerAuthoritativeManifest,
  parseDecimalTenths,
  parseOwnerAuthoritativeManifest,
  roundDecimalHalfUp,
} from './generate-owner-authoritative-mimma.mts'

/**
 * The owner-authoritative tables are append-only. This module turns the hash-pinned owner records
 * (v1, then later full snapshots such as v2) into every row the database must hold, each tagged
 * with the record that introduced it. The v2 generator renders its migration from the rows a
 * record adds, and the production verifier checks the database against all of them.
 */

export const OWNER_RECORD_PATHS = {
  v1: 'data/authoritative-records/owner-authoritative-mimma-v1.json',
  v2: 'data/authoritative-records/owner-authoritative-mimma-v2.json',
} as const

export const EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V2_SHA256 =
  '4bd997752f5efd5692f541a3631498512efd9eb95e83a4a21a3bff7cba855560'

const ROUNDING_MODE = 'half-up-to-integer-v1'
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const IDENTITY_KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export type ApprovalReason = 'initial-owner-snapshot' | 'owner-correction' | 'owner-restore'

export interface AuthorityGameRow {
  id: string
  identityKey: string
  canonicalTitle: string
  manifestVersion: string
  sourceHash: string
  createdOn: string
}

export interface AuthorityScoreRow {
  id: string
  gameId: string
  version: number
  micro: number
  meso: number
  macro: number
  microOriginal: string
  mesoOriginal: string
  macroOriginal: string
  approvalReason: ApprovalReason
  approvedOn: string
  manifestVersion: string
  sourceHash: string
}

export interface AuthoritySnapshotRow {
  id: string
  version: number
  manifestVersion: string
  sourceHash: string
  memberCount: number
  createdOn: string
  frozenOn: string
}

export interface AuthorityMemberRow {
  snapshotId: string
  gameId: string
  scoreId: string
}

export interface AuthorityMappingRow {
  id: string
  gameId: string
  provider: string
  externalId: string
  catalogGameId: string
  version: number
  decision: 'verified'
  verificationRef: string
  manifestVersion: string
  sourceHash: string
  decidedOn: string
}

export interface AuthorityRows {
  games: AuthorityGameRow[]
  scores: AuthorityScoreRow[]
  snapshots: AuthoritySnapshotRow[]
  members: AuthorityMemberRow[]
  mappings: AuthorityMappingRow[]
}

/** A later owner record: the full snapshot plus any new Steam mappings. */
export interface OwnerAuthoritativeManifestNext {
  schemaVersion: 1
  manifestVersion: string
  basedOn: string
  method: string
  snapshot: { id: string; version: number; approvedOn: string }
  rounding: { decimalScale: 1; mode: typeof ROUNDING_MODE }
  games: {
    id: string
    identityKey: string
    canonicalTitle: string
    score: Omit<AuthorityScoreRow, 'gameId' | 'manifestVersion' | 'sourceHash'>
  }[]
  mappings: {
    id: string
    authoritativeGameId: string
    provider: 'steam'
    externalId: string
    catalogGameId: string
    version: number
    decision: 'verified'
    verificationRef: string
    decidedOn: string
  }[]
}

function fail(message: string): never {
  throw new Error(`Owner-authoritative record: ${message}`)
}

/** The rows migration 0005 wrote from the v1 record. */
export function rowsFromV1(
  record: OwnerAuthoritativeManifestV1,
  sourceHash: string,
): AuthorityRows {
  const manifestVersion = record.manifestVersion
  const createdOn = record.snapshot.approvedOn
  return {
    games: record.games.map((game) => ({
      id: game.id,
      identityKey: game.identityKey,
      canonicalTitle: game.canonicalTitle,
      manifestVersion,
      sourceHash,
      createdOn,
    })),
    scores: record.games.map((game) => ({
      id: game.score.id,
      gameId: game.id,
      version: game.score.version,
      micro: game.score.micro,
      meso: game.score.meso,
      macro: game.score.macro,
      microOriginal: game.score.microOriginal,
      mesoOriginal: game.score.mesoOriginal,
      macroOriginal: game.score.macroOriginal,
      approvalReason: game.score.approvalReason,
      approvedOn: game.score.approvedOn,
      manifestVersion,
      sourceHash,
    })),
    snapshots: [
      {
        id: record.snapshot.id,
        version: record.snapshot.version,
        manifestVersion,
        sourceHash,
        memberCount: record.games.length,
        createdOn,
        frozenOn: createdOn,
      },
    ],
    members: record.games.map((game) => ({
      snapshotId: record.snapshot.id,
      gameId: game.id,
      scoreId: game.score.id,
    })),
    mappings: record.mappings.map((mapping) => ({
      id: mapping.id,
      gameId: mapping.authoritativeGameId,
      provider: mapping.provider,
      externalId: mapping.externalId,
      catalogGameId: mapping.catalogGameId,
      version: mapping.version,
      decision: mapping.decision,
      verificationRef: mapping.verificationRef,
      manifestVersion,
      sourceHash,
      decidedOn: mapping.decidedOn,
    })),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Shape checks for a later record. The append-only rules are checked in appendOwnerRecord. */
export function parseOwnerRecordNext(source: string): OwnerAuthoritativeManifestNext {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch (error) {
    throw new Error('Owner-authoritative record is not valid JSON', { cause: error })
  }
  if (!isRecord(value)) fail('must be an object')
  const { snapshot, rounding, games, mappings } = value
  if (value.schemaVersion !== 1) fail('schemaVersion must be 1')
  for (const key of ['manifestVersion', 'basedOn', 'method'] as const) {
    if (typeof value[key] !== 'string' || value[key].trim().length === 0) fail(`${key} is missing`)
  }
  if (
    !isRecord(snapshot) ||
    typeof snapshot.id !== 'string' ||
    !Number.isSafeInteger(snapshot.version) ||
    typeof snapshot.approvedOn !== 'string' ||
    !DATE_PATTERN.test(snapshot.approvedOn)
  ) {
    fail('snapshot needs an id, an integer version, and an approvedOn date')
  }
  if (!isRecord(rounding) || rounding.decimalScale !== 1 || rounding.mode !== ROUNDING_MODE) {
    fail(`rounding must be decimalScale 1 and ${ROUNDING_MODE}`)
  }
  if (!Array.isArray(games) || games.length === 0) fail('games must be a non-empty array')
  if (!Array.isArray(mappings)) fail('mappings must be an array')
  for (const [index, game] of (games as unknown[]).entries()) {
    if (
      !isRecord(game) ||
      typeof game.id !== 'string' ||
      typeof game.identityKey !== 'string' ||
      typeof game.canonicalTitle !== 'string' ||
      !isRecord(game.score)
    ) {
      fail(`game ${index} needs id, identityKey, canonicalTitle, and score`)
    }
    const score = game.score
    for (const key of [
      'id',
      'microOriginal',
      'mesoOriginal',
      'macroOriginal',
      'approvalReason',
      'approvedOn',
    ]) {
      if (typeof score[key] !== 'string') fail(`${game.id}.score.${key} must be a string`)
    }
    for (const key of ['version', 'micro', 'meso', 'macro']) {
      if (!Number.isSafeInteger(score[key])) fail(`${game.id}.score.${key} must be an integer`)
    }
  }
  for (const [index, mapping] of (mappings as unknown[]).entries()) {
    if (!isRecord(mapping)) fail(`mapping ${index} must be an object`)
    for (const key of [
      'id',
      'authoritativeGameId',
      'externalId',
      'catalogGameId',
      'verificationRef',
      'decidedOn',
    ]) {
      if (typeof mapping[key] !== 'string') fail(`mapping ${index}.${key} must be a string`)
    }
    if (mapping.provider !== 'steam') fail(`mapping ${index}.provider must be steam`)
    if (mapping.decision !== 'verified') fail(`mapping ${index}.decision must be verified`)
    if (!Number.isSafeInteger(mapping.version)) fail(`mapping ${index}.version must be an integer`)
  }
  return value as unknown as OwnerAuthoritativeManifestNext
}

function sameScore(
  left: AuthorityScoreRow,
  right: OwnerAuthoritativeManifestNext['games'][number]['score'],
): boolean {
  return (
    left.id === right.id &&
    left.version === right.version &&
    left.micro === right.micro &&
    left.meso === right.meso &&
    left.macro === right.macro &&
    left.microOriginal === right.microOriginal &&
    left.mesoOriginal === right.mesoOriginal &&
    left.macroOriginal === right.macroOriginal &&
    left.approvalReason === right.approvalReason &&
    left.approvedOn === right.approvedOn
  )
}

/** The rows a later record adds. Throws when the record would rewrite or skip history. */
export function appendOwnerRecord(
  history: AuthorityRows,
  record: OwnerAuthoritativeManifestNext,
  sourceHash: string,
): AuthorityRows {
  const { manifestVersion, snapshot } = record
  const latest = history.snapshots.reduce((max, row) => (row.version > max.version ? row : max))
  if (record.basedOn !== latest.manifestVersion) {
    fail(`${manifestVersion} must be based on ${latest.manifestVersion}`)
  }
  if (snapshot.version !== latest.version + 1)
    fail(`snapshot version must be ${latest.version + 1}`)
  if (history.snapshots.some((row) => row.id === snapshot.id))
    fail(`snapshot ${snapshot.id} exists`)

  const added: AuthorityRows = { games: [], scores: [], snapshots: [], members: [], mappings: [] }
  const seenGames = new Set<string>()
  for (const game of record.games) {
    if (seenGames.has(game.id)) fail(`duplicate game ${game.id}`)
    seenGames.add(game.id)
    const known = history.games.find((row) => row.id === game.id)
    if (known === undefined) {
      if (
        !IDENTITY_KEY_PATTERN.test(game.identityKey) ||
        game.id !== `auth-game-${game.identityKey}`
      ) {
        fail(`new game ${game.id} must be auth-game-<identityKey> with a lowercase identity key`)
      }
      if (game.identityKey.startsWith('steam-'))
        fail(`${game.id} must not be named after a Steam ID`)
      const clash = history.games.find(
        (row) =>
          row.identityKey === game.identityKey ||
          row.canonicalTitle.toLowerCase() === game.canonicalTitle.toLowerCase(),
      )
      if (clash !== undefined) fail(`${game.id} reuses the identity or title of ${clash.id}`)
      added.games.push({
        id: game.id,
        identityKey: game.identityKey,
        canonicalTitle: game.canonicalTitle,
        manifestVersion,
        sourceHash,
        createdOn: snapshot.approvedOn,
      })
    } else if (
      known.identityKey !== game.identityKey ||
      known.canonicalTitle !== game.canonicalTitle
    ) {
      fail(`${game.id} must keep its identity key and title`)
    }

    const prior = history.scores
      .filter((row) => row.gameId === game.id)
      .reduce<AuthorityScoreRow | undefined>(
        (max, row) => (max === undefined || row.version > max.version ? row : max),
        undefined,
      )
    const { score } = game
    if (prior !== undefined && score.id === prior.id) {
      if (!sameScore(prior, score)) fail(`${game.id} reuses ${prior.id} but changes it`)
    } else {
      const version = (prior?.version ?? 0) + 1
      if (score.version !== version || score.id !== `auth-score-${game.identityKey}-v${version}`) {
        fail(`${game.id} needs score auth-score-${game.identityKey}-v${version}`)
      }
      const reason = prior === undefined ? 'initial-owner-snapshot' : 'owner-correction'
      if (score.approvalReason !== reason) fail(`${score.id} approvalReason must be ${reason}`)
      if (score.approvedOn !== snapshot.approvedOn)
        fail(`${score.id} must be approved on the snapshot date`)
      for (const axis of ['micro', 'meso', 'macro'] as const) {
        const original = score[`${axis}Original`]
        parseDecimalTenths(original)
        if (score[axis] !== roundDecimalHalfUp(original))
          fail(`${score.id}.${axis} rounding mismatch`)
      }
      if (score.micro === 0 && score.meso === 0 && score.macro === 0)
        fail(`${score.id} is all zero`)
      if (score.micro === 100 && score.meso === 100 && score.macro === 100) {
        fail(`${score.id} is all 100`)
      }
      added.scores.push({ ...score, gameId: game.id, manifestVersion, sourceHash })
    }
    added.members.push({ snapshotId: snapshot.id, gameId: game.id, scoreId: score.id })
  }
  for (const member of history.members.filter((row) => row.snapshotId === latest.id)) {
    if (!seenGames.has(member.gameId)) fail(`${member.gameId} is missing from ${manifestVersion}`)
  }

  for (const mapping of record.mappings) {
    if (!seenGames.has(mapping.authoritativeGameId)) {
      fail(`${mapping.id} maps a game outside ${manifestVersion}`)
    }
    if (history.mappings.some((row) => row.gameId === mapping.authoritativeGameId)) {
      fail(`${mapping.id}: changing an existing mapping needs supersession, which is not supported`)
    }
    const identityKey = record.games.find(
      (game) => game.id === mapping.authoritativeGameId,
    )?.identityKey
    if (mapping.version !== 1 || mapping.id !== `auth-map-steam-${identityKey}-v1`) {
      fail(`${mapping.id} must be auth-map-steam-${identityKey}-v1 at version 1`)
    }
    if (mapping.decidedOn !== snapshot.approvedOn)
      fail(`${mapping.id} must be decided on the snapshot date`)
    added.mappings.push({
      id: mapping.id,
      gameId: mapping.authoritativeGameId,
      provider: mapping.provider,
      externalId: mapping.externalId,
      catalogGameId: mapping.catalogGameId,
      version: mapping.version,
      decision: mapping.decision,
      verificationRef: mapping.verificationRef,
      manifestVersion,
      sourceHash,
      decidedOn: mapping.decidedOn,
    })
  }

  added.snapshots.push({
    id: snapshot.id,
    version: snapshot.version,
    manifestVersion,
    sourceHash,
    memberCount: record.games.length,
    createdOn: snapshot.approvedOn,
    frozenOn: snapshot.approvedOn,
  })
  return added
}

export function mergeRows(left: AuthorityRows, right: AuthorityRows): AuthorityRows {
  return {
    games: [...left.games, ...right.games],
    scores: [...left.scores, ...right.scores],
    snapshots: [...left.snapshots, ...right.snapshots],
    members: [...left.members, ...right.members],
    mappings: [...left.mappings, ...right.mappings],
  }
}

export interface OwnerAuthorityHistory {
  v1: OwnerAuthoritativeManifestV1
  v2: OwnerAuthoritativeManifestNext
  v2Rows: AuthorityRows
  rows: AuthorityRows
}

/** Read both hash-pinned records and build the full history. */
export function readOwnerAuthorityHistory(repositoryRoot: string): OwnerAuthorityHistory {
  const v1Source = readFileSync(resolve(repositoryRoot, OWNER_RECORD_PATHS.v1), 'utf8')
  const v2Source = readFileSync(resolve(repositoryRoot, OWNER_RECORD_PATHS.v2), 'utf8')
  if (hashOwnerAuthoritativeManifest(v1Source) !== EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V1_SHA256) {
    fail('v1 does not match its pinned hash')
  }
  const v2Hash = hashOwnerAuthoritativeManifest(v2Source)
  if (v2Hash !== EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V2_SHA256) {
    fail(`v2 hash is ${v2Hash}; expected ${EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V2_SHA256}`)
  }
  const v1 = parseOwnerAuthoritativeManifest(v1Source)
  const v2 = parseOwnerRecordNext(v2Source)
  const v1Rows = rowsFromV1(v1, EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V1_SHA256)
  const v2Rows = appendOwnerRecord(v1Rows, v2, v2Hash)
  return { v1, v2, v2Rows, rows: mergeRows(v1Rows, v2Rows) }
}

/** The latest frozen snapshot's score for each game, the way the Worker reads it. */
export function latestSnapshotScores(rows: AuthorityRows): Map<string, AuthorityScoreRow> {
  const latest = rows.snapshots.reduce((max, row) => (row.version > max.version ? row : max))
  const scores = new Map<string, AuthorityScoreRow>()
  for (const member of rows.members.filter((row) => row.snapshotId === latest.id)) {
    const score = rows.scores.find((row) => row.id === member.scoreId)
    if (score === undefined) fail(`member ${member.gameId} references missing ${member.scoreId}`)
    scores.set(member.gameId, score)
  }
  return scores
}
