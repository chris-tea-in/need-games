// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { CatalogResponse } from '../../src/shared/catalog-contract.js'
import { loadCatalog, loadGameDetail } from '../../src/ui/api-client.js'
import { App } from '../../src/ui/App.js'

vi.mock('../../src/ui/api-client.js', () => ({
  loadCatalog: vi.fn(),
  loadGameDetail: vi.fn(),
}))

const catalog: CatalogResponse = {
  datasetVersion: 'catalog-release-v1',
  schemaVersion: 1,
  games: [
    {
      id: 'steam-730',
      slug: 'counter-strike-2',
      steamAppId: 730,
      title: 'Counter-Strike 2',
      tags: ['FPS'],
      review: {
        category: 'Very Positive',
        count: 2_594_111,
        scope: 'All Reviews: English Reviews',
      },
    },
    {
      id: 'steam-284160',
      slug: 'beamng-drive',
      steamAppId: 284160,
      title: 'BeamNG.drive',
      tags: ['Driving'],
      review: {
        category: 'Overwhelmingly Positive',
        count: 207_775,
        scope: 'All Reviews: English Reviews',
      },
    },
  ],
}

function setControlValue(
  control: { dispatchEvent(event: Event): boolean; value: string },
  prototype: object,
  value: string,
): void {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- React needs the native setter.
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  if (setter === undefined) {
    throw new Error('The browser control does not expose a value setter.')
  }

  setter.call(control, value)
}

describe('App browser interactions', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    window.history.replaceState({}, '', '/')
    vi.mocked(loadCatalog).mockResolvedValue({ data: catalog, kind: 'data', source: 'api' })
    vi.mocked(loadGameDetail).mockResolvedValue({ kind: 'not-found' })
    container = document.createElement('div')
    document.body.append(container as never)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  test('filters cards and changes their order through browser controls', async () => {
    await act(() => {
      root.render(<App />)
      return Promise.resolve()
    })

    const search = container.querySelector('input[type="search"]') as unknown as {
      dispatchEvent(event: Event): boolean
      value: string
    } | null
    const sort = container.querySelector('select') as unknown as {
      dispatchEvent(event: Event): boolean
      value: string
    } | null
    expect(search).not.toBeNull()
    expect(sort).not.toBeNull()

    await act(() => {
      setControlValue(search!, window.HTMLInputElement.prototype, 'fps')
      search!.dispatchEvent(new window.Event('input', { bubbles: true }))
      return Promise.resolve()
    })
    expect(container.textContent).toContain('Counter-Strike 2')
    expect(container.textContent).not.toContain('BeamNG.drive')

    await act(() => {
      setControlValue(search!, window.HTMLInputElement.prototype, '')
      search!.dispatchEvent(new window.Event('input', { bubbles: true }))
      setControlValue(sort!, window.HTMLSelectElement.prototype, 'reviews')
      sort!.dispatchEvent(new window.Event('change', { bubbles: true }))
      return Promise.resolve()
    })
    const textContent = container.textContent ?? ''
    expect(textContent.indexOf('Counter-Strike 2')).toBeLessThan(
      textContent.indexOf('BeamNG.drive'),
    )
    expect(container.querySelector('a[href="/games/counter-strike-2"]')).not.toBeNull()
  })

  test('handles a malformed encoded game path as a catalog path', async () => {
    window.history.replaceState({}, '', '/games/%E0%A4%A')

    await act(() => {
      root.render(<App />)
      return Promise.resolve()
    })

    expect(container.textContent).toContain('Find your next game')
  })
})
