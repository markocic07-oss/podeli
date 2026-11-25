import { describe, expect, it } from 'vitest';
import {
  calculateItemizedSplit,
  detectReceiptCategory,
  extractSpecificationParams,
  isValidSerbianFiscalUrl,
  normalizeSerbianFiscalUrl,
  parseFiscalHtml,
  parseOcrReceiptText,
  parseSerbianNumber,
  parseSpecificationsJson,
  splitItemIntoUnits,
} from './fiscalReceipt';

describe('Serbian eFiskalizacija Parser & Itemized Split', () => {
  it('strictly validates suf.purs.gov.rs URLs and blocks SSRF attempts', () => {
    expect(isValidSerbianFiscalUrl('https://suf.purs.gov.rs/v/?vl=abc123')).toBe(true);
    expect(isValidSerbianFiscalUrl('http://suf.purs.gov.rs/v/?vl=abc123')).toBe(false);
    expect(isValidSerbianFiscalUrl('https://evil.suf.purs.gov.rs/v/?vl=abc')).toBe(false);
    expect(isValidSerbianFiscalUrl('https://suf.purs.gov.rs.evil.com/v/?vl=abc')).toBe(false);
    expect(isValidSerbianFiscalUrl('https://127.0.0.1/admin')).toBe(false);
    expect(isValidSerbianFiscalUrl('https://user:pass@suf.purs.gov.rs/v/?vl=abc')).toBe(false);
    expect(isValidSerbianFiscalUrl('not-a-url')).toBe(false);
  });

  it('converts Serbian number formats accurately into JS numbers', () => {
    expect(parseSerbianNumber('1.250,50')).toBe(1250.5);
    expect(parseSerbianNumber('4.250,00')).toBe(4250);
    expect(parseSerbianNumber('280,00')).toBe(280);
    expect(parseSerbianNumber('2,000')).toBe(2);
    expect(parseSerbianNumber('0,330')).toBe(0.33);
    expect(parseSerbianNumber('12.345.678,90')).toBe(12345678.9);
  });

  it('parses Cyrillic Serbian eFiskalizacija <pre> journal HTML cleanly', () => {
    const mockHtml = `
      <html>
        <body>
          <span id="shopFullNameLabel">Kafeterija Dorćol DOO</span>
          <span id="totalAmountLabel">1.560,00</span>
          <span id="sdcDateTimeLabel">23.11.2026. 14:25:10</span>
          <pre>
============ ФИСКАЛНИ РАЧУН ============
109876543
КАФЕТЕРИЈА ДОРЋОЛ ДОО
Краља Петра 45, Београд
Артикли
========================================
Назив   Цена         Кол.         Укупно
Espreso sa mlekom (Ђ)
        280,00         2          560,00
Burger Classic
sa pomfritom (Ђ)
      1.000,00         1        1.000,00
----------------------------------------
Укупан износ:                   1.560,00
ПФР време:      23.11.2026. 14:25:10
          </pre>
        </body>
      </html>
    `;

    const parsed = parseFiscalHtml(mockHtml);
    expect(parsed.merchantName).toBe('Kafeterija Dorćol DOO');
    expect(parsed.currency).toBe('RSD');
    expect(parsed.totalAmount).toBe(1560);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]).toMatchObject({
      name: 'Espreso sa mlekom',
      quantity: 2,
      unitPrice: 280,
      totalPrice: 560,
    });
    expect(parsed.items[1]).toMatchObject({
      name: 'Burger Classic sa pomfritom',
      quantity: 1,
      unitPrice: 1000,
      totalPrice: 1000,
    });
    expect(parsed.hasDiscrepancy).toBe(false);
    expect(parsed.discrepancyAmount).toBe(0);
  });

  it('extracts /specifications params and prioritizes structured JSON items', () => {
    const htmlWithToken = `
      <script>
        viewModel.InvoiceNumber('ABC123-DEF456-789');
        viewModel.Token('a1b2c3d4e5f6g7h8i9j0k1l2m3n4');
      </script>
      <span id="shopFullNameLabel">Restoran Skadarlija</span>
      <span id="totalAmountLabel">880,00</span>
    `;
    const params = extractSpecificationParams(htmlWithToken);
    expect(params).toEqual({
      invoiceNumber: 'ABC123-DEF456-789',
      token: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4',
    });

    const specItems = parseSpecificationsJson({
      success: true,
      items: [
        { name: 'Koka Kola (Ђ)', quantity: 2, unitPrice: 320, total: 640 },
        { name: 'Kisela voda (Ђ)', quantity: 1, unitPrice: 240, total: 240 },
      ],
    });
    const parsed = parseFiscalHtml(htmlWithToken, specItems);
    expect(parsed.source).toBe('specifications');
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0].name).toBe('Koka Kola');
    expect(parsed.hasDiscrepancy).toBe(false);
  });

  it('splits multi-quantity items into exact integer units without losing a single para', () => {
    const units = splitItemIntoUnits({
      id: 'item_2',
      name: 'Pivo',
      quantity: 3,
      unitPriceMinor: 333,
      totalPriceMinor: 1000, // 10,00 RSD / 3 -> 334, 333, 333
      assignedMemberIds: [],
    });
    expect(units).toHaveLength(3);
    expect(units.map((u) => u.totalPriceMinor)).toEqual([334, 333, 333]);
    expect(units.reduce((a, b) => a + b.totalPriceMinor, 0)).toBe(1000);
  });

  it('calculates itemized split with shared items and proportional/equal tip accurately', () => {
    const items = [
      // Marko's burger: 1.000 RSD
      { id: 'i1', name: 'Burger', quantity: 1, unitPriceMinor: 100000, totalPriceMinor: 100000, assignedMemberIds: ['marko'] },
      // Ana's salad: 500 RSD
      { id: 'i2', name: 'Salata', quantity: 1, unitPriceMinor: 50000, totalPriceMinor: 50000, assignedMemberIds: ['ana'] },
      // Shared fries: 500 RSD -> 250 each
      { id: 'i3', name: 'Pomfrit', quantity: 1, unitPriceMinor: 50000, totalPriceMinor: 50000, assignedMemberIds: ['marko', 'ana'] },
    ];
    // Marko subtotal = 1.250 RSD (62.5%), Ana subtotal = 750 RSD (37.5%), total = 2.000 RSD
    // Proportional 10% tip = 200 RSD -> Marko +125 RSD = 1.375 RSD, Ana +75 RSD = 825 RSD
    const prop = calculateItemizedSplit(items, 20000, 'proportional');
    expect(prop.allItemsAssigned).toBe(true);
    expect(prop.sharesByUser.marko).toBe(137500);
    expect(prop.sharesByUser.ana).toBe(82500);
    expect(prop.shares.reduce((a, b) => a + b.shareAmountMinor, 0)).toBe(220000);

    // Equal 200 RSD tip -> Marko +100 = 1.350 RSD, Ana +100 = 850 RSD
    const eq = calculateItemizedSplit(items, 20000, 'equal');
    expect(eq.sharesByUser.marko).toBe(135000);
    expect(eq.sharesByUser.ana).toBe(85000);
    expect(eq.shares.reduce((a, b) => a + b.shareAmountMinor, 0)).toBe(220000);
  });

  it('normalizes http suf.purs.gov.rs URLs to https', () => {
    expect(normalizeSerbianFiscalUrl('http://suf.purs.gov.rs/v/?vl=xyz')).toBe(
      'https://suf.purs.gov.rs/v/?vl=xyz'
    );
    expect(normalizeSerbianFiscalUrl('https://suf.purs.gov.rs/v/?vl=xyz')).toBe(
      'https://suf.purs.gov.rs/v/?vl=xyz'
    );
  });

  it('parses generic Balkan paper receipts via OCR text into items and total', () => {
    const ocrText = `
      KONOBA STARI GRAD
      Datum: 23.11.2026 20:15
      -------------------------
      Cevapi 10 kom       850,00
      Sopska salata       420,00
      Toceno pivo 0.5
      350,00   2   700,00
      -------------------------
      UKUPNO:           1.970,00
      Gotovina:         2.000,00
      Kusur:               30,00
    `;
    const parsed = parseOcrReceiptText(ocrText, 'RSD');
    expect(parsed).not.toBeNull();
    expect(parsed!.source).toBe('ocr');
    expect(parsed!.merchantName).toBe('Konoba Stari Grad');
    expect(parsed!.totalAmount).toBe(1970);
    expect(parsed!.items.length).toBe(3);
    expect(parsed!.items[0]).toMatchObject({ name: 'Cevapi 10 kom', totalPrice: 850 });
    expect(parsed!.items[1]).toMatchObject({ name: 'Sopska salata', totalPrice: 420 });
    expect(parsed!.items[2]).toMatchObject({ name: 'Toceno pivo 0.5', quantity: 2, totalPrice: 700 });
    expect(parsed!.hasDiscrepancy).toBe(false);
    expect(parsed!.category).toBe('food');
  });

  it('ignores PDV / tax totals and extracts true grand total, clean merchant, and drinks category for coffee receipts', () => {
    const serbianCafeOcr = `
      ============ ФИСКАЛНИ РАЧУН ============
      109876543
      10421-CAFFE BAR KAFETERIJA DOO
      Кнез Михаилова 12
      Београд (Стари Град)
      ПРОМЕТ ПРОДАЈА
      ----------------------------------------
      Еспресо са млеком (Ђ)
      280,00   2   560,00
      ----------------------------------------
      Укупан износ:                     560,00
      Платна картица:                   560,00
      Ознака   Име   Стопа   Порез
      Ђ        ПДВ   20,00%  93,33
      Укупан износ пореза:               93,33
    `;
    const parsed = parseOcrReceiptText(serbianCafeOcr, 'RSD');
    expect(parsed.totalAmount).toBe(560);
    expect(parsed.merchantName).toBe('Caffe Bar Kafeterija DOO');
    expect(parsed.category).toBe('drinks');
  });

  it('never returns PDV amount when Ukupan iznos label is unreadable and falls back to payment line', () => {
    const mangledTotalOcr = `
      CAFFE MARINA
      Domaca kafa
      Płatna kartica: 480,00
      PDV 20%: 80,00
      Ukupan iznos poreza: 80,00
    `;
    // Simulate Serbian Latin payment line without typo
    const cleanPaymentOcr = mangledTotalOcr.replace('Płatna', 'Platna');
    const parsed = parseOcrReceiptText(cleanPaymentOcr, 'RSD');
    expect(parsed.totalAmount).toBe(480);
    expect(parsed.merchantName).toBe('Caffe Marina');
    expect(parsed.category).toBe('drinks');
  });

  it('detects expense categories accurately across drinks, groceries, and transport', () => {
    expect(detectReceiptCategory('Kafeterija', [{ id: '1', name: 'Kapucino', quantity: 1, unitPrice: 300, totalPrice: 300 }])).toBe('drinks');
    expect(detectReceiptCategory('MEGA MAXI', [{ id: '1', name: 'Mleko 1L', quantity: 1, unitPrice: 150, totalPrice: 150 }])).toBe('groceries');
    expect(detectReceiptCategory('NIS Petrol', [{ id: '1', name: 'Evro dizel', quantity: 1, unitPrice: 5000, totalPrice: 5000 }])).toBe('transport');
  });

  it('falls back to a single editable total item when OCR only reads the total', () => {
    const crumpledOcr = `
      MAXI MARKET
      *** necitljivo ***
      ZA UPLATU: 24,50 EUR
    `;
    const parsed = parseOcrReceiptText(crumpledOcr, 'EUR');
    expect(parsed).not.toBeNull();
    expect(parsed!.currency).toBe('EUR');
    expect(parsed!.totalAmount).toBe(24.5);
    expect(parsed!.items).toHaveLength(1);
    expect(parsed!.items[0].totalPrice).toBe(24.5);
  });

  it('extracts café items even when OCR misreads "1" as "l" or drops quantity between unit & total', () => {
    const noisyCafe = `
      CAFFE BAR PARK
      Domaca kafa
      250,00  500,00
      Koka Kola 0.25
      280,00  l  280,00
      Ukupan iznos: 780,00
    `;
    const parsed = parseOcrReceiptText(noisyCafe, 'RSD');
    expect(parsed.totalAmount).toBe(780);
    expect(parsed.category).toBe('drinks');
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]).toMatchObject({ name: 'Domaca kafa', quantity: 2, unitPrice: 250, totalPrice: 500 });
    expect(parsed.items[1]).toMatchObject({ name: 'Koka Kola 0.25', quantity: 1, unitPrice: 280, totalPrice: 280 });
  });
});
