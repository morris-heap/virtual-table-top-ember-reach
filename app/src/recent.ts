// The few most recently changed items, newest first: what Home shows before "See all".

export function recentFirst<T extends { updatedAt: string }>(items: readonly T[], count: number): T[] {
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, count)
}
