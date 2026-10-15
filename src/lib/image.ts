/** The size an image becomes when its longest edge is limited to `maxEdge` (never enlarged). */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Shrinks a phone photo (often a multi-MB HEIC) to a JPEG of at most `maxEdge` pixels before uploading.
 * Safari decodes HEIC itself, so the canvas always gets ordinary pixels.
 */
export async function resizeImage(file: Blob, maxEdge = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not read that photo.'))), 'image/jpeg', 0.8));
}
