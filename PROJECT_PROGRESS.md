# Postęp projektu – Training Planner

Ten plik jest pamięcią projektu między sesjami pracy. **Na początku każdej nowej sesji przeczytaj
go w całości, potem `docs/ARCHITECTURE.md`, i dopiero wtedy zmieniaj kod.** Po każdej fazie
zaktualizuj wszystkie sekcje.

Ostatnia aktualizacja: 2026-11-16 (ukończone fazy 1–3; z fazy 8 przeniesiono instalację na ekranie początkowym i powiadomienie o aktualizacji).

## Jak wznowić pracę

1. Wymagania są w specyfikacji „MASTER PROMPT: TRAINING PLANNER PWA” (trzyma ją właściciel
   projektu – poproś o wklejenie, jeśli nie ma jej w rozmowie). Streszczenie decyzji i plan faz:
   `docs/ARCHITECTURE.md`.
2. `npm install`, potem `npm run check` i `npm run test:e2e` – wszystko musi być zielone, zanim
   zaczniesz cokolwiek zmieniać.
3. Następna faza do zrobienia: **faza 4 – aktywny trening** (lista zadań niżej).
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

### Faza 3 – Kreator planów ✅ (2026-11-16)

Kryterium: „można zbudować i zapisać kompletny plan Push/Pull/Legs” – spełnione; test
akceptacyjny A przechodzi w prawdziwej przeglądarce (plan z 3 dniami, 7 ćwiczeniami i seriami
z przykładu ze specyfikacji jest identyczny po odświeżeniu).

Co rzeczywiście działa (sekcja Plany):

- **Wiele planów:** tworzenie, edycja nazwy/opisu/trybu, duplikowanie (głęboka kopia z nowymi
  identyfikatorami), archiwizacja i przywracanie, usuwanie z potwierdzeniem, „ustaw jako główny”
  (zawsze dokładnie jeden; pierwszy plan staje się główny sam). Archiwizacja i usunięcie planu
  nie ruszają zapisanych sesji (przypadek 27, test).
- **Tryb stały i elastyczny** osobno dla planu; w stałym dniowi można przypisać dzień tygodnia,
  w elastycznym nowe dni dostają nazwy „Trening A/B/C”.
- **Dni:** dodawanie, zmiana nazwy, kolejność, duplikowanie, usuwanie z potwierdzeniem.
- **Ćwiczenia dnia:** wybór z biblioteki (okno z wyszukiwarką i filtrem partii), usuwanie,
  kolejność. Nowe ćwiczenie dostaje 3 puste serie robocze, przerwę z ustawień (90 s) i skok
  progresji 2,5 kg.
- **Serie:** każda ma własny typ (robocza/rozgrzewkowa) i wartości: ciężar, powtórzenia od–do,
  RIR; dla ćwiczeń na czas – sekundy, na dystans – metry (+ ciężar). Dodawanie (kopiuje
  poprzednią), usuwanie. Pola przyjmują „62,5” i „62.5”; puste pole to brak wartości, nie zero;
  błędna wartość jest oznaczana i nie jest zapisywana. Ciężar nie jest wymagany.
- **Parametry ćwiczenia:** przerwa, skok progresji, tempo (jedno pole dla wszystkich serii),
  notatka, zamienniki (bez duplikatów i bez samego ćwiczenia).
- **Superserie:** łączenie z następnym ćwiczeniem (także 3+ ćwiczeń i scalanie dwóch superserii),
  oznaczenie literą, przerwa po rundzie, wyłączenie jednego ćwiczenia, rozłączenie całości.
  Reguła pilnowana w danych: superseria to co najmniej 2 sąsiadujące ćwiczenia
  (`src/shared/logic/supersets.ts`); ćwiczenie upuszczone między dwa elementy superserii do niej
  dołącza, wyciągnięte poza nią – wypada.
- **Zmiana kolejności** dni i ćwiczeń: przeciąganie za uchwyt (mysz, dotyk – dnd-kit),
  klawiatura (uchwyt → spacja → strzałki → spacja, z komunikatami dla czytników ekranu) oraz
  pozycje menu „Przenieś wyżej / niżej”.
- **Zapis:** każda zmiana zapisuje się od razu (bez przycisku „Zapisz”), w transakcji. Pola
  tekstowe i liczbowe zapisują się po opuszczeniu pola, Enterze oraz gdy aplikacja idzie w tło.
  Nieudany zapis = komunikat, a pole wraca do wartości z bazy.
- **Schemat bazy v3:** tabela `supersetGroups` (przerwa po rundzie).

Błędy znalezione przez testy i naprawione w tej fazie:

- Dwa szybkie dotknięcia „Dodaj dzień” tworzyły dwa dni o tej samej nazwie → nazwa i pozycja
  są teraz liczone w transakcji.
- Szybka edycja „Powt. od” i zaraz „Powt. do” mogła skasować pierwszą wartość (druga zmiana
  używała nieaktualnej kopii) → każde pole zapisuje tylko siebie, a spójność zakresu ustala
  warstwa danych.

Ograniczenia tej fazy:

- Tempo ustawia się wspólnie dla wszystkich serii ćwiczenia (model pozwala na osobne).
- Przeciąganie dotykiem sprawdzone tylko myszą w Chrome – na iPhonie do potwierdzenia.
- Usunięcie ćwiczenia z dnia nie pyta o potwierdzenie (usunięcie dnia i planu pyta).
- Plan nie pokazuje jeszcze szacowanego czasu treningu (Pulpit, faza 4).
- Zmiana trybu ze stałego na elastyczny zachowuje przypisane dni tygodnia w danych (wracają po
  przełączeniu z powrotem), ale ich nie pokazuje.

Czego **nie ma** (ekrany mówią o tym wprost i nie mają żadnych kontrolek):

- Pulpit, Trening, Historia – tylko informacja „nie jest jeszcze wdrożone”.
- W Ustawieniach działa tylko sekcja Wygląd; timer, przypomnienia i backup – faza 7.
- Service worker i tryb offline – faza 8 (manifest, ikony i powiadomienie o aktualizacji już są).

## Wyniki testów (2026-11-16, koniec fazy 3)

| Sprawdzenie | Polecenie | Wynik |
|---|---|---|
| TypeScript strict | `npm run typecheck` | 0 błędów |
| ESLint | `npm run lint` | 0 błędów, 0 ostrzeżeń |
| Testy jednostkowe i komponentowe | `npm test` | 196 / 196 (14 plików) |
| Build produkcyjny | `npm run build` | OK |
| Testy e2e (Chrome, build produkcyjny) | `npm run test:e2e` | 38 / 38 |
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
18. Kreator planów zapisuje każdą zmianę od razu (autosave), bez przycisku „Zapisz”.
19. Każde pole zapisuje wyłącznie własną wartość; reguły zależne od innych pól (zakres
    powtórzeń, kolejność, superserie) rozstrzyga repozytorium w transakcji na aktualnych danych.
20. Superseria = osobny rekord `supersetGroups` + `supersetGroupId` w ćwiczeniach planu;
    w superserii obowiązuje przerwa po rundzie, własne przerwy ćwiczeń są zachowane na później.
21. Adresy: `/plany/nowy`, `/plany/plan/:planId`, `/plany/plan/:planId/dzien/:dayId`.

## Znane problemy i ograniczenia

- Paczka JS ma 710 kB (223 kB gzip) i Vite ostrzega o rozmiarze. Do zrobienia w fazie 8 (wcześniej,
  jeśli zacznie przeszkadzać): ładowanie ekranów na żądanie.
- `npm audit`: 7 zgłoszeń „moderate”, wszystkie w narzędziach deweloperskich (minimatch
  w typescript-eslint); nie trafiają do aplikacji.
- Test klawiatury w e2e przytrzymuje strzałkę (`down`/`up`), bo grupa radio Radix wybiera opcję
  przy fokusie tylko wtedy, gdy klawisz jest wciśnięty; błyskawiczne syntetyczne naciśnięcie
  byłoby pominięte. Prawdziwej klawiatury to nie dotyczy.
- Test komponentowy „sets another plan as primary…” (`plans.test.tsx`) raz na kilkanaście
  uruchomień nie przeszedł; przyczyna nieustalona (prawdopodobnie zależność czasowa w teście).
  Obserwować; jeśli się powtórzy – zdiagnozować.
- Test e2e zmiany kolejności klawiaturą ma krótką pauzę po „podniesieniu” elementu: biblioteka
  dnd-kit potrzebuje chwili na pomiar wierszy, zanim przyjmie strzałkę.
- Workflow używa akcji `actions/*@v4` (`upload-pages-artifact@v3`), które GitHub oznacza jako
  oparte na przestarzałym Node 20 (na razie tylko ostrzeżenie). Do podniesienia wersji akcji.
- iOS: osobne dane dla Safari i aplikacji z ekranu początkowego; możliwe czyszczenie danych
  nieużywanej strony w Safari. Do zaadresowania w fazach 7–8 (backup, instalacja, trwałe
  przechowywanie).

## Kolejne zadania

### Faza 4 – Aktywny trening (W TOKU – przerwana 2026-11-16 z powodu limitu sesji)

**Zrobione i przetestowane (tylko warstwa danych, bez ekranów – użytkownik nic nowego nie widzi):**

- Model: `SessionExercise` ma migawki z planu (`restSecondsSnapshot`,
  `progressionIncrementKgSnapshot`, `supersetRestSecondsSnapshot`,
  `alternativeExerciseIdsSnapshot`), `SessionSet` ma `plannedDurationSeconds`,
  `plannedDistanceMeters`, `tempo`. Bez nowej wersji schematu (pola nieindeksowane, tabele sesji
  były puste we wszystkich wydanych wersjach).
- `SessionRepository` (`src/db/repositories/dexieSessionRepository.ts`): `startFromPlanDay`
  (migawka ćwiczeń, serii, przerw, superserii), `startEmpty`, `getActive`, `observeActive`,
  `abandon`. Jedna aktywna sesja pilnowana w transakcji (test z podwójnym startem i drugą kartą).
- `localDateOf` (`src/shared/lib/localDate.ts`) – lokalna data treningu.
- Testy: `sessionRepository.test.ts` (10 testów).

- Część 2 (dane i logika, nadal bez ekranów): `SessionRepository` zapisuje wyniki serii
  (`updateSet`, `setSetStatus`), `addSet`/`removeSet`, `addExercise`, pominięcie, zamianę,
  usunięcie i kolejność ćwiczeń, notatki, `finish`, `getPreviousResult`,
  `getLastCompletedDayId` oraz stan timera. Czyste reguły w `src/shared/logic/workout.ts`:
  wynik przy oznaczaniu serii, objętość robocza, przerwa po serii/rundzie superserii, następna
  seria, timer ze znaczników czasu, propozycja następnego dnia. Testy: `workout.test.ts`,
  `sessionRecording.test.ts`.

**Następny krok – zacząć tutaj:** ekrany w `src/workouts/` (start treningu, aktywny trening
w widoku tabeli i kart, timer, wznawianie, zakończenie i podsumowanie) oraz Pulpit.
Pozostałe punkty poniżej są nietknięte.

- [ ] Zustand (stan interfejsu aktywnej sesji), date-fns w razie potrzeby.
- [ ] Repozytorium sesji: start z dnia planu (migawka ćwiczeń, serii, przerw, superserii –
      w tym przerwy po rundzie; schemat v4, jeśli potrzebne pola), pusty trening, jedna aktywna
      sesja (sprawdzane w transakcji), wznowienie, porzucenie, zakończenie.
- [ ] Ekran treningu: widok tabeli i widok kart (przełączanie bez utraty danych, zapamiętane
      w ustawieniach), statusy serii (oczekująca / wykonana / nieudana / pominięta), zapis każdej
      zmiany od razu, „Poprzedni wynik” wg identyfikatora ćwiczenia.
- [ ] Edycje w trakcie: ciężar, powtórzenia, RIR, dodanie/usunięcie serii, zamiana ćwiczenia
      (zamienniki z planu), kolejność, pominięcie, notatka, seria nieudana z rzeczywistym wynikiem.
      Bez zmiany planu; osobna akcja „Zapisz zmiany do planu” z potwierdzeniem (opcjonalna).
- [ ] Timer odpoczynku liczony ze znaczników czasu (`restTimerState`), pauza, ±15 s, pominięcie,
      dźwięk z obsługą blokady, przerwa po rundzie superserii.
- [ ] Wznawianie po zamknięciu aplikacji („Czy chcesz wznowić trening?”), porzucenie z potwierdzeniem.
- [ ] Zakończenie i podsumowanie (§10): czasy, liczba serii, objętość robocza, partie, notatka,
      samopoczucie 1–5. Rekordy i porównanie z poprzednim treningiem – faza 6.
- [ ] Pulpit: najbliższy trening, szybki start, wznowienie.
- [ ] Biblioteka: sekcja „Ostatnio używane” zacznie się pokazywać; ostrzeżenie przy zmianie
      rodzaju pomiaru ćwiczenia z historią.
- [ ] Testy: reguły sesji, objętość, timer (czas wstrzyknięty), e2e testy akceptacyjne B i F.

### Później

Fazy 5–8 według tabeli w `docs/ARCHITECTURE.md` §6.

## Do zrobienia przez właściciela projektu

- [x] Włączyć GitHub Pages (zrobione 2026-11-16; każdy push do `main` publikuje aplikację).
- [ ] Na iPhonie: otworzyć https://squizyy-essa.github.io/apka-silka/ w Safari → Udostępnij →
      „Dodaj do ekranu początkowego” i potwierdzić, że ikona i pełny ekran działają.
