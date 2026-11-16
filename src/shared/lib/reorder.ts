/** New order after moving one item up or down by one place; `null` when it cannot move. */
export function moveByOne(ids: readonly string[], id: string, direction: -1 | 1): string[] | null {
  const from = ids.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ids.length) {
    return null;
  }
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}
