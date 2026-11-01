import type { CSSProperties } from 'react'

import {
  MIMMA_AXES,
  type MimmaAxis,
  type MimmaScore,
  assertMimmaValue,
  mimmaLabelFor,
} from '../shared/mimma.js'

export type MimmaGraphSize = 'compact' | 'expanded'

export interface MimmaGraphProps {
  score: MimmaScore
  size?: MimmaGraphSize
}

export const AXIS_NAMES: Readonly<Record<MimmaAxis, string>> = {
  macro: 'Macro',
  meso: 'Meso',
  micro: 'Micro',
}

export const AXIS_DESCRIPTIONS: Readonly<Record<MimmaAxis, string>> = {
  macro: 'Strategy, systems, optimization',
  meso: 'Uncertainty, hidden information, mind games',
  micro: 'Execution, reflexes, timing, precision',
}

function valueStyle(value: number): CSSProperties {
  return { '--mimma-value': `${value}%` } as CSSProperties
}

/** The full gameplay profile, laid out like the spec panel on a box back. */
export function MimmaGraph({ score, size = 'compact' }: MimmaGraphProps) {
  for (const axis of MIMMA_AXES) assertMimmaValue(score[axis])

  return (
    <figure className={`mimma-graph mimma-graph--${size}`} aria-label="MiMMa score">
      {MIMMA_AXES.map((axis) => {
        const value = score[axis]
        const label = mimmaLabelFor(value)

        return (
          <div className={`mimma-axis mimma-axis--${axis}`} key={axis}>
            <div className="mimma-axis-heading">
              <span className="mimma-axis-name">{AXIS_NAMES[axis]}</span>
              <span className="mimma-axis-description">{AXIS_DESCRIPTIONS[axis]}</span>
            </div>
            <div
              className="mimma-axis-track"
              role="meter"
              aria-label={AXIS_NAMES[axis]}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={value}
              aria-valuetext={label}
            >
              <span className="mimma-axis-bar" style={valueStyle(value)} />
            </div>
            <span className="mimma-axis-value">{value}</span>
            <span className="mimma-axis-label">{label}</span>
          </div>
        )
      })}
    </figure>
  )
}

interface ProfileStripProps {
  score: MimmaScore
  /** The profile of the game being viewed, drawn as a marker on each axis. */
  reference?: MimmaScore
}

export function profileSummary(score: MimmaScore): string {
  return `Micro ${score.micro}, Meso ${score.meso}, Macro ${score.macro}`
}

/** A compact three-ink strip for boxes on a shelf. Decorative; callers supply the text. */
export function ProfileStrip({ reference, score }: ProfileStripProps) {
  for (const axis of MIMMA_AXES) assertMimmaValue(score[axis])

  return (
    <span aria-hidden="true" className="profile-strip">
      {MIMMA_AXES.map((axis) => (
        <span className={`profile-strip-axis profile-strip-axis--${axis}`} key={axis}>
          <span className="profile-strip-bar" style={valueStyle(score[axis])} />
          {reference === undefined ? null : (
            <span className="profile-strip-marker" style={valueStyle(reference[axis])} />
          )}
        </span>
      ))}
    </span>
  )
}
