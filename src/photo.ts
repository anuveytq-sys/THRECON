export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const MIN_PHOTO_EDGE = 256;
export const MAX_PHOTO_EDGE = 8192;
export const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;

export interface PhotoMetadata {
  type: string;
  size: number;
  width: number;
  height: number;
}

export function validatePhotoMetadata(photo: PhotoMetadata): string | null {
  if (photo.type.startsWith('video/')) return 'Video input is disabled. THRECON accepts still photographs only.';
  if (!ACCEPTED_PHOTO_TYPES.includes(photo.type as typeof ACCEPTED_PHOTO_TYPES[number])) return 'Unsupported format. Use JPEG, PNG, WebP or AVIF.';
  if (photo.size <= 0 || photo.size > MAX_PHOTO_BYTES) return 'Photo must be smaller than 15 MB.';
  if (photo.width < MIN_PHOTO_EDGE || photo.height < MIN_PHOTO_EDGE) return 'Photo resolution is too small. Both dimensions must be at least 256 px.';
  if (photo.width > MAX_PHOTO_EDGE || photo.height > MAX_PHOTO_EDGE) return 'Photo dimensions exceed the 8192 px safety limit.';
  return null;
}

export function estimatePhotoQuality(pixels: Uint8ClampedArray, width: number, height: number) {
  const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / 18000)));
  let brightness = 0;
  let count = 0;
  let laplace = 0;
  let laplaceSquared = 0;
  for (let y = 1; y < height - 1; y += stride) {
    for (let x = 1; x < width - 1; x += stride) {
      const at = (y * width + x) * 4;
      const gray = (pixels[at] * 0.299 + pixels[at + 1] * 0.587 + pixels[at + 2] * 0.114);
      brightness += gray;
      const l = (v: number) => {
        const i = (y * width + x + v) * 4;
        return pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
      };
      const up = ((y - 1) * width + x) * 4;
      const down = ((y + 1) * width + x) * 4;
      const vertical = (pixels[up] * .299 + pixels[up + 1] * .587 + pixels[up + 2] * .114)
        + (pixels[down] * .299 + pixels[down + 1] * .587 + pixels[down + 2] * .114);
      const value = 4 * gray - l(-1) - l(1) - vertical;
      laplace += value;
      laplaceSquared += value * value;
      count++;
    }
  }
  const mean = brightness / Math.max(count, 1);
  const variance = laplaceSquared / Math.max(count, 1) - Math.pow(laplace / Math.max(count, 1), 2);
  return {
    brightness: Math.round(mean),
    sharpness: Math.max(0, Math.round(variance)),
    warnings: [
      ...(mean < 38 ? ['Photo is very dark; depth estimates may be less reliable.'] : []),
      ...(mean > 225 ? ['Photo is very bright; surface details may be lost.'] : []),
      ...(variance < 45 ? ['Photo may be soft or blurred; consider a sharper image.'] : []),
    ],
  };
}
