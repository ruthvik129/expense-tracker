import seedFile from './seedKeywords.json'

export interface CategoryPredictor {
  predict(description: string): Promise<{ category: string; confidence: number }[]>
}

/** Below this the UI asks (top 3 chips, none selected) instead of auto-filling. */
export const CONFIDENCE_THRESHOLD = 0.6

export const nullPredictor: CategoryPredictor = { predict: async () => [] }

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'for', 'at', 'in', 'on', 'with', 'from', 'by', 'via',
  'my', 'me', 'paid', 'pay', 'order', 'again', 'bill', 'split', 'weekend',
])

export function tokenize(description: string): string[] {
  return description
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

const seeds: Record<string, string> = Object.fromEntries(
  Object.entries(seedFile).filter(([k]) => !k.startsWith('_')),
)

const SEED_WEIGHT = 3 // a seed word counts like three past entries
const ALPHA = 1 // Laplace smoothing
const EXACT_WEIGHT = 0.6 // how much an exact past description outweighs word statistics
const NO_EVIDENCE_CAP = 0.3 // never auto-fill from base rates alone

type Counts = Map<string, number>
const bump = (m: Counts, k: string, by: number) => {
  const v = (m.get(k) ?? 0) + by
  if (v <= 0) m.delete(k)
  else m.set(k, v)
}

/**
 * Naive Bayes over description words, learned from the sheet's history (the sheet is the
 * memory, nothing extra is stored), plus a boost when the exact description was seen before.
 */
export class RulesPredictor implements CategoryPredictor {
  private docs: Counts = new Map()
  private words = new Map<string, Counts>()
  private wordTotals: Counts = new Map()
  private exact = new Map<string, Counts>()
  private total = 0
  private categories: string[]
  private seedMap: Record<string, string>

  constructor(
    history: { description: string; category: string }[],
    categories: string[],
    seedMap: Record<string, string> = seeds,
  ) {
    this.categories = categories
    this.seedMap = Object.fromEntries(Object.entries(seedMap).filter(([, c]) => categories.includes(c)))
    for (const h of history) this.learn(h, 1)
  }

  /** Add (+1) or remove (-1) one example. Removing lets evaluation hold each row out cheaply. */
  learn(h: { description: string; category: string }, sign: 1 | -1) {
    if (!this.categories.includes(h.category)) return
    const toks = tokenize(h.description)
    this.total += sign
    bump(this.docs, h.category, sign)
    for (const t of toks) {
      if (!this.words.has(t)) this.words.set(t, new Map())
      bump(this.words.get(t)!, h.category, sign)
      bump(this.wordTotals, h.category, sign)
    }
    const key = toks.join(' ')
    if (key) {
      if (!this.exact.has(key)) this.exact.set(key, new Map())
      bump(this.exact.get(key)!, h.category, sign)
    }
  }

  predictSync(description: string): { category: string; confidence: number }[] {
    const K = this.categories.length
    if (!K) return []
    const toks = tokenize(description)
    const vocab = this.words.size + Object.keys(this.seedMap).length || 1

    // Words we know something about (from history or seeds); unknown words carry no signal.
    const evidence = toks.filter((t) => (this.words.get(t)?.size ?? 0) > 0 || t in this.seedMap)
    const logScores = this.categories.map((c) => {
      let s = Math.log(((this.docs.get(c) ?? 0) + 1) / (this.total + K))
      // Seeds add to the numerator only: they are a hint, not part of the category's word mass.
      const totalWords = this.wordTotals.get(c) ?? 0
      for (const t of evidence) {
        const seen = this.words.get(t)?.get(c) ?? 0
        const learned = this.words.get(t)?.size ?? 0
        const seed = learned === 0 && this.seedMap[t] === c ? SEED_WEIGHT : 0
        s += Math.log((seen + seed + ALPHA) / (totalWords + ALPHA * vocab))
      }
      return s
    })
    const max = Math.max(...logScores)
    const exp = logScores.map((s) => Math.exp(s - max))
    const sum = exp.reduce((a, b) => a + b, 0)
    let probs = exp.map((e) => e / sum)

    const seenExact = this.exact.get(toks.join(' '))
    if (seenExact && seenExact.size) {
      const n = [...seenExact.values()].reduce((a, b) => a + b, 0)
      probs = probs.map((p, i) => (1 - EXACT_WEIGHT) * p + (EXACT_WEIGHT * (seenExact.get(this.categories[i]) ?? 0)) / n)
    }
    if (!evidence.length) probs = probs.map((p) => Math.min(p, NO_EVIDENCE_CAP))

    return this.categories
      .map((category, i) => ({ category, confidence: Math.round(probs[i] * 1000) / 1000 }))
      .sort((a, b) => b.confidence - a.confidence)
  }

  async predict(description: string) {
    return this.predictSync(description)
  }
}

export interface Accuracy {
  total: number
  correct: number
  /** Share of rows where the top guess was right. */
  top1: number
  /** Rows confident enough to auto-fill, and how often those were right. */
  autoFilled: number
  autoFilledCorrect: number
}

/** Leave-one-out: predict each row from all the others, the way the app would see it. */
export function evaluate(rows: { description: string; category: string }[], categories: string[], seedMap?: Record<string, string>): Accuracy {
  const model = new RulesPredictor(rows, categories, seedMap)
  const acc: Accuracy = { total: 0, correct: 0, top1: 0, autoFilled: 0, autoFilledCorrect: 0 }
  for (const r of rows) {
    if (!categories.includes(r.category)) continue
    model.learn(r, -1)
    const [top] = model.predictSync(r.description)
    model.learn(r, 1)
    acc.total++
    if (top?.category === r.category) acc.correct++
    if (top && top.confidence >= CONFIDENCE_THRESHOLD) {
      acc.autoFilled++
      if (top.category === r.category) acc.autoFilledCorrect++
    }
  }
  acc.top1 = acc.total ? acc.correct / acc.total : 0
  return acc
}

/**
 * Future: a fine-tuned Laya classifier on a free Hugging Face Space. Off by default.
 * Kept as a stub so the interface is ready; it returns nothing until wired up.
 */
export const LAYA_CONFIG = { enabled: false, url: '' }
export const layaRemotePredictor: CategoryPredictor = { predict: async () => [] }
