import { describe, it, expect } from 'vitest'
import { planKeepTogetherSpacers } from '../KeepTogether.js'

describe('planKeepTogetherSpacers (#249)', () => {
  const breakers = [
    { top: 1000, bottom: 1100 },
    { top: 2000, bottom: 2100 },
  ]

  it('pushes a straddling quote to the next page', () => {
    const spacers = planKeepTogetherSpacers([{ pos: 10, top: 900, height: 300 }], breakers, 1000)
    expect(spacers).toEqual([{ pos: 10, height: 200 }])
  })

  it('leaves a block that fits the remaining space alone', () => {
    const spacers = planKeepTogetherSpacers([{ pos: 10, top: 500, height: 300 }], breakers, 1000)
    expect(spacers).toEqual([])
  })

  it('lets a block taller than a page split (no spacer)', () => {
    const spacers = planKeepTogetherSpacers([{ pos: 10, top: 900, height: 1200 }], breakers, 1000)
    expect(spacers).toEqual([])
  })

  it('does not double-count spacers for later blocks', () => {
    const spacers = planKeepTogetherSpacers(
      [
        { pos: 10, top: 900, height: 300 },
        { pos: 20, top: 1900, height: 200 },
      ],
      breakers,
      1000,
    )
    // The first spacer already pushes the second block to the page-2 start.
    expect(spacers).toEqual([{ pos: 10, height: 200 }])
  })

  it('ignores empty inputs and blocks with no straddle', () => {
    expect(planKeepTogetherSpacers([], breakers, 1000)).toEqual([])
    expect(planKeepTogetherSpacers([{ pos: 10, top: 500, height: 100 }], [], 1000)).toEqual([])
    expect(planKeepTogetherSpacers([{ pos: 10, top: 500, height: 100 }], breakers, 0)).toEqual([])
  })
})
