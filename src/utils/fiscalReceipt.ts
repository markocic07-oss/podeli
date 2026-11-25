import type { CurrencyCode, ExpenseCategory, ShareAllocation } from '../types';
import { calculateEqualSplit } from './finance';

export interface ParsedReceiptItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface ParsedFiscalReceipt {
  merchantName: string;
  date: string; // ISO 8601
  totalAmount: number;
  currency: CurrencyCode;
  category?: ExpenseCategory;
  items: ParsedReceiptItem[];
  itemsSum: number;
  discrepancyAmount: number;
  hasDiscrepancy: boolean;
  source: 'specifications' | 'html_table' | 'journal' | 'ocr';
}

export interface EditableReceiptItem {
  id: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  totalPriceMinor: number;
  assignedMemberIds: string[];
}

export type TipDistributionMode = 'proportional' | 'equal';

export interface ItemizedSplitResult {
  assignedItemsTotalMinor: number;
  unassignedItemsTotalMinor: number;
  allItemsTotalMinor: number;
  tipMinor: number;
  grandTotalMinor: number;
  shares: ShareAllocation[];
  sharesByUser: Record<string, number>;
  allItemsAssigned: boolean;
}

/**
 * Normalizes Serbian eFiskalizacija URLs (http://, missing scheme, or surrounding text)
 * into a clean https://suf.purs.gov.rs/... URL.
 */
export function normalizeSerbianFiscalUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  const embeddedMatch = trimmed.match(/(?:https?:\/\/)?suf\.purs\.gov\.rs[^\s"'<>]*/i);
  const candidate = embeddedMatch ? embeddedMatch[0] : trimmed;
  if (/^http:\/\/suf\.purs\.gov\.rs(\/|$)/i.test(candidate)) {
    return candidate.replace(/^http:\/\//i, 'https://');
  }
  if (/^suf\.purs\.gov\.rs(\/|$)/i.test(candidate)) {
    return `https://${candidate}`;
  }
  return candidate;
}

/**
 * Strict SSRF-safe validation for Serbian Tax Administration (eFiskalizacija) URLs.
 * Only permits https://suf.purs.gov.rs/...
 */
export function isValidSerbianFiscalUrl(rawUrl: string): boolean {
  try {
    const trimmed = rawUrl.trim();
    if (!trimmed) return false;
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.hostname.toLowerCase() !== 'suf.purs.gov.rs') return false;
    if (parsed.username || parsed.password) return false;
    if (parsed.port && parsed.port !== '443') return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Reliably converts Serbian-formatted numbers (e.g. "1.250,50", "4.250,00", "2,000", "0,330")
 * or standard numbers ("1250.50") into JavaScript numbers.
 */
export function parseSerbianNumber(raw: string): number | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(/\s+/g, '').replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;

  const isNegative = cleaned.startsWith('-');
  const unsigned = isNegative ? cleaned.slice(1) : cleaned;
  if (!/^\d+([.,]\d+)*$/.test(unsigned)) return null;

  let normalized = unsigned;
  const lastComma = unsigned.lastIndexOf(',');
  const lastDot = unsigned.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      // Serbian: 1.250,50 -> 1250.50
      normalized = unsigned.replace(/\./g, '').replace(',', '.');
    } else {
      // English: 1,250.50 -> 1250.50
      normalized = unsigned.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    // Only comma: decimal separator (280,00 or 2,000 or 0,330)
    const parts = unsigned.split(',');
    if (parts.length > 2) return null;
    normalized = `${parts[0]}.${parts[1]}`;
  } else if (lastDot !== -1) {
    const parts = unsigned.split('.');
    if (parts.length > 2) {
      normalized = parts.join('');
    } else if (parts[1].length === 3 && Number(parts[0]) >= 1) {
      // e.g. "4.250" -> 4250 in Serbian thousands format
      normalized = parts.join('');
    } else {
      normalized = unsigned;
    }
  }

  const num = Number(isNegative ? `-${normalized}` : normalized);
  return Number.isFinite(num) ? num : null;
}

export function majorToMinor(amount: number): number {
  return Math.round(amount * 100);
}

export function minorToMajor(minor: number): number {
  return Math.round(minor) / 100;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)));
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanItemName(name: string): string {
  // Remove trailing Serbian fiscal tax group tags like "(Ђ)", "(Đ)", "(Е)", "(А)", "(Г)", "/KOM"
  return name
    .replace(/\s*\([ЂĐЕEАAГGЖŽОO]\)\s*$/iu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses Serbian fiscal date format "DD.MM.YYYY. HH:mm:ss" or "DD.MM.YYYY HH:mm:ss" into ISO string.
 */
export function parseSerbianDate(raw: string): string {
  const match = raw.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\.?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const [, dd, mm, yyyy, hh, min, ss = '00'] = match;
    const iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T${hh.padStart(2, '0')}:${min}:${ss}`;
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString();
    }
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }
  return new Date().toISOString();
}

/**
 * Extracts invoiceNumber and token from suf.purs.gov.rs HTML for calling POST /specifications.
 */
export function extractSpecificationParams(
  html: string
): { invoiceNumber: string; token: string } | null {
  const invMatch =
    html.match(/viewModel\.InvoiceNumber\s*\(\s*['"]([^'"]+)['"]\s*\)/i) ||
    html.match(/invoiceNumber['"]?\s*[:=]\s*['"]([^'"]+)['"]/i) ||
    html.match(/(?:id|name)=['"]invoiceNumber['"][^>]*value=['"]([^'"]+)['"]/i) ||
    html.match(/value=['"]([^'"]+)['"][^>]*(?:id|name)=['"]invoiceNumber['"]/i);

  const tokMatch =
    html.match(/viewModel\.Token\s*\(\s*['"]([^'"]+)['"]\s*\)/i) ||
    html.match(/['"]?token['"]?\s*[:=]\s*['"]([A-Za-z0-9+/=_-]{16,})['"]/i) ||
    html.match(/(?:id|name)=['"]token['"][^>]*value=['"]([^'"]+)['"]/i) ||
    html.match(/value=['"]([A-Za-z0-9+/=_-]{16,})['"][^>]*(?:id|name)=['"]token['"]/i);

  if (invMatch?.[1] && tokMatch?.[1]) {
    return {
      invoiceNumber: invMatch[1].trim(),
      token: tokMatch[1].trim(),
    };
  }
  return null;
}

/**
 * Parses JSON response from https://suf.purs.gov.rs/specifications
 */
export function parseSpecificationsJson(payload: unknown): ParsedReceiptItem[] {
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload as Record<string, unknown>;
  const rawItems = Array.isArray(obj.items)
    ? obj.items
    : Array.isArray(obj.Items)
    ? obj.Items
    : Array.isArray(payload)
    ? payload
    : [];

  const result: ParsedReceiptItem[] = [];
  rawItems.forEach((entry, idx) => {
    if (!entry || typeof entry !== 'object') return;
    const r = entry as Record<string, unknown>;
    const rawName = String(r.name ?? r.Name ?? '').trim();
    if (!rawName) return;

    const toNum = (v: unknown): number | null => {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string') return parseSerbianNumber(v);
      return null;
    };

    const quantity = toNum(r.quantity ?? r.Quantity) ?? 1;
    const unitPrice = toNum(r.unitPrice ?? r.UnitPrice) ?? 0;
    const totalPrice =
      toNum(r.total ?? r.Total ?? r.totalAmount ?? r.TotalAmount) ??
      Math.round(unitPrice * quantity * 100) / 100;

    if (totalPrice <= 0 && unitPrice <= 0) return;

    result.push({
      id: `item_${idx + 1}`,
      name: cleanItemName(rawName),
      quantity: quantity > 0 ? quantity : 1,
      unitPrice: unitPrice > 0 ? unitPrice : Math.round((totalPrice / (quantity || 1)) * 100) / 100,
      totalPrice: Math.round(totalPrice * 100) / 100,
    });
  });

  return result;
}

/**
 * Parses an HTML specification table if embedded directly on suf.purs.gov.rs page.
 */
export function parseHtmlItemsTable(html: string): ParsedReceiptItem[] {
  const tableMatch = html.match(/<table[^>]*class=['"][^'"]*invoice-table[^'"]*['"][^>]*>([\s\S]*?)<\/table>/i)
    || html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tableMatch) return [];

  const rows = tableMatch[1].match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const items: ParsedReceiptItem[] = [];

  for (const row of rows) {
    const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) ?? []).map(stripTags);
    if (cells.length < 4) continue;
    const name = cleanItemName(cells[0]);
    const qty = parseSerbianNumber(cells[1]);
    const unit = parseSerbianNumber(cells[2]);
    const total = parseSerbianNumber(cells[3]);
    if (!name || total === null || total <= 0) continue;

    items.push({
      id: `item_${items.length + 1}`,
      name,
      quantity: qty && qty > 0 ? qty : 1,
      unitPrice: unit && unit > 0 ? unit : Math.round((total / (qty || 1)) * 100) / 100,
      totalPrice: Math.round(total * 100) / 100,
    });
  }

  return items;
}

/**
 * Parses the official Serbian eFiskalizacija text journal (<pre> block)
 * supporting both Cyrillic and Latin script.
 */
export function parseJournalText(journalText: string): {
  merchantName: string | null;
  date: string | null;
  totalAmount: number | null;
  items: ParsedReceiptItem[];
} {
  const lines = journalText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''));

  // 1. Extract Merchant Name (typically 2-3 lines right after "ФИСКАЛНИ РАЧУН" / "FISKALNI RAČUN" and PIB line)
  let merchantName: string | null = null;
  const headerIdx = lines.findIndex((l) =>
    /ФИСКАЛНИ РАЧУН|FISKALNI RAČUN|FISKALNI RACUN/i.test(l)
  );
  if (headerIdx !== -1) {
    for (let i = headerIdx + 1; i < Math.min(headerIdx + 7, lines.length); i++) {
      const candidate = lines[i].trim();
      if (!candidate) continue;
      // Skip pure PIB digits (9 digits)
      if (/^\d{8,13}$/.test(candidate)) continue;
      if (/^[-=]{5,}$/.test(candidate)) continue;
      merchantName = candidate;
      break;
    }
  }

  // 2. Extract Date (ПФР време / PFR vreme)
  let date: string | null = null;
  for (const line of lines) {
    if (/ПФР време|PFR vreme/i.test(line)) {
      date = parseSerbianDate(line);
      break;
    }
  }

  // 3. Extract Total Amount (Укупан износ / Ukupan iznos / За уплату / Za uplatu) — strictly exclude tax/PDV lines!
  let totalAmount: number | null = null;
  for (const line of lines) {
    if (/(?:порез|porez|пдв|pdv|основиц|osnovic)/i.test(line)) continue;
    const m = line.match(
      /(?:Укупан износ|Ukupan iznos|За уплату|Za uplatu|Укупно|Ukupno)\s*:?\s*([\d.,]+)/i
    );
    if (m) {
      totalAmount = parseSerbianNumber(m[1]);
      break;
    }
  }

  // 4. Extract Items between Назив/Naziv header and dashed separator before Укупан износ
  const items: ParsedReceiptItem[] = [];
  const startIdx = lines.findIndex((l) =>
    /(Назив|Naziv)\s+(Цена|Cena)\s+(Кол|Kol)/i.test(l)
  );

  if (startIdx !== -1) {
    let pendingNameParts: string[] = [];

    for (let i = startIdx + 1; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();
      if (!trimmed) continue;

      // Stop at section end
      if (
        /^[-=]{5,}$/.test(trimmed) ||
        /^(Укупан износ|Ukupan iznos)/i.test(trimmed)
      ) {
        break;
      }

      // Check if line is the price/qty/total line: e.g. "   280,00   2   560,00" or "   280,00   1,000   280,00"
      const numericLine = trimmed.match(
        /^([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)$/
      );
      if (numericLine && pendingNameParts.length > 0) {
        const unitPrice = parseSerbianNumber(numericLine[1]);
        const quantity = parseSerbianNumber(numericLine[2]);
        const totalPrice = parseSerbianNumber(numericLine[3]);

        if (unitPrice !== null && quantity !== null && totalPrice !== null && totalPrice > 0) {
          items.push({
            id: `item_${items.length + 1}`,
            name: cleanItemName(pendingNameParts.join(' ')),
            quantity: quantity > 0 ? quantity : 1,
            unitPrice,
            totalPrice: Math.round(totalPrice * 100) / 100,
          });
        }
        pendingNameParts = [];
        continue;
      }

      // Some compact receipts put name + 3 numbers on a single line
      const singleLineMatch = trimmed.match(
        /^(.+?)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)$/
      );
      if (singleLineMatch) {
        const unitPrice = parseSerbianNumber(singleLineMatch[2]);
        const quantity = parseSerbianNumber(singleLineMatch[3]);
        const totalPrice = parseSerbianNumber(singleLineMatch[4]);
        if (unitPrice !== null && quantity !== null && totalPrice !== null && totalPrice > 0) {
          items.push({
            id: `item_${items.length + 1}`,
            name: cleanItemName(singleLineMatch[1]),
            quantity: quantity > 0 ? quantity : 1,
            unitPrice,
            totalPrice: Math.round(totalPrice * 100) / 100,
          });
          pendingNameParts = [];
          continue;
        }
      }

      pendingNameParts.push(trimmed);
    }
  }

  return { merchantName, date, totalAmount, items };
}

/**
 * Unified HTML parser for suf.purs.gov.rs response.
 * Combines metadata from HTML labels + <pre> journal + optional /specifications JSON items.
 */
export function parseFiscalHtml(
  html: string,
  specItems?: ParsedReceiptItem[]
): ParsedFiscalReceipt {
  const extractById = (idPattern: string): string | null => {
    const regex = new RegExp(`id=['"]${idPattern}['"][^>]*>([\\s\\S]*?)<\\/`, 'i');
    const m = html.match(regex);
    return m ? stripTags(m[1]) : null;
  };

  const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  const journal = preMatch ? parseJournalText(decodeHtmlEntities(preMatch[1])) : null;

  const merchantFromHtml =
    extractById('shopFullNameLabel') ||
    extractById('businessNameLabel') ||
    null;

  const dateFromHtml = extractById('sdcDateTimeLabel');
  const totalFromHtmlRaw = extractById('totalAmountLabel');
  const totalFromHtml = totalFromHtmlRaw ? parseSerbianNumber(totalFromHtmlRaw) : null;

  const tableItems = parseHtmlItemsTable(html);

  let items: ParsedReceiptItem[] = [];
  let source: ParsedFiscalReceipt['source'] = 'journal';

  if (specItems && specItems.length > 0) {
    items = specItems;
    source = 'specifications';
  } else if (tableItems.length > 0) {
    items = tableItems;
    source = 'html_table';
  } else if (journal && journal.items.length > 0) {
    items = journal.items;
    source = 'journal';
  }

  const itemsSumMinor = items.reduce((acc, it) => acc + majorToMinor(it.totalPrice), 0);
  const itemsSum = minorToMajor(itemsSumMinor);

  const totalAmount =
    totalFromHtml ?? journal?.totalAmount ?? (itemsSum > 0 ? itemsSum : 0);

  const totalMinor = majorToMinor(totalAmount);
  const discrepancyMinor = totalMinor - itemsSumMinor;

  const merchantName =
    merchantFromHtml || journal?.merchantName || 'Fiskalni račun';

  const date = dateFromHtml
    ? parseSerbianDate(dateFromHtml)
    : journal?.date ?? new Date().toISOString();

  return {
    merchantName,
    date,
    totalAmount: minorToMajor(totalMinor),
    currency: 'RSD',
    category: detectReceiptCategory(merchantName, items, ''),
    items,
    itemsSum,
    discrepancyAmount: minorToMajor(discrepancyMinor),
    hasDiscrepancy: Math.abs(discrepancyMinor) > 0,
    source,
  };
}

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'dj', е: 'e', ж: 'z', з: 'z',
  и: 'i', ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', ћ: 'c', у: 'u', ф: 'f', х: 'h', ц: 'c',
  ч: 'c', џ: 'dz', ш: 's',
};

/**
 * Normalizes Serbian Cyrillic & Latin diacritics into plain lowercase ASCII for resilient keyword matching.
 */
export function toSearchableLatin(text: string): string {
  return text
    .toLowerCase()
    .replace(/[а-шђјљњћџ]/g, (ch) => CYRILLIC_TO_LATIN[ch] ?? ch)
    .replace(/č/g, 'c')
    .replace(/ć/g, 'c')
    .replace(/ž/g, 'z')
    .replace(/š/g, 's')
    .replace(/đ/g, 'dj');
}

const CATEGORY_KEYWORDS: Record<Exclude<ExpenseCategory, 'other'>, string[]> = {
  drinks: [
    'kafa', 'kafe', 'caffe', 'cafe', 'coffee', 'espres', 'kapucin', 'cappuccin',
    'makijat', 'macchiat', 'latte', 'nescaf', 'nes ', 'domaca kafa', 'turska kafa',
    'caj', 'tea', 'pivo', 'beer', 'vino', 'wine', 'rakij', 'viski', 'whisky',
    'vodka', 'dzin', 'gin', 'koktel', 'cocktail', 'sok', 'juice', 'kola', 'cola',
    'pepsi', 'fanta', 'sprite', 'schweppes', 'tonik', 'tonic', 'limunad', 'cedevit',
    'voda', 'knjaz', 'rosa', 'kisela', 'gaziran', 'negaziran', 'kafeterij', 'kafic',
    'pub', 'pab', 'bar', 'pivnic', 'vinarij', 'pice', 'napit', 'zajecar', 'jelen',
    'heineken', 'tuborg', 'stella', 'niksic', 'bavaria', 'aperol', 'spritz', 'mojito',
    'red bull', 'guarana', 'energetsk', 'cedjen', 'pomorandz', 'espresso',
  ],
  food: [
    'restoran', 'kafan', 'konob', 'picerij', 'pizzer', 'pekar', 'burek', 'rostilj',
    'cevap', 'pljeskav', 'burger', 'pizza', 'pica', 'pasta', 'salat', 'sendvic',
    'giros', 'gyros', 'palacink', 'kolac', 'tort', 'sladoled', 'pomfrit', 'piletin',
    'teletin', 'svinjetin', 'riba', 'supa', 'corba', 'rucak', 'vecera', 'dorucak',
    'kifla', 'kroasan', 'kuhinj', 'bistro', 'grill', 'mcdonald', 'kfc', 'walter',
    'skroz dobra', 'hrana', 'jelo', 'obrok', 'dezert', 'slatk', 'poslastic',
  ],
  groceries: [
    'maxi', 'mega maxi', 'idea', 'lidl', 'univerexport', 'roda', 'aman', 'aroma',
    'mercator', 'konzum', 'bingo', 'supermarket', 'market', 'prodavnic', 'samoposlug',
    'piljar', 'mesar', 'mleko', 'jogurt', 'jaja', 'voce', 'povrce', 'ulje', 'secer',
    'brasno', 'hleb', 'namirnic', 'dm droger', 'lilly',
  ],
  transport: [
    'gazprom', 'omv', 'petrol', 'lukoil', 'pumpa', 'benzin', 'dizel', 'gorivo',
    'evro dizel', 'bmb', 'tng', 'taxi', 'taksi', 'cargo', 'car:go', 'yandex',
    'uber', 'parking', 'putarin', 'autobus', 'prevoz', 'nis petrol',
  ],
  accommodation: [
    'hotel', 'hostel', 'apartman', 'smestaj', 'nocenje', 'booking', 'airbnb', 'motel', 'resort',
  ],
  entertainment: [
    'bioskop', 'cineplexx', 'ulaznic', 'koncert', 'pozorist', 'muzej', 'kuglan', 'bilijar',
  ],
  bills: [
    'eps', 'infostan', 'struja', 'komunal', 'internet', 'yettel', 'sbb', 'telekom',
  ],
  gifts: [
    'poklon', 'cvecara', 'buket', 'parfimer', 'igrack', 'knjizar', 'laguna', 'vulkan',
  ],
};

/**
 * Auto-detects the most appropriate ExpenseCategory from merchant name, parsed items, and raw receipt text.
 * Recognizes Serbian/Croatian/Bosnian Cyrillic & Latin keywords (e.g. kafa/pivo/sok -> 'drinks').
 */
export function detectReceiptCategory(
  merchantName: string,
  items: ParsedReceiptItem[],
  rawText = ''
): ExpenseCategory {
  const itemText = toSearchableLatin(items.map((i) => i.name).join(' '));
  const merchantText = toSearchableLatin(merchantName);
  const fullText = toSearchableLatin(`${merchantName} ${items.map((i) => i.name).join(' ')} ${rawText}`);

  const scores: Record<Exclude<ExpenseCategory, 'other'>, number> = {
    drinks: 0,
    food: 0,
    groceries: 0,
    transport: 0,
    accommodation: 0,
    entertainment: 0,
    bills: 0,
    gifts: 0,
  };

  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as Array<
    [Exclude<ExpenseCategory, 'other'>, string[]]
  >) {
    for (const kw of keywords) {
      // Short words (<=3 chars) need word boundary to avoid false positives
      const pattern =
        kw.trim().length <= 3
          ? new RegExp(`(?:^|[^a-z0-9])${kw.trim()}(?:$|[^a-z0-9])`, 'i')
          : new RegExp(kw.trim(), 'i');

      if (pattern.test(itemText)) scores[cat] += 3;
      else if (pattern.test(merchantText)) scores[cat] += 2;
      else if (pattern.test(fullText)) scores[cat] += 1;
    }
  }

  let bestCat: ExpenseCategory = 'other';
  let bestScore = 0;

  for (const [cat, score] of Object.entries(scores) as Array<
    [Exclude<ExpenseCategory, 'other'>, number]
  >) {
    if (score > bestScore) {
      bestScore = score;
      bestCat = cat;
    }
  }

  // If drinks and food tie (e.g. café receipt with coffee), prefer 'drinks'
  if (scores.drinks > 0 && scores.drinks === scores.food && bestCat === 'food') {
    return 'drinks';
  }

  return bestScore > 0 ? bestCat : 'other';
}

const OCR_TAX_LINE_REGEX =
  /(?:porez|порез|pdv|пдв|osnovic|основиц|stopa|стопа|poresk|пореск|tax|vat|kusur|кусур|povrat|поврат)/i;

const OCR_SKIP_LINE_REGEX =
  /^(?:pdv|пдв|porez|порез|osnovica|основица|stopa|стопа|oznaka|ознака|gotovina|готовина|kartica|картица|platna|платна|ček|чек|kusur|кусур|povrat|поврат|pib|пиб|oib|jib|ibfm|pfr|пфр|brojač|бројач|broj računa|број рачуна|vreme|време|datum|датум|hvala|хвала|zahvaljujemo|fiskalni|фискални|račun|рачун|racun|artikli|артикли|naziv|назив|ukup|укуп|za uplatu|за уплату|svega|свега|total|iznos|износ|platiti|платити|jir|zki|esir|есир|kraj|крај|promet|промет|prodaja|продаја|kasir|касир|===|---)/i;

const OCR_MERCHANT_IGNORE_REGEX =
  /(?:fiskal|фискал|promet|промет|prodaj|продај|kasir|касир|esir|есир|pib|пиб|oib|jib|ibfm|pfr|пфр|brojac|бројач|vreme|време|datum|датум|artikl|артикл|naziv\s+cena|назив\s+цена|adresa|адреса|ulica|улица|bulevar|булевар|tel\.|тел\.|www\.|http|racun|рачун|račun)/i;

const OCR_CITY_LINE_REGEX =
  /^(?:\d{5}\s+)?(?:beograd|београд|novi sad|нови сад|ni[sš]|ниш|kragujevac|крагујевац|zagreb|split|sarajevo|podgorica|subotica|суботица|zrenjanin|зрењанин|pančevo|панчево|čačak|чачак)(?:\s*\([^)]+\))?$/i;

const OCR_TOTAL_LINE_REGEX =
  /(?:ukupan\s+iznos|укупан\s+износ|za\s+uplatu|за\s+уплату|ukupno|укупно|svega|свега|total|za\s+platiti|износ\s+за\s+уплату)/i;

const OCR_PAYMENT_LINE_REGEX =
  /(?:platna\s+kartica|платна\s+картица|kartica|картица|gotovina|готовина|placeno|плаћено|uplaceno|уплаћено)/i;

function cleanMerchantName(raw: string): string {
  // Strip leading POS location codes like "1029384-" or "012 - "
  let cleaned = raw
    .replace(/^\d{2,12}\s*[-–/:.]\s*/, '')
    .replace(/^[^A-Za-zČĆŽŠĐčćžšđА-Яа-яЉЊЂЋЏљњђћџ]+/, '')
    .replace(/\s+/g, ' ')
    .trim();

  // If the entire name is ALL CAPS (typical thermal printer), convert to readable Title Case
  const lettersOnly = cleaned.replace(/[^A-Za-zČĆŽŠĐčćžšđА-Яа-яЉЊЂЋЏљњђћџ]/g, '');
  if (lettersOnly.length >= 4 && lettersOnly === lettersOnly.toUpperCase()) {
    cleaned = cleaned
      .toLowerCase()
      .replace(/(^|\s|[-/"(])([a-zčćžšđа-шђјљњћџ])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase())
      .replace(/\b(Doo|D\.o\.o\.|Szr|Str|Sur|Pr)\b/gi, (m) => m.toUpperCase());
  }

  return cleaned || 'Fiskalni račun';
}

function extractReceiptNumberFromLine(line: string): number | null {
  const nums = line.match(/\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2}/g);
  if (!nums || nums.length === 0) return null;
  const val = parseSerbianNumber(nums[nums.length - 1]);
  return val && val > 0 ? val : null;
}

/**
 * Parses raw OCR text from ANY Balkan paper fiscal receipt (Serbia, Croatia, Bosnia, Montenegro, cafés, markets)
 * into structured items, merchant name, date, total amount (excluding VAT/PDV), and auto-detected category.
 */
export function parseOcrReceiptText(
  rawText: string,
  currency: CurrencyCode = 'RSD'
): ParsedFiscalReceipt {
  const cleanedText = rawText.replace(/\r\n/g, '\n');

  // 1. Try structured Serbian fiscal journal parser first
  const journal = parseJournalText(cleanedText);
  if (journal.items.length > 0) {
    const itemsSumMinor = journal.items.reduce((acc, it) => acc + majorToMinor(it.totalPrice), 0);
    const totalMinor = majorToMinor(journal.totalAmount ?? minorToMajor(itemsSumMinor));
    const diffMinor = totalMinor - itemsSumMinor;
    const merchantName = cleanMerchantName(journal.merchantName || 'Fiskalni račun');
    return {
      merchantName,
      date: journal.date || new Date().toISOString(),
      totalAmount: minorToMajor(totalMinor),
      currency,
      category: detectReceiptCategory(merchantName, journal.items, cleanedText),
      items: journal.items,
      itemsSum: minorToMajor(itemsSumMinor),
      discrepancyAmount: minorToMajor(diffMinor),
      hasDiscrepancy: Math.abs(diffMinor) > 0,
      source: 'ocr',
    };
  }

  const lines = cleanedText
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);

  // 2. Merchant name: first clean business/venue name near top (skipping PIB, fiscal headers, addresses)
  let merchantName = 'Fiskalni račun';
  for (const line of lines.slice(0, 12)) {
    if (line.length < 3 || line.length > 65) continue;
    if (/^\d[\d\s./:-]+$/.test(line)) continue;
    if (/^[-=*_#]{3,}$/.test(line)) continue;
    if (OCR_SKIP_LINE_REGEX.test(line)) continue;
    if (OCR_MERCHANT_IGNORE_REGEX.test(line)) continue;
    if (OCR_CITY_LINE_REGEX.test(line)) continue;
    if (OCR_TAX_LINE_REGEX.test(line)) continue;
    // Skip lines ending with a decimal price (item line)
    if (/\d+[.,]\d{2}\s*$/.test(line)) continue;
    // Skip lines that look like street addresses ending with a number (e.g. "Kralja Petra 45")
    if (/^[A-Za-zČĆŽŠĐčćžšđА-Яа-яЉЊЂЋЏљњђћџ\s.]+\s+\d{1,4}[a-zA-Z]?$/.test(line) && !/(?:bar|cafe|caffe|kafe|pub|pab|club|klub|24|365)/i.test(line)) {
      continue;
    }
    const candidate = cleanMerchantName(line);
    if (candidate.length >= 3) {
      merchantName = candidate;
      break;
    }
  }

  // 3. Date
  let date = new Date().toISOString();
  for (const line of lines) {
    if (/\d{1,2}\.\d{1,2}\.\d{4}/.test(line)) {
      date = parseSerbianDate(line);
      break;
    }
  }

  // 4. Total amount: scan for explicit grand total keywords, STRICTLY ignoring PDV/tax/osnovica/kusur lines!
  let detectedTotal: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (OCR_TAX_LINE_REGEX.test(line)) continue;
    if (!OCR_TOTAL_LINE_REGEX.test(line)) continue;

    let val = extractReceiptNumberFromLine(line);
    if (!val && i + 1 < lines.length && !OCR_TAX_LINE_REGEX.test(lines[i + 1])) {
      val = extractReceiptNumberFromLine(lines[i + 1]);
    }
    if (val && val > 0 && (detectedTotal === null || val > detectedTotal)) {
      detectedTotal = val;
    }
  }

  // 4b. Secondary fallback: if OCR mangled "Ukupan iznos", check payment line ("Kartica" / "Gotovina" - "Kusur")
  if (detectedTotal === null) {
    let paymentVal: number | null = null;
    let changeVal = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/(?:kusur|кусур|povrat|поврат)/i.test(line)) {
        const ch = extractReceiptNumberFromLine(line);
        if (ch && ch > 0) changeVal = ch;
        continue;
      }
      if (OCR_TAX_LINE_REGEX.test(line)) continue;
      if (OCR_PAYMENT_LINE_REGEX.test(line)) {
        const val = extractReceiptNumberFromLine(line);
        if (val && val > 0 && (paymentVal === null || val > paymentVal)) {
          paymentVal = val;
        }
      }
    }
    if (paymentVal !== null) {
      const net = Math.round((paymentVal - changeVal) * 100) / 100;
      if (net > 0) detectedTotal = net;
    }
  }

  // 5. Generic line-item extraction (stop before totals/tax section)
  const items: ParsedReceiptItem[] = [];
  let pendingName: string | null = null;

  const isFollowingPriceLine = (nextLine: string | undefined): boolean => {
    if (!nextLine) return false;
    return (
      /^(\d+(?:[.,]\d{1,3})?)\s*[xX*×]\s*(\d+(?:[.,]\d{1,3})*)\s*=?\s*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})$/.test(nextLine) ||
      /^(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})\s+(\d+(?:[.,]\d{1,3})?|[lI|])\s+(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})$/.test(nextLine) ||
      /^(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})\s+(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})$/.test(nextLine)
    );
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (OCR_TOTAL_LINE_REGEX.test(line) && !OCR_TAX_LINE_REGEX.test(line)) {
      pendingName = null;
      break; // Stop item parsing once we hit totals section
    }
    if (OCR_TAX_LINE_REGEX.test(line) || OCR_SKIP_LINE_REGEX.test(line) || /^[-=*_]{4,}$/.test(line)) {
      pendingName = null;
      continue;
    }

    // Pattern A1: "2 x 280,00 = 560,00" OR "280,00 x 2 = 560,00" on its own line following item name
    const multLine = line.match(
      /^(\d+(?:[.,]\d{1,3})?)\s*[xX*×]\s*(\d+(?:[.,]\d{1,3})*)\s*=?\s*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})$/
    );
    if (multLine && pendingName) {
      const n1 = parseSerbianNumber(multLine[1]) ?? 1;
      const n2 = parseSerbianNumber(multLine[2]) ?? 0;
      const total = parseSerbianNumber(multLine[3]);
      if (total && total > 0) {
        // Distinguish "2 x 280,00" from "280,00 x 2"
        const isFirstPrice = /[.,]\d{2}$/.test(multLine[1]) && !/[.,]\d{2}$/.test(multLine[2]);
        const qty = isFirstPrice ? n2 : n1;
        const unit = isFirstPrice ? n1 : n2;
        items.push({
          id: `item_${items.length + 1}`,
          name: cleanItemName(pendingName),
          quantity: qty > 0 ? qty : 1,
          unitPrice: unit > 0 ? unit : Math.round((total / (qty || 1)) * 100) / 100,
          totalPrice: Math.round(total * 100) / 100,
        });
      }
      pendingName = null;
      continue;
    }

    // Pattern A2: "280,00   2   560,00" (tolerates OCR reading "1" as "l", "I", or "|")
    const threeNumsLine = line.match(
      /^(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})\s+(\d+(?:[.,]\d{1,3})?|[lI|])\s+(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})$/
    );
    if (threeNumsLine && pendingName) {
      const unit = parseSerbianNumber(threeNumsLine[1]) ?? 0;
      const qtyRaw = /^[lI|]$/.test(threeNumsLine[2]) ? 1 : parseSerbianNumber(threeNumsLine[2]) ?? 1;
      const total = parseSerbianNumber(threeNumsLine[3]);
      if (total && total > 0) {
        items.push({
          id: `item_${items.length + 1}`,
          name: cleanItemName(pendingName),
          quantity: qtyRaw > 0 ? qtyRaw : 1,
          unitPrice: unit > 0 ? unit : Math.round((total / (qtyRaw || 1)) * 100) / 100,
          totalPrice: Math.round(total * 100) / 100,
        });
      }
      pendingName = null;
      continue;
    }

    // Pattern A3: "280,00   560,00" (OCR dropped thin "1" or "2" between unit price and total)
    const twoNumsLine = line.match(
      /^(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})\s+(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})$/
    );
    if (twoNumsLine && pendingName) {
      const unit = parseSerbianNumber(twoNumsLine[1]) ?? 0;
      const total = parseSerbianNumber(twoNumsLine[2]);
      if (unit > 0 && total && total >= unit) {
        const inferredQty = Math.max(1, Math.round(total / unit));
        items.push({
          id: `item_${items.length + 1}`,
          name: cleanItemName(pendingName),
          quantity: inferredQty,
          unitPrice: unit,
          totalPrice: Math.round(total * 100) / 100,
        });
        pendingName = null;
        continue;
      }
    }

    // Pattern B: Single-line "Item Name ... 560,00" (with optional "2x" prefix)
    // Skip if the very next line is a price/qty line (prevents "Koka Kola 0.25" from treating 0.25L as price!)
    const singleLine = !isFollowingPriceLine(lines[idx + 1])
      ? line.match(
          /^(?:(\d+)\s*[xX×]\s+)?([A-Za-zČĆŽŠĐčćžšđА-Яа-яЉЊЂЋЏљњђћџ][^0-9]*?.*?)\s+(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})(?:\s*(?:RSD|EUR|KM|BAM|€|DIN|Ђ|Đ|Е|E|А|A))?$/i
        )
      : null;
    if (singleLine) {
      const qty = singleLine[1] ? Number(singleLine[1]) : 1;
      const name = cleanItemName(singleLine[2]);
      const total = parseSerbianNumber(singleLine[3]);
      if (
        name.length >= 2 &&
        total &&
        total > 0 &&
        !OCR_SKIP_LINE_REGEX.test(name) &&
        !OCR_TAX_LINE_REGEX.test(name)
      ) {
        items.push({
          id: `item_${items.length + 1}`,
          name,
          quantity: qty > 0 ? qty : 1,
          unitPrice: Math.round((total / (qty || 1)) * 100) / 100,
          totalPrice: Math.round(total * 100) / 100,
        });
        pendingName = null;
        continue;
      }
    }

    // Otherwise, remember as candidate item name for next line if it contains letters
    if (
      /[A-Za-zČĆŽŠĐčćžšđА-Яа-яЉЊЂЋЏљњђћџ]{2,}/.test(line) &&
      line.length <= 60 &&
      !OCR_MERCHANT_IGNORE_REGEX.test(line)
    ) {
      pendingName = line;
    }
  }

  // Fallback: if OCR found totalAmount clearly but no line items were parsed cleanly, create 1 editable total item
  if (items.length === 0 && detectedTotal && detectedTotal > 0) {
    items.push({
      id: 'item_1',
      name: merchantName,
      quantity: 1,
      unitPrice: detectedTotal,
      totalPrice: detectedTotal,
    });
  }

  const itemsSumMinor = items.reduce((acc, it) => acc + majorToMinor(it.totalPrice), 0);
  const itemsSum = minorToMajor(itemsSumMinor);
  const totalAmount = detectedTotal ?? itemsSum;
  const totalMinor = majorToMinor(totalAmount);
  const diffMinor = totalMinor - itemsSumMinor;
  const category = detectReceiptCategory(merchantName, items, cleanedText);

  return {
    merchantName,
    date,
    totalAmount: minorToMajor(totalMinor),
    currency,
    category,
    items,
    itemsSum,
    discrepancyAmount: minorToMajor(diffMinor),
    hasDiscrepancy: Math.abs(diffMinor) > 0,
    source: 'ocr',
  };
}

/**
 * Splits a multi-quantity item (e.g. 3x Pivo = 960 RSD) into individual unit items (3 items of 1x = 320 RSD)
 * with exact integer remainder distribution so total price is never lost or inflated.
 */
export function splitItemIntoUnits(item: EditableReceiptItem): EditableReceiptItem[] {
  const count = Math.floor(item.quantity);
  if (count <= 1) return [item];

  const baseMinor = Math.floor(item.totalPriceMinor / count);
  const remainder = item.totalPriceMinor - baseMinor * count;

  return Array.from({ length: count }, (_, idx) => {
    const unitMinor = baseMinor + (idx < remainder ? 1 : 0);
    return {
      id: `${item.id}_u${idx + 1}`,
      name: `${item.name} (${idx + 1}/${count})`,
      quantity: 1,
      unitPriceMinor: unitMinor,
      totalPriceMinor: unitMinor,
      assignedMemberIds: [...item.assignedMemberIds],
    };
  });
}

/**
 * Calculates exact integer minor-unit shares per member from itemized assignments + optional tip.
 *
 * - Each assigned item's totalPriceMinor is divided equally among its assignedMemberIds (no lost paras).
 * - Tip can be distributed proportionally to each participant's subtotal (Largest Remainder / Hamilton Method)
 *   or equally across all participating members.
 */
export function calculateItemizedSplit(
  items: EditableReceiptItem[],
  tipMinor: number,
  tipMode: TipDistributionMode
): ItemizedSplitResult {
  const subtotals = new Map<string, number>();
  let assignedItemsTotalMinor = 0;
  let unassignedItemsTotalMinor = 0;

  for (const item of items) {
    if (item.totalPriceMinor <= 0) continue;
    const assignees = Array.from(new Set(item.assignedMemberIds));
    if (assignees.length === 0) {
      unassignedItemsTotalMinor += item.totalPriceMinor;
      continue;
    }

    assignedItemsTotalMinor += item.totalPriceMinor;
    const perItemShares = calculateEqualSplit(item.totalPriceMinor, assignees);
    for (const s of perItemShares) {
      subtotals.set(s.userId, (subtotals.get(s.userId) ?? 0) + s.shareAmountMinor);
    }
  }

  const participants = Array.from(subtotals.keys());
  const safeTipMinor = Math.max(0, Math.trunc(tipMinor));
  const finalMap = new Map<string, number>(subtotals);

  if (safeTipMinor > 0 && participants.length > 0) {
    if (tipMode === 'equal' || assignedItemsTotalMinor === 0) {
      const tipShares = calculateEqualSplit(safeTipMinor, participants);
      for (const ts of tipShares) {
        finalMap.set(ts.userId, (finalMap.get(ts.userId) ?? 0) + ts.shareAmountMinor);
      }
    } else {
      // Proportional tip allocation using exact BigInt Hamilton / Largest Remainder Method
      const tipBig = BigInt(safeTipMinor);
      const totalBig = BigInt(assignedItemsTotalMinor);

      const provisional = participants.map((userId, idx) => {
        const base = BigInt(subtotals.get(userId) ?? 0);
        const num = tipBig * base;
        return {
          userId,
          floorVal: Number(num / totalBig),
          remainder: Number(num % totalBig),
          idx,
        };
      });

      const allocated = provisional.reduce((acc, p) => acc + p.floorVal, 0);
      const leftover = safeTipMinor - allocated;
      const byRem = [...provisional].sort((a, b) =>
        b.remainder !== a.remainder ? b.remainder - a.remainder : a.idx - b.idx
      );

      for (let i = 0; i < leftover; i++) {
        byRem[i % byRem.length].floorVal += 1;
      }

      for (const p of provisional) {
        finalMap.set(p.userId, (finalMap.get(p.userId) ?? 0) + p.floorVal);
      }
    }
  }

  const shares: ShareAllocation[] = Array.from(finalMap.entries())
    .filter(([, amt]) => amt > 0)
    .map(([userId, shareAmountMinor]) => ({ userId, shareAmountMinor }));

  const sharesByUser: Record<string, number> = {};
  for (const s of shares) {
    sharesByUser[s.userId] = s.shareAmountMinor;
  }

  const allItemsTotalMinor = assignedItemsTotalMinor + unassignedItemsTotalMinor;
  const grandTotalMinor = allItemsTotalMinor + safeTipMinor;

  return {
    assignedItemsTotalMinor,
    unassignedItemsTotalMinor,
    allItemsTotalMinor,
    tipMinor: safeTipMinor,
    grandTotalMinor,
    shares,
    sharesByUser,
    allItemsAssigned: unassignedItemsTotalMinor === 0 && assignedItemsTotalMinor > 0,
  };
}

/**
 * Converts parsed receipt items into EditableReceiptItems.
 * Automatically splits integer quantities between 2 and 10 into individual rows
 * (e.g. "2x Kafa — 560 RSD" -> "Kafa #1 — 280 RSD", "Kafa #2 — 280 RSD")
 * while keeping weighted/decimal items (e.g. "0.450 kg") as a single shareable row.
 */
export function buildEditableReceiptItems(
  rawItems: ParsedReceiptItem[],
  preAssignMemberIds: string[] = []
): EditableReceiptItem[] {
  const result: EditableReceiptItem[] = [];

  for (const it of rawItems) {
    const baseItem: EditableReceiptItem = {
      id: it.id,
      name: it.name,
      quantity: it.quantity,
      unitPriceMinor: majorToMinor(it.unitPrice),
      totalPriceMinor: majorToMinor(it.totalPrice),
      assignedMemberIds: [],
    };

    const isSmallIntegerQty =
      Number.isInteger(it.quantity) && it.quantity >= 2 && it.quantity <= 10;

    if (isSmallIntegerQty) {
      result.push(...splitItemIntoUnits(baseItem));
    } else {
      result.push(baseItem);
    }
  }

  // If the receipt has only 1 row total, pre-assign everyone for instant equal split
  if (result.length === 1 && preAssignMemberIds.length > 0) {
    result[0] = { ...result[0], assignedMemberIds: [...preAssignMemberIds] };
  }

  return result;
}
