// Map locations as runs: a flat list [start, length, start, length, …] over hex or edge indexes
// (docs/map-model/data-model.md). Pure. Runs are always written sorted, merged and non-empty.

/** Every index in a list of runs, ascending. */
export function decodeRuns(runs: readonly number[]): number[] {
  const out: number[] = []
  for (let k = 0; k + 1 < runs.length; k += 2) {
    for (let j = 0; j < runs[k + 1]; j++) out.push(runs[k] + j)
  }
  return [...new Set(out)].sort((a, b) => a - b)
}

/** The shortest runs for a set of indexes. */
export function encodeRuns(indexes: Iterable<number>): number[] {
  const sorted = [...new Set(indexes)].sort((a, b) => a - b)
  const out: number[] = []
  for (const i of sorted) {
    const last = out.length - 2
    if (last >= 0 && out[last] + out[last + 1] === i) out[last + 1]++
    else out.push(i, 1)
  }
  return out
}

export function runsContain(runs: readonly number[], i: number): boolean {
  for (let k = 0; k + 1 < runs.length; k += 2) {
    if (i >= runs[k] && i < runs[k] + runs[k + 1]) return true
  }
  return false
}

export function addToRuns(runs: readonly number[], indexes: Iterable<number>): number[] {
  return encodeRuns([...decodeRuns(runs), ...indexes])
}

export function removeFromRuns(runs: readonly number[], indexes: Iterable<number>): number[] {
  const drop = new Set(indexes)
  return encodeRuns(decodeRuns(runs).filter(i => !drop.has(i)))
}

/** How many indexes the runs cover. */
export function runsSize(runs: readonly number[]): number {
  let n = 0
  for (let k = 1; k < runs.length; k += 2) n += runs[k]
  return n
}
