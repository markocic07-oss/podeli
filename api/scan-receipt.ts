import type { CurrencyCode, ExpenseCategory } from '../src/types';
import {
  parseSerbianNumber,
  type ParsedFiscalReceipt,
  type ParsedReceiptItem,
} from '../src/utils/fiscalReceipt';

interface GeminiReceiptItemRaw {
  name?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  totalPrice?: unknown;
}

interface GeminiReceiptRaw {
  merchantName?: unknown;
  currency?: unknown;
  category?: unknown;
  totalAmount?: unknown;
  items?: unknown;
}

const VALID_CURRENCIES: CurrencyCode[] = ['RSD', 'EUR', 'BAM'];
const VALID_CATEGORIES: ExpenseCategory[] = [
  'food',
  'drinks',
  'groceries',
  'transport',
  'accommodation',
  'bills',
  'entertainment',
  'gifts',
  'other',
];

const SYSTEM_PROMPT = `Ti si precizan AI sistem za čitanje fiskalnih i nefiskalnih računa iz kafića, restorana, marketa, prodavnica, pekara i benzinskih pumpi (srpska latinica, srpska ćirilica, hrvatski, bosanski i strani računi).

Vrati ISKLJUČIVO validan JSON objekat sa tačno ovim poljima:
{
  "merchantName": "Naziv lokala ili radnje (npr. Kafeterija Dorćol, Maxi, NIS Petrol)",
  "currency": "RSD" | "EUR" | "BAM",
  "category": "food" | "drinks" | "groceries" | "transport" | "accommodation" | "bills" | "entertainment" | "gifts" | "other",
  "totalAmount": 1250.00,
  "items": [
    {
      "name": "Čist naziv artikla bez šifri i barkodova",
      "quantity": 2,
      "unitPrice": 280.00,
      "totalPrice": 560.00
    }
  ]
}

KRITIČNA PRAVILA:
1. SRPSKI BROJEVI: Format "1.250,00" ili "1.250,50" MORA biti vraćen kao JSON broj 1250.00 odnosno 1250.5 (tačka za decimale, bez tačke za hiljade).
2. ARTIKLI: Izvuci SVAKI stvarni kupljeni artikal sa računa. Očisti nepotrebne šifre, poreske oznake (npr. "(Ђ)", "(Е)", "20%", "KOM") iz naziva.
3. KOLIČINA I CENE:
   - Za komadne artikle (npr. "2x Kafa" ili "3 kom"): quantity = 2, unitPrice = cena jednog komada, totalPrice = ukupna cena te stavke (quantity * unitPrice).
   - Za artikle na merenje (npr. "0.450 kg"): quantity = 0.45, unitPrice = cena po kg, totalPrice = stvarna cena koju kupac plaća za tu težinu.
   - Ako na računu piše samo ukupna cena stavke bez količine: quantity = 1, unitPrice = totalPrice.
4. IGNORIŠI: PDV rekapitulaciju, poreske osnovice, zbir poreza, kusur, gotovinu/karticu, brojeve računa, PIB, JIB, vreme, zahvalnice i popuste koji su već uračunati u konačnu cenu artikla.
5. UKUPAN IZNOS (totalAmount): Tačan konačan iznos ZA UPLATU sa dna računa (UKUPAN IZNOS / УКУПАН ИЗНОС / ZA UPLATU / TOTAL).
6. VALUTA: Podrazumevano "RSD", osim ako račun jasno koristi "EUR" (€) ili "BAM" (KM).
7. KATEGORIJA: Izaberi najtačniju kategoriju na osnovu radnje i stavki (kafić/bar -> "drinks", restoran/pekara/brza hrana -> "food", supermarket/prodavnica -> "groceries", pumpa/taksi/parking -> "transport").`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function toNumber(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') return parseSerbianNumber(val) ?? 0;
  return 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizeCurrency(val: unknown): CurrencyCode {
  if (typeof val === 'string') {
    const upper = val.trim().toUpperCase();
    if (upper === 'KM') return 'BAM';
    if (VALID_CURRENCIES.includes(upper as CurrencyCode)) {
      return upper as CurrencyCode;
    }
  }
  return 'RSD';
}

function normalizeCategory(val: unknown): ExpenseCategory {
  if (typeof val === 'string' && VALID_CATEGORIES.includes(val.trim() as ExpenseCategory)) {
    return val.trim() as ExpenseCategory;
  }
  return 'other';
}

function extractJsonText(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) return fenced[1].trim();
  return trimmed;
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return jsonResponse(
      {
        error: 'MISSING_API_KEY',
        reason:
          'GEMINI_API_KEY nije podešen na serveru. Dodaj GEMINI_API_KEY u Vercel Environment Variables.',
      },
      500
    );
  }

  let imageBase64 = '';
  let mimeType = 'image/jpeg';

  try {
    const body = (await request.json()) as {
      imageBase64?: unknown;
      mimeType?: unknown;
    };
    if (typeof body?.imageBase64 === 'string') {
      const raw = body.imageBase64.trim();
      // Strip optional data URL prefix (e.g. data:image/jpeg;base64,...)
      const dataUrlMatch = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (dataUrlMatch) {
        mimeType = dataUrlMatch[1];
        imageBase64 = dataUrlMatch[2];
      } else {
        imageBase64 = raw;
      }
    }
    if (typeof body?.mimeType === 'string' && body.mimeType.startsWith('image/')) {
      mimeType = body.mimeType;
    }
  } catch {
    return jsonResponse(
      { error: 'INVALID_BODY', reason: 'Neispravan JSON zahtev.' },
      400
    );
  }

  if (!imageBase64 || imageBase64.length < 100) {
    return jsonResponse(
      { error: 'MISSING_IMAGE', reason: 'Slika računa nije poslata.' },
      400
    );
  }

  // Guard against overly huge payloads (~8MB base64)
  if (imageBase64.length > 8_500_000) {
    return jsonResponse(
      {
        error: 'IMAGE_TOO_LARGE',
        reason: 'Slika je prevelika. Pokušaj ponovo sa novom fotografijom.',
      },
      413
    );
  }

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
      apiKey
    )}`;

    const geminiRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: 'Pročitaj sve artikle, količine, cene i ukupan iznos sa ove fotografije računa i vrati strogi JSON.',
              },
              {
                inlineData: {
                  mimeType,
                  data: imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text().catch(() => '');
      return jsonResponse(
        {
          error: 'GEMINI_HTTP_ERROR',
          status: geminiRes.status,
          reason:
            geminiRes.status === 429
              ? 'AI servis je trenutno prezauzet. Pokušaj ponovo za nekoliko sekundi.'
              : `AI čitanje računa nije uspelo (HTTP ${geminiRes.status}).`,
          detail: errBody.slice(0, 240),
        },
        502
      );
    }

    const geminiJson = (await geminiRes.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const rawText = geminiJson.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('')
      .trim();

    if (!rawText) {
      return jsonResponse(
        {
          error: 'EMPTY_AI_RESPONSE',
          reason: 'AI nije uspeo da pročita tekst sa slike. Pokušaj sa oštrijom fotografijom.',
        },
        422
      );
    }

    let parsedRaw: GeminiReceiptRaw;
    try {
      parsedRaw = JSON.parse(extractJsonText(rawText)) as GeminiReceiptRaw;
    } catch {
      return jsonResponse(
        {
          error: 'INVALID_AI_JSON',
          reason: 'AI je vratio nečitljiv format. Pokušaj ponovo da slikaš račun.',
        },
        422
      );
    }

    const merchantName =
      typeof parsedRaw.merchantName === 'string' && parsedRaw.merchantName.trim()
        ? parsedRaw.merchantName.trim().slice(0, 80)
        : 'Račun';
    const currency = normalizeCurrency(parsedRaw.currency);
    const category = normalizeCategory(parsedRaw.category);

    const rawItems = Array.isArray(parsedRaw.items)
      ? (parsedRaw.items as GeminiReceiptItemRaw[])
      : [];

    const items: ParsedReceiptItem[] = [];
    for (let i = 0; i < rawItems.length; i++) {
      const r = rawItems[i];
      const name = typeof r?.name === 'string' ? r.name.trim() : '';
      let quantity = toNumber(r?.quantity);
      let unitPrice = toNumber(r?.unitPrice);
      let totalPrice = toNumber(r?.totalPrice);

      if (quantity <= 0) quantity = 1;
      if (totalPrice <= 0 && unitPrice > 0) {
        totalPrice = round2(unitPrice * quantity);
      }
      if (unitPrice <= 0 && totalPrice > 0) {
        unitPrice = round2(totalPrice / quantity);
      }

      if (!name || totalPrice <= 0) continue;

      items.push({
        id: `ai_item_${i + 1}`,
        name: name.slice(0, 120),
        quantity: round2(quantity),
        unitPrice: round2(unitPrice),
        totalPrice: round2(totalPrice),
      });
    }

    const itemsSum = round2(items.reduce((acc, it) => acc + it.totalPrice, 0));
    let totalAmount = round2(toNumber(parsedRaw.totalAmount));
    if (totalAmount <= 0 && itemsSum > 0) {
      totalAmount = itemsSum;
    }

    if (items.length === 0 && totalAmount > 0) {
      items.push({
        id: 'ai_item_total',
        name: merchantName,
        quantity: 1,
        unitPrice: totalAmount,
        totalPrice: totalAmount,
      });
    }

    if (items.length === 0 && totalAmount <= 0) {
      return jsonResponse(
        {
          error: 'RECEIPT_UNREADABLE',
          reason:
            'Nismo uspeli da pročitamo stavke ni ukupan iznos sa ove slike. Slikaj račun bliže na dobrom svetlu ili unesi trošak ručno.',
        },
        422
      );
    }

    const finalItemsSum = round2(items.reduce((acc, it) => acc + it.totalPrice, 0));
    const discrepancyAmount = round2(totalAmount - finalItemsSum);
    // Flag discrepancy only if difference is strictly greater than 1 unit (e.g. > 1 RSD)
    const hasDiscrepancy = Math.abs(discrepancyAmount) > 1;

    const receipt: ParsedFiscalReceipt = {
      merchantName,
      date: new Date().toISOString(),
      totalAmount,
      currency,
      category,
      items,
      itemsSum: finalItemsSum,
      discrepancyAmount,
      hasDiscrepancy,
      source: 'ocr',
    };

    return jsonResponse(receipt, 200);
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError';
    return jsonResponse(
      {
        error: isTimeout ? 'AI_TIMEOUT' : 'SCAN_FAILED',
        reason: isTimeout
          ? 'Čitanje računa je potrajalo predugo. Pokušaj ponovo.'
          : 'Došlo je do greške pri AI čitanju računa. Pokušaj ponovo ili unesi ručno.',
      },
      502
    );
  }
}
