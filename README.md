# PODELI – Zajednički troškovi, bez komplikacija.

Kompletna aplikacija za deljenje zajedničkih troškova i poravnanje dugovanja namenjena korisnicima u Srbiji, Hrvatskoj i Bosni i Hercegovini.

## Funkcionalnosti

- **Autentifikacija (Supabase Auth)**: Registracija, prijava, odjava, zaboravljena lozinka, resetovanje lozinke, verifikacija email adrese, onboarding i otpremanje profilne fotografije.
- **Višejezičnost (i18next)**: Potpuni prevodi na **Srpski (SR)** (podrazumevano), **Hrvatski (HR)** i **Bosanski (BS)**.
- **Regionalne valute i formatiranje**: `RSD`, `EUR` i `BAM` sa `Intl.NumberFormat`, uz strogo razdvajanje valuta po grupama (nikada ne meša različite valute u istoj grupi).
- **Tačna finansijska matematika**: Svi novčani iznosi čuvaju se i računaju u celobrojnim manjim jedinicama (para / cent / fening), bez floating-point grešaka, uz determinističko zaokruživanje i Hamilton metod za procentualnu podelu.
- **Dodavanje troškova**: Jednaka podela, podela po iznosu, procentualna podela, nejednako učešće članova, isključivanje platiše iz podele, fotografija računa, izmena i brisanje uz automatsko preračunavanje stanja.
- **Optimizacija poravnanja**: Automatski algoritam koji minimizuje broj potrebnih uplata, uz workflow potvrde (`Na čekanju` → `Potvrđeno` / `Odbijeno` / `Otkazano`) i zaštitu od dvostruke potvrde.
- **Grupe i pozivni linkovi**: Kreiranje grupa, kategorije, bezbedni deljivi pozivni linkovi (`/join/:token`) sa deljenjem na WhatsApp, Viber i nativni Share, kao i poništavanjem tokena.
- **Demo režim**: Izolovani demo režim sa primerima (`Petak u gradu`, `Letovanje Grčka`, `Vikend u Sarajevu`) bez mešanja sa stvarnim korisničkim podacima.

## Pokretanje lokalno

```bash
npm install
cp .env.example .env
npm run dev
```

## Konfiguracija Supabase baze

1. Kreiraj novi projekat na [Supabase](https://supabase.com).
2. U SQL Editoru ili preko Supabase CLI pokreni migracije redosledom:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_rls_and_functions.sql`
   - `supabase/migrations/003_storage_buckets.sql`
3. Popuni `.env` fajl:
   ```env
   VITE_SUPABASE_URL=https://tvoj-projekat.supabase.co
   VITE_SUPABASE_ANON_KEY=tvoj-javni-anon-kljuc
   ```
   *(Nikada ne koristi `service_role` ključ u frontend kodu!)*

## Testovi i build

```bash
npm run typecheck
npm test
npm run build
```
