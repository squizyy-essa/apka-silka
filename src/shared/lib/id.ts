import type { Id } from '@/shared/domain';

/** New UUID v4. `crypto.randomUUID` needs a secure context (HTTPS or localhost). */
export function newId(): Id {
  return crypto.randomUUID();
}
