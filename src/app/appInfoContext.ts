import { createContext, useContext } from 'react';

export interface AppInfo {
  readonly appVersion: string;
  readonly schemaVersion: number;
}

export const AppInfoContext = createContext<AppInfo | null>(null);

export function useAppInfo(): AppInfo {
  const value = useContext(AppInfoContext);
  if (value === null) {
    throw new Error('useAppInfo must be used inside <AppInfoContext>.');
  }
  return value;
}
