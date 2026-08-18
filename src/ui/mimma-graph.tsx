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

const AXIS_NAMES: Readonly<Record<MimmaAxis, string>> = {
  macro: 'Macro',
  meso: 'Meso',
  micro: 'Micro',
}

export function MimmaGraph({ score, size = 'compact' }: MimmaGraphProps) {
  for (const axis of MIMMA_AXES) assertMimmaValue(score[axis])

  return (
    <figure className={`mimma-graph mimma-graph--${size}`} aria-label="MiMMa score">
      {MIMMA_AXES.map((axis) => {
        const value = score[axis]
        const label = mimmaLabelFor(value)
        const style = { '--mimma-value': `${value}%` } as CSSProperties

        return (
          <div className={`mimma-axis mimma-axis--${axis}`} key={axis}>
            <span className="mimma-axis-label">{label}</span>
            <div
              className="mimma-axis-track"
              role="meter"
              aria-label={AXIS_NAMES[axis]}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={value}
              aria-valuetext={label}
            >
              <span className="mimma-axis-bar" style={style} />
            </div>
            <span className="mimma-axis-name">{AXIS_NAMES[axis]}</span>
          </div>
        )
      })}
    </figure>
  )
}
