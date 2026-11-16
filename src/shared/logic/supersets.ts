/**
 * Rules for superset membership inside one training day.
 *
 * A superset is a run of at least two *consecutive* exercises sharing a
 * group id. These functions keep that invariant after exercises are moved,
 * added or removed, so the stored data can never describe a "superset" of
 * one exercise or one that is scattered across the day.
 */

export interface SupersetMember {
  readonly id: string;
  readonly supersetGroupId?: string | undefined;
}

/**
 * @param ordered exercises in their new order
 * @param movedId the exercise the user just moved, if any. Dropped between
 *   two members of the same superset it joins that superset; moved away from
 *   its own superset it leaves it.
 * @returns group id (or `undefined`) for every exercise id
 */
export function normalizeSupersets(
  ordered: readonly SupersetMember[],
  movedId?: string,
): Map<string, string | undefined> {
  const groups = ordered.map((item) => item.supersetGroupId);

  if (movedId !== undefined) {
    const index = ordered.findIndex((item) => item.id === movedId);
    if (index >= 0) {
      const before = groups[index - 1];
      const after = groups[index + 1];
      if (before !== undefined && before === after) {
        groups[index] = before;
      } else if (groups[index] !== before && groups[index] !== after) {
        groups[index] = undefined;
      }
    }
  }

  // Keep, per group, only its longest run of consecutive members (min. 2).
  const runs = new Map<string, { start: number; length: number }>();
  let index = 0;
  while (index < groups.length) {
    const group = groups[index];
    let end = index + 1;
    while (end < groups.length && groups[end] === group) {
      end += 1;
    }
    if (group !== undefined) {
      const best = runs.get(group);
      if (best === undefined || end - index > best.length) {
        runs.set(group, { start: index, length: end - index });
      }
    }
    index = end;
  }

  const result = new Map<string, string | undefined>();
  ordered.forEach((item, position) => {
    const group = groups[position];
    const run = group === undefined ? undefined : runs.get(group);
    const kept =
      run !== undefined &&
      run.length >= 2 &&
      position >= run.start &&
      position < run.start + run.length;
    result.set(item.id, kept ? group : undefined);
  });
  return result;
}

/** Letters shown to the user: first superset of the day is "A", the next "B", … */
export function supersetLabels(ordered: readonly SupersetMember[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const { supersetGroupId } of ordered) {
    if (supersetGroupId !== undefined && !labels.has(supersetGroupId)) {
      labels.set(supersetGroupId, String.fromCharCode(65 + (labels.size % 26)));
    }
  }
  return labels;
}
