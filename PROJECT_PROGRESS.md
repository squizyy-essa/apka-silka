# Postęp projektu – Training Planner

Ten plik jest pamięcią projektu między sesjami pracy. **Na początku każdej nowej sesji przeczytaj
go w całości, potem `docs/ARCHITECTURE.md`, i dopiero wtedy zmieniaj kod.** Po każdej fazie
zaktualizuj wszystkie sekcje.

Ostatnia aktualizacja: 2026-11-16 (ukończone fazy 1 i 2; z fazy 8 przeniesiono instalację na ekranie początkowym).

## Jak wznowić pracę

1. Wymagania są w specyfikacji „MASTER PROMPT: TRAINING PLANNER PWA” (trzyma ją właściciel
   projektu – poproś o wklejenie, jeśli nie ma jej w rozmowie). Streszczenie decyzji i plan faz:
   `docs/ARCHITECTURE.md`.
2. `npm install`, potem `npm run check` i `npm run test:e2e` – wszystko musi być zielone, zanim
   zaczniesz cokolwiek zmieniać.
3. Następna faza do zrobienia: **faza 3 – kreator planów** (lista zadań niżej).
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

### Z fazy 8 przeniesione wcześniej: instalacja na ekranie początkowym ✅ (2026-11-16)

Na prośbę właściciela, żeby oglądać postępy na iPhonie z ikony.

- `public/manifest.webmanifest` (nazwa, `display: standalone`, adresy względne), ikony PNG
  192/512 (zwykłe i maskable) oraz `apple-touch-icon` 180 px, meta tagi iOS w `index.html`.
- Ikony generuje `node scripts/generate-icons.mjs` z `scripts/icon.svg` (własna grafika).
- Testy e2e `e2e/install.spec.ts`: manifest, rozmiary ikon, znaczniki iOS.
- **Nadal w fazie 8:** service worker, cache/offline, komunikat o aktualizacji, prośba o trwałe
  przechowywanie, podział kodu. Bez service workera aplikacja wymaga internetu przy starcie.
- Niesprawdzone przeze mnie: faktyczne dodanie do ekranu początkowego na iPhonie (wymaga
  urządzenia) – do potwierdzenia przez właściciela.
- Ekran startowy i pasek stanu w trybie pełnoekranowym mają stały jasny kolor z manifestu,
  niezależnie od wybranego motywu.

### Z fazy 8 przeniesione wcześniej: powiadomienie o aktualizacji ✅ (2026-11-16)

Powód: aplikacja uruchomiona z ikony na iPhonie pokazywała starą wersję (telefon trzyma ją w
pamięci, a w trybie pełnoekranowym nie ma przycisku odświeżania).

- Build zapisuje `version.json` (`version`, unikalny `buildId`) – wtyczka w `vite.config.ts`.
- `src/app/update/`: sprawdzenie przy starcie, po powrocie aplikacji na ekran i co 30 min
  (nie częściej niż raz na minutę), z pominięciem pamięci podręcznej. Gdy opublikowany build
  jest inny → pasek „Dostępna jest nowsza wersja” z „Odśwież” i „Później”.
- Aplikacja nigdy nie przeładowuje się sama (wymóg §16: nie przerywać aktywnego treningu).
  Brak internetu lub błąd sprawdzenia = brak paska.
- Niesprawdzone na iPhonie; pierwsze przejście ze starej wersji (bez tego mechanizmu) nadal
  wymaga ręcznego zamknięcia aplikacji.
- Nadal w fazie 8: service worker i tryb offline.

### Faza 2 – Biblioteka ćwiczeń ✅ (2026-11-16)

Kryterium: „można utworzyć, znaleźć, edytować i ponownie odczytać ćwiczenie po odświeżeniu
strony” – spełnione, potwierdzone testem e2e w prawdziwej przeglądarce.

Co rzeczywiście działa (ekran: Plany → Biblioteka ćwiczeń, adres `#/plany/cwiczenia`):

- **Gotowa biblioteka:** 64 ćwiczenia siłowe z polskimi nazwami i własnymi opisami, wszystkie
  11 partii i 8 rodzajów sprzętu. Wgrywana przy starcie w transakcji, bez duplikatów; stałe UUID
  w `src/db/seed/systemExercises.ts` (po zmianie wpisu podnieść `SYSTEM_EXERCISES_REVISION`).
- **Schemat bazy v2:** pole `category` (wielostawowe / izolowane / cardio / mobilność) z migracją
  v1 → v2 (test).
- **Wyszukiwanie i filtry:** po nazwie (bez względu na wielkość liter i polskie znaki, wszystkie
  słowa w dowolnej kolejności), partia (główna najpierw, potem dodatkowa), sprzęt, kategoria.
  Filtry są w adresie – przeżywają odświeżenie i Wstecz.
- **Własne ćwiczenia:** tworzenie, edycja, usuwanie z potwierdzeniem; walidacja formularza
  (React Hook Form + Zod) z komunikatami po polsku. Ćwiczeń systemowych nie da się edytować ani
  usunąć (także przez bezpośredni adres).
- **Ilustracje własnych ćwiczeń:** wybór pliku, zmniejszenie do maks. 1024 px i zapis jako JPEG
  w `exerciseMedia` (zdjęcie 3000×2000 → 1024×683, < 400 kB); zamiana i usunięcie; odrzucenie
  plików niebędących obrazami i uszkodzonych z wyjaśnieniem; placeholder przy braku obrazu.
- **Ochrona danych:** usunięcie ćwiczenia nie rusza historii sesji (przypadek 5); ćwiczenia
  użytego w planie (także jako zamiennik) nie da się usunąć.
- **Na żywo:** zmiany w bibliotece widać od razu w drugiej otwartej karcie.
- Nowe wspólne komponenty: pola formularza (tekst, obszar tekstu, select), ConfirmDialog, Badge,
  BackLink, przycisk-link; token `border-strong` (kontrast obramowania pól ≥ 3:1).

Ograniczenia tej fazy:

- **„Ostatnio używane”**: zapytanie działa i jest przetestowane na danych testowych, ale sekcja
  pojawi się w aplikacji dopiero, gdy będą treningi (faza 4). Do tego czasu jest ukryta.
- Gotowe ćwiczenia nie mają ilustracji (brak grafik z odpowiednią licencją) – w liście placeholder.
- Zmiana „rodzaju pomiaru” własnego ćwiczenia jest dozwolona zawsze; gdy będzie historia
  (faza 4), trzeba dodać ostrzeżenie lub blokadę.
- Formularz nie ostrzega przed wyjściem z niezapisanymi zmianami.
- Pole numeryczne z obsługą przecinka (62,5) przeniesione do fazy 3 – tam jest pierwszy raz potrzebne.
- Przetwarzanie obrazów sprawdzone w Chrome; na iPhonie (Safari, zdjęcia HEIC) do potwierdzenia.

Czego **nie ma** (ekrany mówią o tym wprost i nie mają żadnych kontrolek):

- Pulpit, Trening, Historia oraz plany treningowe w sekcji Plany – tylko informacja
  „nie jest jeszcze wdrożone”.
- W Ustawieniach działa tylko sekcja Wygląd; timer, przypomnienia i backup – faza 7.
- Service worker i tryb offline – faza 8 (manifest, ikony i powiadomienie o aktualizacji już są).

## Wyniki testów (2026-11-16, koniec fazy 2)

| Sprawdzenie | Polecenie | Wynik |
|---|---|---|
| TypeScript strict | `npm run typecheck` | 0 błędów |
| ESLint | `npm run lint` | 0 błędów, 0 ostrzeżeń |
| Testy jednostkowe i komponentowe | `npm test` | 134 / 134 (10 plików) |
| Build produkcyjny | `npm run build` | OK – JS 710 kB (223 kB gzip) |
| Testy e2e (Chrome, build produkcyjny) | `npm run test:e2e` | 28 / 28 |
| Build pod podścieżką (jak GitHub Pages) | ręcznie | działa, zapis ustawień OK, 0 błędów konsoli |
| GitHub Actions – zadanie `check-and-build` | automatycznie po pushu | OK (typy, lint, testy, build na serwerach GitHuba) |
| GitHub Actions – zadanie `deploy` | automatycznie po pushu | OK po włączeniu Pages; aplikacja: https://squizyy-essa.github.io/apka-silka/ |

Zakres testów: walidacja domenowa (§18), tworzenie tabel, trwałość po ponownym otwarciu bazy,
migracja z zachowaniem danych, wycofanie nieudanej migracji, odmowa otwarcia nowszej bazy,
repozytoria (w tym start w dwóch kartach naraz, naprawa częściowo uszkodzonego rekordu),
mapowanie błędów, logika motywu, kompletność i kontrast tokenów, cała aplikacja (nawigacja,
tytuły, ustawienia, restart, druga karta, błędy zapisu i startu). E2E: test akceptacyjny H
(w zakresie ustawień) i J, nawigacja/Wstecz/linki, synchronizacja kart, motyw systemowy,
klawiatura, brak mignięcia motywu, brak błędów w konsoli.

Dodatkowo sprawdzone ręcznie: celowe zepsucie zapisu ustawień powoduje, że 4 testy nie przechodzą
(testy naprawdę pilnują trwałości).

Niesprawdzone: prawdziwy iPhone / Safari (testy e2e działają w Chrome). Właściciel potwierdził,
że opublikowana strona się otwiera.

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
13. „Kategoria” ćwiczenia (§6.1) = typ ruchu: `compound`, `isolation`, `cardio`, `mobility`.
14. Usuwanie własnego ćwiczenia jest trwałe (bez kosza); historię chronią migawki w sesjach,
    a plany – blokada usunięcia ćwiczenia użytego w planie.
15. Biblioteka ćwiczeń jest podekranem sekcji Plany (`/plany/cwiczenia`).
16. Lista ćwiczeń jest filtrowana w pamięci (biblioteka ma dziesiątki–setki pozycji).
17. Testy używające obrazów (Blob) działają w środowisku Node, nie jsdom (klonowanie Blob).

## Znane problemy i ograniczenia

- Paczka JS ma 710 kB (223 kB gzip) i Vite ostrzega o rozmiarze. Do zrobienia w fazie 8 (wcześniej,
  jeśli zacznie przeszkadzać): ładowanie ekranów na żądanie.
- `npm audit`: 7 zgłoszeń „moderate”, wszystkie w narzędziach deweloperskich (minimatch
  w typescript-eslint); nie trafiają do aplikacji.
- Test klawiatury w e2e przytrzymuje strzałkę (`down`/`up`), bo grupa radio Radix wybiera opcję
  przy fokusie tylko wtedy, gdy klawisz jest wciśnięty; błyskawiczne syntetyczne naciśnięcie
  byłoby pominięte. Prawdziwej klawiatury to nie dotyczy.
- Workflow używa akcji `actions/*@v4` (`upload-pages-artifact@v3`), które GitHub oznacza jako
  oparte na przestarzałym Node 20 (na razie tylko ostrzeżenie). Do podniesienia wersji akcji.
- iOS: osobne dane dla Safari i aplikacji z ekranu początkowego; możliwe czyszczenie danych
  nieużywanej strony w Safari. Do zaadresowania w fazach 7–8 (backup, instalacja, trwałe
  przechowywanie).

## Kolejne zadania

### Faza 3 – Kreator planów (następna)

- [ ] Repozytorium planów: plany, dni, ćwiczenia planu, serie – operacje wielorekordowe w
      transakcjach; duplikowanie planu i dnia; archiwizacja; „ustaw jako główny” (tylko jeden);
      usunięcie planu bez ruszania sesji.
- [ ] Lista planów w sekcji Plany (zastępuje obecną informację o braku modułu).
- [ ] Kreator: dni (dodaj, nazwij, kolejność, duplikuj, dzień tygodnia w trybie stałym),
      wybór ćwiczeń z biblioteki, serie rozgrzewkowe/robocze z indywidualnymi wartościami,
      zakres powtórzeń, RIR, przerwa, tempo, czas/dystans wg rodzaju pomiaru, skok progresji,
      notatki, zamienniki, superserie (łączenie, rozłączanie, przerwa po rundzie).
- [ ] Pole numeryczne przyjmujące „62,5” i „62.5”; puste pole ≠ 0.
- [ ] Przeciąganie (dnd-kit, mysz i dotyk) + przyciski „w górę / w dół” jako alternatywa.
- [ ] Zaprojektować pole/encję dla przerwy po rundzie superserii (schemat v3).
- [ ] Testy: repozytorium, kreator, e2e test akceptacyjny A (plan Push/Pull/Legs po odświeżeniu).

### Później

Fazy 3–8 według tabeli w `docs/ARCHITECTURE.md` §6.

## Do zrobienia przez właściciela projektu

- [x] Włączyć GitHub Pages (zrobione 2026-11-16; każdy push do `main` publikuje aplikację).
- [ ] Na iPhonie: otworzyć https://squizyy-essa.github.io/apka-silka/ w Safari → Udostępnij →
      „Dodaj do ekranu początkowego” i potwierdzić, że ikona i pełny ekran działają.
