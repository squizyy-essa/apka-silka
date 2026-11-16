# Postęp projektu – Training Planner

Ten plik jest pamięcią projektu między sesjami pracy. **Na początku każdej nowej sesji przeczytaj
go w całości, potem `docs/ARCHITECTURE.md`, i dopiero wtedy zmieniaj kod.** Po każdej fazie
zaktualizuj wszystkie sekcje.

Ostatnia aktualizacja: 2026-11-16 (koniec fazy 1).

## Jak wznowić pracę

1. Wymagania są w specyfikacji „MASTER PROMPT: TRAINING PLANNER PWA” (trzyma ją właściciel
   projektu – poproś o wklejenie, jeśli nie ma jej w rozmowie). Streszczenie decyzji i plan faz:
   `docs/ARCHITECTURE.md`.
2. `npm install`, potem `npm run check` i `npm run test:e2e` – wszystko musi być zielone, zanim
   zaczniesz cokolwiek zmieniać.
3. Następna faza do zrobienia: **faza 2 – biblioteka ćwiczeń** (lista zadań niżej).
4. Zasady, których nie wolno łamać: żadnych makiet ani fikcyjnych danych; widoczna kontrolka =
   działająca funkcja; zapis do IndexedDB, nie do stanu komponentu; wydanej wersji schematu bazy
   się nie edytuje (nowa wersja + migracja); funkcja jest „ukończona” dopiero po testach.

## Ukończone fazy

### Faza 1 – Fundament ✅ (2026-11-16)

Kryterium: „aplikacja uruchamia się i potrafi trwale zapisać oraz odczytać dane” – spełnione
i potwierdzone testami w prawdziwej przeglądarce.

Co rzeczywiście działa:

- **Projekt i narzędzia:** Vite 8, React 19, TypeScript 6 strict, Tailwind 4, ESLint (strict,
  type-checked, jsx-a11y), Vitest + Testing Library, Playwright. Workflow GitHub Actions
  (sprawdzenie + publikacja na GitHub Pages).
- **Routing:** 5 sekcji (Pulpit, Plany, Trening, Historia i statystyki, Ustawienia), ekran
  „nie znaleziono”, ekran błędu. Działa przycisk Wstecz, linki bezpośrednie i odświeżenie.
- **Layout responsywny:** dolny pasek < 1024 px, sidebar ≥ 1024 px; brak poziomego przewijania
  przy 320/375/768/1024/1440 px; wszystkie elementy klikalne ≥ 44 × 44 px; obsługa klawiatury;
  marginesy bezpieczne iPhone’a.
- **Design tokens i motywy:** 3 style (Minimal, Performance, Pro Athlete) × 2 motywy (jasny,
  ciemny) + opcja „Systemowy” śledząca ustawienie urządzenia na żywo. Zmiana natychmiastowa,
  zapisywana w IndexedDB, przywracana po odświeżeniu bez mignięcia, widoczna od razu w drugiej
  otwartej karcie. Kontrast tekstu WCAG AA pilnowany testem dla wszystkich 6 kombinacji.
- **Baza IndexedDB (Dexie):** schemat v1 ze wszystkimi encjami z §17 specyfikacji; mechanizm
  wersjonowania i migracji (dane przeżywają migrację; nieudana migracja jest wycofywana);
  ochrona przed otwarciem nowszych danych starszym kodem; obsługa migracji w drugiej karcie.
- **Modele domenowe z walidacją Zod** dla wszystkich encji (reguły §18).
- **Repozytoria:** kontrakty niezależne od Dexie, repozytorium ustawień, generyczne repozytorium
  CRUD z walidacją; błędy zamieniane na `StorageError` z komunikatem po polsku.
- **Obsługa błędów:** brak dostępu do bazy przy starcie → czytelny ekran z „Spróbuj ponownie”;
  nieudany zapis ustawienia → komunikat, a ekran dalej pokazuje stan faktyczny.

Czego **nie ma** (ekrany mówią o tym wprost i nie mają żadnych kontrolek):

- Pulpit, Plany, Trening, Historia – tylko informacja „moduł nie jest jeszcze wdrożony”.
- W Ustawieniach działa tylko sekcja Wygląd; timer, przypomnienia i backup – faza 7.
- Tabele bazy poza `appSettings` istnieją, ale aplikacja jeszcze nic do nich nie zapisuje
  (zapis/odczyt/migracja tych tabel są sprawdzone tylko w testach).
- PWA (manifest, ikony, service worker, instalacja) – faza 8.

## Wyniki testów (2026-11-16, koniec fazy 1)

| Sprawdzenie | Polecenie | Wynik |
|---|---|---|
| TypeScript strict | `npm run typecheck` | 0 błędów |
| ESLint | `npm run lint` | 0 błędów, 0 ostrzeżeń |
| Testy jednostkowe i komponentowe | `npm test` | 90 / 90 (6 plików) |
| Build produkcyjny | `npm run build` | OK – JS 590 kB (185 kB gzip), CSS 22 kB (5,5 kB gzip) |
| Testy e2e (Chrome, build produkcyjny) | `npm run test:e2e` | 13 / 13 |
| Build pod podścieżką (jak GitHub Pages) | ręcznie | działa, zapis ustawień OK, 0 błędów konsoli |

Zakres testów: walidacja domenowa (§18), tworzenie tabel, trwałość po ponownym otwarciu bazy,
migracja z zachowaniem danych, wycofanie nieudanej migracji, odmowa otwarcia nowszej bazy,
repozytoria (w tym start w dwóch kartach naraz, naprawa częściowo uszkodzonego rekordu),
mapowanie błędów, logika motywu, kompletność i kontrast tokenów, cała aplikacja (nawigacja,
tytuły, ustawienia, restart, druga karta, błędy zapisu i startu). E2E: test akceptacyjny H
(w zakresie ustawień) i J, nawigacja/Wstecz/linki, synchronizacja kart, motyw systemowy,
klawiatura, brak mignięcia motywu, brak błędów w konsoli.

Dodatkowo sprawdzone ręcznie: celowe zepsucie zapisu ustawień powoduje, że 4 testy nie przechodzą
(testy naprawdę pilnują trwałości).

Niesprawdzone: prawdziwy iPhone / Safari (testy e2e działają w Chrome); workflow GitHub Actions
(pierwsze uruchomienie nastąpi po pushu).

## Decyzje architektoniczne

Uzasadnienia w `docs/ARCHITECTURE.md` (§2 „Odstępstwa”).

1. Hash router (`/#/plany`) – wymóg GitHub Pages; build niezależny od adresu (`base: './'`).
2. Komponenty własne w konwencji shadcn/ui na Radix (bez CLI shadcn).
3. TypeScript 6.0 i ESLint 9 (ograniczenia wtyczek).
4. Tekst pomocniczy `#5C6577` zamiast `#727B8C` (kontrast WCAG AA).
5. Schematy Zod są jedynym źródłem typów domenowych.
6. Ekrany znają tylko interfejsy repozytoriów (przygotowanie pod synchronizację).
7. Stan UI zmienia się dopiero po udanym zapisie do bazy.
8. Ścieżki ekranów po polsku: `/plany`, `/trening`, `/historia`, `/ustawienia`.
9. Biblioteki ze specyfikacji instalowane w fazie, która ich używa.
10. Domyślne ustawienia: motyw jasny, styl Minimal, widok tabeli, przerwa 90 s, dźwięk włączony
    (głośność 0,8), przypomnienia wyłączone.
11. Pulpit (§4) budowany w fazach 4 i 6 (specyfikacja nie przypisała go do fazy).
12. Typy pomiaru ćwiczenia: `weight_reps`, `bodyweight_reps`, `duration`, `distance`.

## Znane problemy i ograniczenia

- Paczka JS ma 590 kB (185 kB gzip) i Vite ostrzega o rozmiarze. Do zrobienia w fazie 8 (wcześniej,
  jeśli zacznie przeszkadzać): ładowanie ekranów na żądanie.
- `npm audit`: 7 zgłoszeń „moderate”, wszystkie w narzędziach deweloperskich (minimatch
  w typescript-eslint); nie trafiają do aplikacji.
- Test klawiatury w e2e przytrzymuje strzałkę (`down`/`up`), bo grupa radio Radix wybiera opcję
  przy fokusie tylko wtedy, gdy klawisz jest wciśnięty; błyskawiczne syntetyczne naciśnięcie
  byłoby pominięte. Prawdziwej klawiatury to nie dotyczy.
- iOS: osobne dane dla Safari i aplikacji z ekranu początkowego; możliwe czyszczenie danych
  nieużywanej strony w Safari. Do zaadresowania w fazach 7–8 (backup, instalacja, trwałe
  przechowywanie).

## Kolejne zadania

### Faza 2 – Biblioteka ćwiczeń (następna)

- [ ] Moduł `src/exercises/`: repozytorium ćwiczeń (wyszukiwanie po nazwie, filtry: partia,
      sprzęt, kategoria; ostatnio używane).
- [ ] Zdecydować o polu „kategoria” (§6.1 wymienia je, §17 nie) → jeśli osobne pole, schemat v2
      z migracją.
- [ ] Początkowa biblioteka podstawowych ćwiczeń siłowych (polskie nazwy, opisy), ładowana przy
      pierwszym uruchomieniu w transakcji, ze stałymi UUID; systemowe vs własne.
- [ ] Ekran biblioteki (podekran sekcji Plany) + formularz własnego ćwiczenia
      (React Hook Form + Zod): tworzenie, edycja, usuwanie z zachowaniem historii.
- [ ] Ilustracje własnych ćwiczeń: wybór pliku, zmniejszanie i limit rozmiaru, zapis w
      `exerciseMedia`, placeholder przy braku obrazu. Bez cudzych zdjęć.
- [ ] Wspólne komponenty potrzebne od tej fazy: pole tekstowe, Select, Modal/BottomSheet,
      ConfirmDialog, Toast, EmptyState z akcją.
- [ ] Testy: repozytorium, wyszukiwanie/filtry, formularz, e2e „utwórz → znajdź → edytuj →
      odśwież → nadal jest”.

### Później

Fazy 3–8 według tabeli w `docs/ARCHITECTURE.md` §6.

## Do zrobienia przez właściciela projektu

- [ ] Włączyć GitHub Pages: repozytorium → **Settings → Pages → Source: „GitHub Actions”**,
      potem w zakładce **Actions** uruchomić ponownie workflow „Check and deploy”
      (pierwsze uruchomienie przed włączeniem Pages kończy się błędem na etapie publikacji – to
      oczekiwane). Adres: `https://squizyy-essa.github.io/apka-silka/`.
