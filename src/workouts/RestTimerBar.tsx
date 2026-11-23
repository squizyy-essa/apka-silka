import { Pause, Play, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRepositories } from '@/app/repositoriesContext';
import { useSettings } from '@/settings/settingsContext';
import type { RestTimerState } from '@/shared/domain';
import { useObserved } from '@/shared/lib/useObserved';
import {
  adjustRestTimer,
  formatClock,
  pauseRestTimer,
  remainingRestMs,
  resumeRestTimer,
} from '@/shared/logic/workout';
import { Button } from '@/shared/ui/Button';
import { IconButton } from '@/shared/ui/IconButton';
import { playRestEndSound } from './sound';

const TICK_MS = 250;

/**
 * Rest countdown, docked above the bottom navigation. The remaining time is
 * always derived from the stored end timestamp and the current clock, so it
 * is correct after the phone was locked or the app was in the background –
 * the interval below only repaints the display.
 */
export function RestTimerBar({ sessionId }: { readonly sessionId: string }) {
  const { sessions } = useRepositories();
  const { settings } = useSettings();
  const subscribe = useCallback(
    (
      listener: (timer: RestTimerState | null) => void,
      onError: Parameters<typeof sessions.observeRestTimer>[2],
    ) => sessions.observeRestTimer(sessionId, listener, onError),
    [sessions, sessionId],
  );
  const observed = useObserved(subscribe);
  const timer = observed.status === 'ready' ? observed.value : null;

  const [now, setNow] = useState(() => new Date());
  const [soundBlocked, setSoundBlocked] = useState(false);
  const announcedFor = useRef<string | null>(null);

  useEffect(() => {
    if (timer?.status !== 'running') {
      return;
    }
    const tick = () => {
      const current = new Date();
      setNow(current);
      if (remainingRestMs(timer, current) > 0 || announcedFor.current === timer.endsAt) {
        return;
      }
      announcedFor.current = timer.endsAt;
      // Signal only a rest that ended just now – not one that ran out long
      // ago while the app was closed.
      const endedRecently = current.getTime() - new Date(timer.endsAt).getTime() < 5000;
      if (settings.timerSoundEnabled && endedRecently) {
        setSoundBlocked(!playRestEndSound(settings.timerVolume));
      }
      void sessions.saveRestTimer({ ...timer, status: 'finished' }).catch(() => undefined);
    };
    const first = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, TICK_MS);
    // Timers are throttled in the background: catch up the moment we are visible again.
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [timer, sessions, settings.timerSoundEnabled, settings.timerVolume]);

  const remaining = timer === null ? 0 : remainingRestMs(timer, now);
  const ended = timer !== null && timer.status === 'running' && remaining === 0;

  if (timer === null) {
    return null;
  }

  const save = (next: RestTimerState) => {
    void sessions.saveRestTimer(next).catch(() => undefined);
  };
  const dismiss = () => {
    void sessions.clearRestTimer(sessionId).catch(() => undefined);
  };
  const finished = timer.status === 'finished' || ended;

  return (
    <div
      role="timer"
      aria-label="Odpoczynek"
      className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-surface shadow-raised lg:bottom-0 lg:left-60"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 py-2">
        <div className="min-w-18">
          <p className="text-xs font-medium text-muted-foreground">
            {finished ? 'Koniec odpoczynku' : timer.status === 'paused' ? 'Odpoczynek (pauza)' : 'Odpoczynek'}
          </p>
          <p className="text-2xl leading-tight font-bold text-foreground tabular-nums" aria-live="off">
            {formatClock(remaining)}
          </p>
        </div>
        {finished ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            {soundBlocked && (
              <p className="min-w-0 flex-1 basis-40 text-xs text-muted-foreground">
                Przeglądarka zablokowała dźwięk. Dotknij ekranu po uruchomieniu aplikacji, aby go
                odblokować.
              </p>
            )}
            <Button onClick={dismiss}>OK</Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Button variant="secondary" className="px-3" onClick={() => save(adjustRestTimer(timer, -15, new Date()))}>
              −15 s
            </Button>
            <Button variant="secondary" className="px-3" onClick={() => save(adjustRestTimer(timer, 15, new Date()))}>
              +15 s
            </Button>
            {timer.status === 'paused' ? (
              <IconButton label="Wznów odliczanie" onClick={() => save(resumeRestTimer(timer, new Date()))}>
                <Play className="size-5" aria-hidden="true" />
              </IconButton>
            ) : (
              <IconButton label="Wstrzymaj odliczanie" onClick={() => save(pauseRestTimer(timer, new Date()))}>
                <Pause className="size-5" aria-hidden="true" />
              </IconButton>
            )}
            <IconButton label="Pomiń odpoczynek" onClick={dismiss}>
              <X className="size-5" aria-hidden="true" />
            </IconButton>
          </div>
        )}
      </div>
    </div>
  );
}
