import { Compass, TriangleAlert } from 'lucide-react';
import { Link, useRouteError } from 'react-router';
import { Button } from '@/shared/ui/Button';
import { buttonStyles } from '@/shared/ui/buttonStyles';
import { EmptyState } from '@/shared/ui/states';
import { ROUTE_PATHS } from './navigation';

export function NotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      title="Nie znaleziono strony"
      description="Ten adres nie prowadzi do żadnego ekranu aplikacji."
      action={
        <Link to={ROUTE_PATHS.dashboard} className={buttonStyles()}>
          Wróć na pulpit
        </Link>
      }
    />
  );
}

/** Shown instead of a blank screen when a screen throws while rendering. */
export function RouteErrorPage() {
  const error = useRouteError();
  console.error('Unhandled screen error', error);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <EmptyState
        icon={TriangleAlert}
        title="Coś poszło nie tak"
        description="Wystąpił nieoczekiwany błąd ekranu. Twoje zapisane dane są bezpieczne. Odśwież aplikację, aby kontynuować."
        action={<Button onClick={() => window.location.reload()}>Odśwież aplikację</Button>}
      />
    </div>
  );
}
