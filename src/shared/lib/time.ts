import type { ISODateTime } from '@/shared/domain';

/** Current instant as an ISO-8601 UTC string. */
export function nowIso(now: Date = new Date()): ISODateTime {
  return now.toISOString();
}
