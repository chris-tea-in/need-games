import { describe, expect, test } from 'vitest'

import { MIMMA_AXES, assertMimmaValue, mimmaLabelFor } from '../src/shared/mimma.js'

describe('MiMMa shared model', () => {
  test('keeps the permanent axis order', () => {
    expect(MIMMA_AXES).toEqual(['micro', 'meso', 'macro'])
  })

  test.each([
    [0, 'Absent'],
    [0.5, 'Slight'],
    [20, 'Slight'],
    [29, 'Slight'],
    [30, 'Low'],
    [49, 'Low'],
    [50, 'Moderate'],
    [69, 'Moderate'],
    [70, 'High'],
    [89, 'High'],
    [90, 'Defining'],
    [100, 'Defining'],
  ] as const)('derives %s as %s', (value, expected) => {
    expect(mimmaLabelFor(value)).toBe(expected)
  })

  test.each([-1, 101, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid value %s',
    (value) => {
      expect(() => assertMimmaValue(value)).toThrow(RangeError)
      expect(() => mimmaLabelFor(value)).toThrow(RangeError)
    },
  )
})
