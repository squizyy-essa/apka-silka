import { createContext, useContext } from 'react';
import type { Repositories } from '@/db';

export const RepositoriesContext = createContext<Repositories | null>(null);

/** Access to persistence for screens. Screens never import the database directly. */
export function useRepositories(): Repositories {
  const value = useContext(RepositoriesContext);
  if (value === null) {
    throw new Error('useRepositories must be used inside <RepositoriesContext>.');
  }
  return value;
}
