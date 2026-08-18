import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'

import { MimmaGraph } from '../../src/ui/mimma-graph.js'

describe('MimmaGraph', () => {
  test('renders fixed axis order, colors hooks, and derived labels', () => {
    const markup = renderToStaticMarkup(<MimmaGraph score={{ macro: 0, meso: 50, micro: 100 }} />)

    expect(markup.indexOf('Micro')).toBeLessThan(markup.indexOf('Meso'))
    expect(markup.indexOf('Meso')).toBeLessThan(markup.indexOf('Macro'))
    expect(markup).toContain('Defining')
    expect(markup).toContain('Moderate')
    expect(markup).toContain('Absent')
    expect(markup).toContain('mimma-axis--micro')
    expect(markup).toContain('mimma-axis--meso')
    expect(markup).toContain('mimma-axis--macro')
  })

  test('preserves the exact value for meter semantics and bar height', () => {
    const markup = renderToStaticMarkup(
      <MimmaGraph score={{ macro: 10, meso: 30, micro: 70 }} size="expanded" />,
    )

    expect(markup).toContain('aria-valuenow="70"')
    expect(markup).toContain('aria-valuetext="High"')
    expect(markup).toContain('--mimma-value:70%')
    expect(markup).toContain('mimma-graph--expanded')
  })

  test('rejects a score outside the supported range', () => {
    expect(() =>
      renderToStaticMarkup(<MimmaGraph score={{ macro: 0, meso: 0, micro: 101 }} />),
    ).toThrow(RangeError)
  })
})
