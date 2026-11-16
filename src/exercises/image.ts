/**
 * Prepares a user-chosen picture for storage: scaled down and re-encoded as
 * JPEG so a photo straight from a phone camera (several MB) takes roughly
 * 100–300 kB in the database and in backups.
 */

export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 1024;
const TARGET_BYTES = 400 * 1024;

export type ImageProblem = 'not-an-image' | 'too-large' | 'cannot-read';

export class ImageProcessingError extends Error {
  readonly problem: ImageProblem;

  constructor(problem: ImageProblem) {
    super(`Image rejected: ${problem}`);
    this.name = 'ImageProcessingError';
    this.problem = problem;
  }
}

const PROBLEM_MESSAGES: Readonly<Record<ImageProblem, string>> = {
  'not-an-image': 'Wybrany plik nie jest obrazem. Wybierz zdjęcie lub grafikę (JPG, PNG, WebP).',
  'too-large': 'Plik jest za duży (limit 25 MB). Wybierz mniejszy obraz.',
  'cannot-read':
    'Nie udało się odczytać tego obrazu. Spróbuj z innym plikiem, najlepiej JPG lub PNG.',
};

export function imageProblemMessage(problem: ImageProblem): string {
  return PROBLEM_MESSAGES[problem];
}

/** Largest size with the same proportions that fits in a `maxSide` square; never upscales. */
export function fitWithin(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Throws `ImageProcessingError` for files that cannot be accepted at all. */
export function assertAcceptableSource(file: { type: string; size: number }): void {
  if (!file.type.startsWith('image/')) {
    throw new ImageProcessingError('not-an-image');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new ImageProcessingError('too-large');
  }
}

function encodeJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new ImageProcessingError('cannot-read'));
        }
      },
      'image/jpeg',
      quality,
    );
  });
}

export async function prepareExerciseImage(file: File): Promise<Blob> {
  assertAcceptableSource(file);

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new ImageProcessingError('cannot-read');
    }

    const { width, height } = fitWithin(image.naturalWidth, image.naturalHeight, MAX_IMAGE_SIDE);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new ImageProcessingError('cannot-read');
    }
    // JPEG has no transparency: put transparent pictures on white, not black.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const blob = await encodeJpeg(canvas, 0.82);
    return blob.size > TARGET_BYTES ? await encodeJpeg(canvas, 0.6) : blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
