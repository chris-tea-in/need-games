export const MIMMA_AXES = ['micro', 'meso', 'macro'] as const

export type MimmaAxis = (typeof MIMMA_AXES)[number]

export interface MimmaScore {
  macro: number
  meso: number
  micro: number
}

export type MimmaLabel = 'Absent' | 'Slight' | 'Low' | 'Moderate' | 'High' | 'Defining'

export function assertMimmaValue(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new RangeError('MiMMa values must be finite numbers from 0 through 100')
  }
}

export function mimmaLabelFor(value: number): MimmaLabel {
  assertMimmaValue(value)
  if (value === 0) return 'Absent'
  if (value < 30) return 'Slight'
  if (value < 50) return 'Low'
  if (value < 70) return 'Moderate'
  if (value < 90) return 'High'
  return 'Defining'
}
