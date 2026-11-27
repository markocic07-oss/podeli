import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Image as ImageIcon,
  Loader2,
  PenLine,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CurrencyCode } from '../types';
import type { ParsedFiscalReceipt } from '../utils/fiscalReceipt';

interface ReceiptScannerModalProps {
  open: boolean;
  currency?: CurrencyCode;
  isDemo?: boolean;
  onParsed: (receipt: ParsedFiscalReceipt) => void;
  onFallbackManual: () => void;
  onClose: () => void;
}

const DEMO_SAMPLE_RECEIPT: ParsedFiscalReceipt = {
  merchantName: 'Kafeterija & Bistro Dorćol',
  date: new Date().toISOString(),
  totalAmount: 2950,
  currency: 'RSD',
  category: 'drinks',
  items: [
    { id: 'item_1', name: 'Espreso sa mlekom', quantity: 2, unitPrice: 280, totalPrice: 560 },
    { id: 'item_2', name: 'Coca-Cola 0.25', quantity: 1, unitPrice: 310, totalPrice: 310 },
    { id: 'item_3', name: 'Zaječarsko pivo 0.5', quantity: 3, unitPrice: 360, totalPrice: 1080 },
    { id: 'item_4', name: 'Burger Classic', quantity: 1, unitPrice: 1000, totalPrice: 1000 },
  ],
  itemsSum: 2950,
  discrepancyAmount: 0,
  hasDiscrepancy: false,
  source: 'ocr',
};

const MAX_IMAGE_WIDTH = 1400;
const JPEG_QUALITY = 0.85;

/**
 * Resizes and compresses a receipt photo in the browser via HTML5 Canvas
 * (max width 1400px, JPEG 0.85) so upload takes < 1 second while preserving crisp text.
 */
async function compressReceiptImage(file: File): Promise<{
  base64: string;
  previewUrl: string;
}> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'));
      el.src = objectUrl;
    });

    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;
    const scale = naturalW > MAX_IMAGE_WIDTH ? MAX_IMAGE_WIDTH / naturalW : 1;
    const targetW = Math.max(1, Math.round(naturalW * scale));
    const targetH = Math.max(1, Math.round(naturalH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('CANVAS_UNAVAILABLE');
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    const base64 = dataUrl.split(',')[1] ?? '';
    if (!base64) {
      throw new Error('COMPRESSION_FAILED');
    }

    return { base64, previewUrl: dataUrl };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export const ReceiptScannerModal: React.FC<ReceiptScannerModalProps> = ({
  open,
  currency = 'RSD',
  isDemo = false,
  onParsed,
  onFallbackManual,
  onClose,
}) => {
  const { t } = useTranslation();

  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setLoading(false);
      setPreviewUrl(null);
      setError(null);
    }
  }, [open]);

  const handleImagePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    setLoading(true);

    try {
      const { base64, previewUrl: compressedPreview } = await compressReceiptImage(file);
      setPreviewUrl(compressedPreview);

      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
      const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
      const scanEndpoint = supabaseUrl
        ? `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/scan-receipt`
        : '/api/scan-receipt';

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (supabaseUrl && supabaseAnonKey) {
        headers.apikey = supabaseAnonKey;
        headers.Authorization = `Bearer ${supabaseAnonKey}`;
      }

      const res = await fetch(scanEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: 'image/jpeg',
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | (ParsedFiscalReceipt & { error?: string; reason?: string })
        | null;

      if (!res.ok || !data || data.error) {
        setError(
          data?.reason ||
            'Nismo uspeli da pročitamo račun sa ove slike. Pokušaj ponovo na boljem svetlu ili unesi ručno.'
        );
        return;
      }

      onParsed(data);
    } catch {
      setError(
        'Došlo je do greške pri obradi fotografije. Proveri internet vezu i pokušaj ponovo.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#171C19]/55 backdrop-blur-[2px] animate-fade-in"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <div className="bg-white w-full sm:max-w-md rounded-3xl border border-[#E8ECE9] shadow-(--shadow-modal) max-h-[88dvh] flex flex-col overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E8ECE9] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#E8F1EB] text-[#35483F] flex items-center justify-center">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#171C19]">Slikaj ceo račun</h2>
              <p className="text-[11px] text-[#818A84]">
                AI čita sve stavke, količine i cene sa bilo kog računa
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-1.5 rounded-xl text-[#818A84] hover:bg-[#F5F7F6] disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {loading ? (
            <div className="rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6] p-6 text-center space-y-4">
              {previewUrl && (
                <div className="w-28 h-36 mx-auto rounded-xl overflow-hidden border border-[#E8ECE9] bg-white shadow-xs">
                  <img
                    src={previewUrl}
                    alt="Račun"
                    className="w-full h-full object-cover opacity-85"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Loader2 className="w-7 h-7 text-[#35483F] animate-spin mx-auto" />
                <p className="text-sm font-bold text-[#171C19]">
                  Čitam stavke i cene sa računa...
                </p>
                <p className="text-xs text-[#818A84]">
                  Obično traje 2–4 sekunde.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6] p-5 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-white border border-[#E8ECE9] flex items-center justify-center mx-auto text-[#35483F] shadow-xs">
                <Camera className="w-7 h-7" />
              </div>

              <div className="space-y-1">
                <p className="text-sm font-bold text-[#171C19]">
                  Fotografiši ceo račun odozgo
                </p>
                <p className="text-xs text-[#818A84] leading-relaxed">
                  Radi za kafić, restoran, market, prodavnicu ili pumpu — na latinici i ćirilici.
                </p>
              </div>

              {/* Primary CTA: Native phone camera with autofocus */}
              <div className="space-y-2.5 pt-1">
                <label className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-colors">
                  <Camera className="w-4 h-4 shrink-0" />
                  <span>Slikaj račun kamerom</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleImagePicked}
                    className="hidden"
                  />
                </label>

                {/* Secondary CTA: Pick existing receipt photo from gallery */}
                <label className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-white hover:bg-[#E8F1EB]/60 text-[#35483F] border border-[#E8ECE9] text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors">
                  <ImageIcon className="w-4 h-4 shrink-0" />
                  <span>Izaberi sliku iz galerije</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImagePicked}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          )}

          {/* Error state + retry / manual fallback */}
          {error && !loading && (
            <div className="p-3.5 rounded-2xl bg-[#FCEEEE] border border-[#C94A4A]/25 space-y-2.5">
              <div className="flex items-start gap-2 text-xs text-[#C94A4A] font-medium">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <label className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Slikaj ponovo</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleImagePicked}
                    className="hidden"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onFallbackManual();
                  }}
                  className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-white border border-[#E8ECE9] text-[#171C19] text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-[#F5F7F6]"
                >
                  <PenLine className="w-3.5 h-3.5" />
                  <span>{t('receipt.enterManually')}</span>
                </button>
              </div>
            </div>
          )}

          {/* Demo helper */}
          {isDemo && !loading && (
            <button
              type="button"
              onClick={() => onParsed({ ...DEMO_SAMPLE_RECEIPT, currency })}
              className="w-full min-h-[42px] px-3.5 py-2 rounded-2xl bg-[#E8F1EB]/70 hover:bg-[#E8F1EB] text-[#35483F] text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t('receipt.trySampleReceipt')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
