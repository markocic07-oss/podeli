export type ReminderTone = 'polite' | 'friendly' | 'urgent_joke';

export interface ReminderMessageParams {
  tone: ReminderTone;
  variantIndex: number;
  debtorName: string;
  amountFormatted: string;
  groupName: string;
  shareUrl: string;
  bankAccountFormatted?: string | null;
  includeBankAccount?: boolean;
}

const TEMPLATES: Record<ReminderTone, string[]> = {
  polite: [
    'Hej {duznik}, samo mali podsetnik za {grupa} — tvoj deo je {iznos}.{racunLine} Ovde imaš obračun i QR kod za brzo plaćanje: {link}',
    'Ćao {duznik}, šaljem ti obračun za {grupa}. Ostalo je još {iznos}.{racunLine} Sve je spremno na linku (ima i IPS QR): {link}',
    'Pozdrav {duznik}, kad stigneš baci pogled na {grupa} — ostalo je {iznos} za poravnanje.{racunLine} Link sa obračunom i QR kodom: {link}',
    'Hej {duznik}, podsetnik za zajedničke troškove ({grupa}) — tvoj udeo je {iznos}.{racunLine} Možeš brzo da rešiš preko linka: {link}',
  ],
  friendly: [
    'Brate {duznik}, inflacija mi jede onih {iznos} za {grupa} 😅{racunLine} Skeniraj QR na linku za 5 sekundi da zatvorimo: {link}',
    'Ej {duznik}, aplikacija kaže da mi duguješ {iznos} za {grupa} (nisam ja, matematika je 😂).{racunLine} Evo linka sa QR kodom: {link}',
    '{duznik}, ajde da rešimo onih {iznos} za {grupa} pre nego što zaboravimo gde smo uopšte bili 😅{racunLine} Link + QR: {link}',
    'Ćao {duznik}, moj novčanik šalje pozdrave za {grupa} — fali mu tačno {iznos} 😄{racunLine} Ovde ti je sve spremno za 5 sekundi: {link}',
  ],
  urgent_joke: [
    '{duznik}, banka me pita gde je onih {iznos} za {grupa} 👀{racunLine} Reši za 5 sekundi preko IPS QR koda ovde: {link}',
    'Poslednji poziv za ukrcavanje za {duznik}: {iznos} za {grupa} 🚀{racunLine} Klikni i skeniraj QR: {link}',
    'Uzbuna {duznik}! 🚨 Ostalo je još {iznos} za {grupa} da svi budemo na nuli.{racunLine} Klikni na link i skeniraj QR da ugasimo alarm: {link}',
    '{duznik}, još samo tvojih {iznos} za {grupa} i zatvaramo knjige 📚😂{racunLine} Najbrže preko QR koda na linku: {link}',
  ],
};

export function getReminderVariantCount(tone: ReminderTone): number {
  return TEMPLATES[tone].length;
}

export function buildReminderMessage(params: ReminderMessageParams): string {
  const list = TEMPLATES[params.tone];
  const safeIndex = ((params.variantIndex % list.length) + list.length) % list.length;
  const template = list[safeIndex];

  const racunLine =
    params.includeBankAccount && params.bankAccountFormatted
      ? ` Račun: ${params.bankAccountFormatted}.`
      : '';

  return template
    .replace(/\{duznik\}/g, params.debtorName.trim() || 'druže')
    .replace(/\{iznos\}/g, params.amountFormatted.trim())
    .replace(/\{grupa\}/g, params.groupName.trim())
    .replace(/\{racunLine\}/g, racunLine)
    .replace(/\{link\}/g, params.shareUrl.trim())
    .replace(/ {2,}/g, ' ')
    .trim();
}

export function buildWhatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function buildViberShareUrl(message: string): string {
  return `viber://forward?text=${encodeURIComponent(message)}`;
}
