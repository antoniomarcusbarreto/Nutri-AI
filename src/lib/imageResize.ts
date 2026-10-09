/**
 * Prepara uma foto para envio: reduz para no máximo `maxSide` px e regrava em
 * JPEG via canvas. Regravar descarta os metadados EXIF (localização GPS,
 * modelo do aparelho) — importante para fotos do corpo (dado sensível, LGPD).
 * `createImageBitmap` já aplica a orientação EXIF antes de descartá-la.
 */
export async function prepareImage(file: File, maxSide = 1600, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível processar a foto.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível processar a foto.'))), 'image/jpeg', quality),
  );
}
