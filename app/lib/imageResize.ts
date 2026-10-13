// Réduit les photos avant envoi : une photo de téléphone fait 3 à 10 Mo,
// ce qui ralentit l'envoi ET dépasse la limite de 4,5 Mo de Vercel.
// 800 px suffisent largement pour lire le nom et le numéro d'une carte.
export const CAPTURE_MAX_SIDE = 800;
export const CAPTURE_QUALITY = 0.75;

async function loadBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* repli sur <img> */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = url;
  });
}

export async function fileToResizedBase64(
  file: Blob
): Promise<{ base64: string; mimeType: string }> {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, CAPTURE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible');
  ctx.drawImage(bitmap, 0, 0, w, h);
  if ('close' in bitmap) bitmap.close();

  return {
    base64: canvas.toDataURL('image/jpeg', CAPTURE_QUALITY).split(',')[1],
    mimeType: 'image/jpeg',
  };
}
