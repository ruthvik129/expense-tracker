import { describe, expect, it } from 'vitest'
import { CONFIDENCE_THRESHOLD, evaluate, RulesPredictor, tokenize } from './predictor'
import fixture from '../test/fixtures/history.csv?raw'

const CATS = ['Life Infrastructure', 'Future Me', 'Performance & Growth', 'Relationships & Generosity', 'Lifestyle Enjoyment']

/** Minimal CSV reader for the fixture (quoted fields, no embedded newlines). */
function loadFixture() {
  const rows = fixture.trim().split('\n').slice(1).map((line: string) => {
    const cells: string[] = []
    let cur = ''
    let q = false
    for (const ch of line) {
      if (ch === '"') q = !q
      else if (ch === ',' && !q) { cells.push(cur); cur = '' }
      else cur += ch
    }
    cells.push(cur)
    return cells
  })
  return rows.map(([, description, category]) => ({ description, category }))
}

describe('predictor', () => {
  it('tokenises: lowercase, no digits or stopwords', () => {
    expect(tokenize('Uber to office 450 again!')).toEqual(['uber', 'office'])
  })

  it('learns from history and auto-fills when sure', () => {
    const p = new RulesPredictor(
      [
        { description: 'Swiggy', category: 'Lifestyle Enjoyment' },
        { description: 'Swiggy order', category: 'Lifestyle Enjoyment' },
        { description: 'Swiggy', category: 'Lifestyle Enjoyment' },
        { description: 'Rent', category: 'Life Infrastructure' },
      ],
      CATS,
    )
    const [top] = p.predictSync('swiggy dinner')
    expect(top.category).toBe('Lifestyle Enjoyment')
    expect(top.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD)
  })

  it('asks instead of guessing for words it has never seen', () => {
    const p = new RulesPredictor([{ description: 'Rent', category: 'Life Infrastructure' }], CATS)
    expect(p.predictSync('zxqv thing')[0].confidence).toBeLessThan(CONFIDENCE_THRESHOLD)
  })

  it('uses seed keywords on a cold start, and history overrides them', () => {
    const cold = new RulesPredictor([], CATS, { gym: 'Performance & Growth' })
    expect(cold.predictSync('gym')[0].category).toBe('Performance & Growth')
    const learned = new RulesPredictor(
      [{ description: 'gym', category: 'Lifestyle Enjoyment' }, { description: 'gym', category: 'Lifestyle Enjoyment' }],
      CATS,
      { gym: 'Performance & Growth' },
    )
    expect(learned.predictSync('gym')[0].category).toBe('Lifestyle Enjoyment')
  })

  it('splits an ambiguous merchant by the rest of the description', () => {
    const p = new RulesPredictor(
      [
        { description: 'Uber to office', category: 'Life Infrastructure' },
        { description: 'Uber to office', category: 'Life Infrastructure' },
        { description: 'Uber late night', category: 'Lifestyle Enjoyment' },
        { description: 'late night drinks', category: 'Lifestyle Enjoyment' },
      ],
      CATS,
    )
    expect(p.predictSync('uber office')[0].category).toBe('Life Infrastructure')
    expect(p.predictSync('uber late night')[0].category).toBe('Lifestyle Enjoyment')
  })

  it('ignores categories that are not in the Setup list', () => {
    const p = new RulesPredictor([{ description: 'Old thing', category: 'Removed Category' }], CATS)
    expect(p.predictSync('old thing').map((x) => x.category)).not.toContain('Removed Category')
  })

  it('reports top-1 accuracy on the 150-row fixture', () => {
    const rows = loadFixture()
    expect(rows.length).toBeGreaterThanOrEqual(100)
    const acc = evaluate(rows, CATS)
    const pct = (n: number) => `${(n * 100).toFixed(1)}%`
    console.log(
      `[predictor] leave-one-out on ${acc.total} rows: top-1 ${pct(acc.top1)} (${acc.correct}/${acc.total}); ` +
        `auto-filled ${acc.autoFilled} rows, ${pct(acc.autoFilledCorrect / (acc.autoFilled || 1))} of those right`,
    )
    expect(acc.top1).toBeGreaterThan(0.7)
  })
})
