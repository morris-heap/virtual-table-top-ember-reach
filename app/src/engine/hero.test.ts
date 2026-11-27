import { describe, expect, it } from 'vitest'
import core from '../../../data/core.json'
import { ANCESTRIES, CALLINGS, emptyHero, heroProblems, newHeroSheet } from './hero.ts'

describe('new hero', () => {
  it('lists the ancestries and callings from the rules', () => {
    expect(ANCESTRIES).toEqual(['Human', 'Stoneborn', 'Wildkin', 'Emberkin', 'Hollowborn'])
    expect(CALLINGS).toEqual(['Warden', 'Blade', 'Hexer', 'Mender', 'Pathfinder', 'Silvertongue', 'Kilnheart'])
  })

  it('asks for a name, an Ancestry and a Calling', () => {
    expect(heroProblems(emptyHero())).toEqual(['Give your hero a name.', 'Pick an Ancestry.', 'Pick a Calling.'])
    expect(heroProblems({ name: '   ', ancestry: 'Human', calling: 'Blade' })).toEqual(['Give your hero a name.'])
  })

  it('rejects names that are too long and unknown choices', () => {
    expect(heroProblems({ name: 'x'.repeat(81), ancestry: 'Elf', calling: 'Blade' }))
      .toEqual(['Keep the name to 80 characters.', 'Pick an Ancestry.'])
  })

  it('accepts a complete hero', () => {
    expect(heroProblems({ name: 'Ash', ancestry: 'Emberkin', calling: 'Mender' })).toEqual([])
  })

  it('builds a level 1 sheet with the name trimmed', () => {
    expect(newHeroSheet({ name: '  Ash  ', ancestry: 'Emberkin', calling: 'Mender' }))
      .toEqual({ rulesVersion: core.version, name: 'Ash', level: 1, ancestry: 'Emberkin', calling: 'Mender' })
  })
})
