import type { CurrencyCode } from '../types';
import { parseOcrReceiptText, type ParsedFiscalReceipt } from './fiscalReceipt';

/**
 * Enhances a receipt photograph on an offscreen canvas (downscale + grayscale + contrast boost)
 * so thermal paper text is read much faster and more accurately by Tesseract OCR.
 */
async function preprocessReceiptImage(file: File): Promise<HTMLCanvasElement> {
  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'));
      el.src = bitmapUrl;
    });

    const maxWidth = 1500;
    const scale = img.width > maxWidth ? maxWidth / img.width : 1;
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    ctx.drawImage(img, 0, 0, width, height);

    // Grayscale + gentle contrast stretch for crisp thermal ink
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const contrast = 1.35;
    const intercept = 128 * (1 - contrast);

    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const boosted = Math.max(0, Math.min(255, gray * contrast + intercept));
      data[i] = boosted;
      data[i + 1] = boosted;
      data[i + 2] = boosted;
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

/**
 * Lazy-loads tesseract.js and runs OCR on a receipt image in Serbian Latin + Serbian Cyrillic + English,
 * returning structured line items and total amount.
 */
export async function runReceiptOcr(
  file: File,
  currency: CurrencyCode,
  onProgress?: (percent: number) => void
): Promise<ParsedFiscalReceipt> {
  onProgress?.(8);
  const canvas = await preprocessReceiptImage(file);
  onProgress?.(18);

  const { recognize } = await import('tesseract.js');
  const result = await recognize(canvas, 'srp_latn+srp+eng', {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        onProgress?.(20 + Math.round(m.progress * 78));
      }
    },
  });

  onProgress?.(100);
  const rawText = result.data?.text ?? '';
  return parseOcrReceiptText(rawText, currency);
}
