export const BANNER_WIDTH = 1200;
export const BANNER_HEIGHT = 675;
export const MAX_BANNER_BYTES = 5 * 1024 * 1024;
export const MAX_BANNERS_PER_OPENING = 3;
export type ArtworkError = 'type' | 'size' | 'decode' | 'resolution' | 'upload';
export type BannerAsset = { path?: string; url: string; width: number; height: number; bytes: number };
export function validateArtworkFile(file: Pick<File, 'type' | 'size'>): ArtworkError | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'type';
  if (file.size <= 0 || file.size > MAX_BANNER_BYTES) return 'size';
  return null;
}
// Position is expressed in source-image space, independent of RTL UI direction.
export function cropRect(width: number, height: number, zoom: number, x: number, y: number) {
  const factor = Math.max(1, Math.min(3, zoom));
  const baseWidth = Math.min(width, height * BANNER_WIDTH / BANNER_HEIGHT);
  const w = baseWidth / factor;
  const h = w * BANNER_HEIGHT / BANNER_WIDTH;
  return { x: (width - w) * Math.max(0, Math.min(1, x)), y: (height - h) * Math.max(0, Math.min(1, y)), width: w, height: h };
}
