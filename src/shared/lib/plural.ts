/** Polish plural: 1 seria, 2–4 serie, 5+ serii (and 12–14 serii, 22 serie). */
export function plural(count: number, one: string, few: string, many: string): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (count === 1) {
    return one;
  }
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) {
    return few;
  }
  return many;
}
