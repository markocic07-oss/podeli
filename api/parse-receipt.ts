import {
  extractSpecificationParams,
  isValidSerbianFiscalUrl,
  normalizeSerbianFiscalUrl,
  parseFiscalHtml,
  parseSpecificationsJson,
  type ParsedReceiptItem,
} from '../src/utils/fiscalReceipt';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Accept-Language': 'sr-RS,sr;q=0.9,en;q=0.5',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function extractCookieHeader(headers: Headers): string {
  // Prefer getSetCookie() (Node 20+ / Undici) so commas inside Expires= dates are never split
  const maybeGetSetCookie = (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof maybeGetSetCookie === 'function') {
    const cookies = maybeGetSetCookie.call(headers);
    return cookies
      .map((c) => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');
  }
  const raw = headers.get('set-cookie') ?? '';
  if (!raw) return '';
  // Split only on comma followed by a cookie name=value (not weekday commas like "Wed, 25 Nov")
  return raw
    .split(/,(?=\s*[A-Za-z0-9_.-]+=)/)
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

export async function POST(request: Request): Promise<Response> {
  let rawUrl = '';
  try {
    const body = (await request.json()) as { url?: unknown };
    rawUrl = typeof body?.url === 'string' ? body.url.trim() : '';
  } catch {
    return jsonResponse(
      { error: 'INVALID_BODY', reason: 'Neispravan JSON zahtev.' },
      400
    );
  }

  // Normalize http://suf.purs.gov.rs -> https:// and enforce strict SSRF protection
  rawUrl = normalizeSerbianFiscalUrl(rawUrl);
  if (!isValidSerbianFiscalUrl(rawUrl)) {
    return jsonResponse(
      {
        error: 'INVALID_FISCAL_URL',
        reason: 'URL mora pripadati zvaničnom domenu https://suf.purs.gov.rs/.',
      },
      400
    );
  }

  try {
    const pageRes = await fetch(rawUrl, {
      method: 'GET',
      headers: HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });

    // Verify final redirected URL is still on suf.purs.gov.rs
    if (pageRes.url && !isValidSerbianFiscalUrl(pageRes.url)) {
      return jsonResponse(
        {
          error: 'INVALID_FISCAL_URL',
          reason: 'Redirekcija je vodila van suf.purs.gov.rs domena.',
        },
        400
      );
    }

    if (!pageRes.ok) {
      return jsonResponse(
        {
          error: 'PURS_HTTP_ERROR',
          status: pageRes.status,
          reason: `Portal Poreske uprave je vratio HTTP status ${pageRes.status}.`,
        },
        502
      );
    }

    const html = await pageRes.text();
    if (!html || html.length < 100) {
      return jsonResponse(
        {
          error: 'EMPTY_HTML',
          reason: 'Portal Poreske uprave je vratio prazan HTML odgovor.',
        },
        422
      );
    }

    // Method A (Primary): Official JSON specification via POST https://suf.purs.gov.rs/specifications
    let specItems: ParsedReceiptItem[] | undefined;
    let specDiagnostic = 'no_token';
    const specParams = extractSpecificationParams(html);

    if (specParams) {
      try {
        const cookieHeader = extractCookieHeader(pageRes.headers);
        const formBody = new URLSearchParams({
          invoiceNumber: specParams.invoiceNumber,
          token: specParams.token,
        });

        const specRes = await fetch('https://suf.purs.gov.rs/specifications', {
          method: 'POST',
          headers: {
            ...HEADERS,
            Accept: 'application/json, text/javascript, */*; q=0.01',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            Origin: 'https://suf.purs.gov.rs',
            Referer: pageRes.url || rawUrl,
            ...(cookieHeader ? { Cookie: cookieHeader } : {}),
          },
          body: formBody.toString(),
          signal: AbortSignal.timeout(8000),
        });

        if (specRes.ok) {
          const specJson = (await specRes.json()) as unknown;
          const parsed = parseSpecificationsJson(specJson);
          if (parsed.length > 0) {
            specItems = parsed;
            specDiagnostic = 'ok';
          } else {
            specDiagnostic = 'empty_json_items';
          }
        } else {
          specDiagnostic = `spec_http_${specRes.status}`;
        }
      } catch (specErr) {
        specDiagnostic = `spec_fetch_error:${specErr instanceof Error ? specErr.message : 'unknown'}`;
      }
    }

    // Method B (Fallback): HTML table or <pre> journal (Cyrillic + Latin) + metadata
    const parsedReceipt = parseFiscalHtml(html, specItems);

    // If no line items were found at all, still return 1 total item when totalAmount > 0 so user never re-types total
    if (parsedReceipt.items.length === 0 && parsedReceipt.totalAmount > 0) {
      parsedReceipt.items = [
        {
          id: 'item_1',
          name: parsedReceipt.merchantName || 'Fiskalni račun',
          quantity: 1,
          unitPrice: parsedReceipt.totalAmount,
          totalPrice: parsedReceipt.totalAmount,
        },
      ];
      parsedReceipt.itemsSum = parsedReceipt.totalAmount;
      parsedReceipt.discrepancyAmount = 0;
      parsedReceipt.hasDiscrepancy = false;
    }

    if (parsedReceipt.items.length === 0 && parsedReceipt.totalAmount <= 0) {
      return jsonResponse(
        {
          error: 'RECEIPT_UNREADABLE',
          reason: `Nije pronađen ni iznos ni spisak artikala na stranici (${specDiagnostic}).`,
          diagnostic: specDiagnostic,
        },
        422
      );
    }

    return jsonResponse(parsedReceipt, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error';
    console.error('Error fetching Serbian fiscal receipt:', err);
    return jsonResponse(
      {
        error: 'FETCH_FAILED',
        reason: `Neuspešno povezivanje sa suf.purs.gov.rs (${message}).`,
      },
      502
    );
  }
}
