import { Dumbbell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRepositories } from '@/app/repositoriesContext';
import { cn } from '@/shared/lib/cn';

export interface ExerciseThumbnailProps {
  readonly imageId?: string | undefined;
  /** Text alternative; leave empty when the name is shown next to the picture. */
  readonly alt?: string;
  readonly className?: string;
}

/**
 * Exercise picture, or a neutral placeholder when the exercise has none or
 * the stored picture cannot be read.
 */
export function ExerciseThumbnail({ imageId, alt = '', className }: ExerciseThumbnailProps) {
  const { exercises: repository } = useRepositories();
  const [loaded, setLoaded] = useState<{ imageId: string; url: string } | null>(null);

  useEffect(() => {
    if (imageId === undefined) {
      return;
    }
    let cancelled = false;
    let objectUrl: string | undefined;
    repository.getImage(imageId).then(
      (blob) => {
        if (!cancelled && blob) {
          objectUrl = URL.createObjectURL(blob);
          setLoaded({ imageId, url: objectUrl });
        }
      },
      () => {
        // Falls back to the placeholder.
      },
    );
    return () => {
      cancelled = true;
      if (objectUrl !== undefined) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [repository, imageId]);

  const url = loaded !== null && loaded.imageId === imageId ? loaded.url : undefined;
  const frame = cn('shrink-0 overflow-hidden rounded-control bg-surface-muted', className);

  if (url === undefined) {
    return (
      <span
        className={cn(frame, 'flex items-center justify-center text-muted-foreground')}
        data-testid="exercise-placeholder"
        {...(alt === '' ? { 'aria-hidden': true } : { role: 'img', 'aria-label': alt })}
      >
        <Dumbbell className="size-1/2 max-h-10 max-w-10" aria-hidden="true" />
      </span>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      className={cn(frame, 'object-cover')}
      onError={() => setLoaded(null)}
    />
  );
}
