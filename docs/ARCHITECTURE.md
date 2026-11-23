# Architektura i plan implementacji

Dokument opisuje, jak zbudowana jest aplikacja Training Planner i w jakiej kolejności powstaje.
Źródłem wymagań jest specyfikacja „MASTER PROMPT: TRAINING PLANNER PWA” (numery `§` poniżej
odnoszą się do jej rozdziałów). Bieżący stan prac jest w [`PROJECT_PROGRESS.md`](../PROJECT_PROGRESS.md).

## 1. Założenia

- Aplikacja **local-first**: jeden użytkownik, bez kont, bez serwera. Wszystkie dane są w IndexedDB
  w przeglądarce użytkownika.
- Hosting statyczny (GitHub Pages). Build jest niezależny od adresu: `base: './'` + routing oparty
  na `#`, więc ten sam katalog `dist/` działa pod dowolną ścieżką i na dowolnym hostingu.
- Priorytety: poprawność danych treningowych → szybkość obsługi → stabilność → wygląd.
- Nic na ekranie nie udaje działania. Moduł, którego jeszcze nie ma, jest wprost oznaczony jako
  niewdrożony i nie pokazuje żadnych kontrolek.

## 2. Stack

| Obszar | Wybór | Uwagi |
|---|---|---|
| UI | React 19 + TypeScript 6 (strict) | dodatkowo `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| Build | Vite 8 | |
| Routing | React Router 8, **hash router** | odstępstwo, patrz niżej |
| Style | Tailwind CSS 4 + design tokens (CSS variables) | domyślna paleta Tailwinda wyłączona |
| Komponenty | własne komponenty w stylu shadcn/ui na prymitywach Radix UI | patrz niżej |
| Ikony | Lucide React | |
| Baza | Dexie 4 (IndexedDB) | |
| Walidacja | Zod 4 | schematy są źródłem typów domenowych |
| Testy | Vitest 5 + React Testing Library + fake-indexeddb; Playwright (e2e) | |
| Lint | ESLint 9 + typescript-eslint (strict, type-checked) + jsx-a11y + react-hooks | |

Biblioteki ze specyfikacji dodawane dopiero w fazie, która ich używa (żeby nie utrzymywać martwych
zależności): React Hook Form (faza 2), dnd-kit (faza 3), Recharts i date-fns
(faza 6), vite-plugin-pwa (faza 8).

### Odstępstwa od specyfikacji i ich powody

1. **Hash router zamiast adresów bez `#`.** GitHub Pages nie obsługuje przepisywania adresów,
   więc `/plany` po odświeżeniu dałoby błąd 404. Adresy `…/#/plany` działają przy odświeżeniu,
   z przycisku Wstecz i jako linki bezpośrednie (§3) na każdym hostingu statycznym.
2. **shadcn/ui bez generatora CLI.** shadcn/ui to kod kopiowany do projektu, nie biblioteka.
   Komponenty piszemy ręcznie w tej samej konwencji (Radix + `class-variance-authority` +
   `tailwind-merge`), podpięte od razu pod nasze tokeny. Efekt jest ten sam, bez nieużywanego kodu.
3. **TypeScript 6.0 zamiast 7.x i ESLint 9 zamiast 10.** `typescript-eslint` nie obsługuje jeszcze
   TS 7, a `eslint-plugin-jsx-a11y` – ESLint 10. Do podniesienia, gdy wtyczki nadążą.
5. **Bez Zustand.** Stan aktywnego treningu jest w IndexedDB i czytany na żywo (Dexie
   `liveQuery`); osobny magazyn stanu byłby drugą, nietrwałą kopią tych samych danych – a
   specyfikacja zabrania zastępowania trwałego zapisu stanem w pamięci.
4. **Kolor tekstu pomocniczego `#5C6577` zamiast `#727B8C`.** Proponowany kolor ma kontrast 4,0:1
   na tle aplikacji, poniżej progu WCAG AA (4,5:1). Pozostałe kolory palety Minimal są zgodne
   ze specyfikacją; pilnuje tego test `tokens.test.ts`.

## 3. Struktura katalogów

```
src/
  app/            konfiguracja: start aplikacji (runtime), routing, layout, motywy, style
    styles/       tokens.css (design tokens), index.css (Tailwind + mapowanie tokenów)
    theme/        logika motywu i stylu wizualnego
  db/             schemat IndexedDB, migracje, błędy, repozytoria
    repositories/ kontrakty (types.ts) i implementacje Dexie
  shared/
    domain/       modele domenowe = schematy Zod + typy (bez Reacta, bez Dexie)
    lib/          małe funkcje pomocnicze (id, czas, klasy CSS)
    ui/           wspólne komponenty interfejsu
  dashboard/  plans/  workouts/  analytics/  settings/     moduły ekranów
  test/           konfiguracja i narzędzia testów
e2e/              testy Playwright (na buildzie produkcyjnym)
docs/             dokumentacja
```

Jest też `exercises/` (biblioteka ćwiczeń) i `db/seed/` (gotowa biblioteka). Moduły dochodzące
w kolejnych fazach: `progression/` (5), `calendar/`,
`measurements/` (6), `backup/`, `notifications/` (7).

### Zasady zależności

- `shared/domain` nie importuje niczego z projektu poza sobą. `db` zależy tylko od `shared`.
- Moduły ekranów korzystają z danych **wyłącznie przez interfejsy repozytoriów**
  (`db/repositories/types.ts`), nigdy bezpośrednio przez Dexie.
- Logika biznesowa (progresja, objętość, rekordy, sugestie) to czyste funkcje w plikach `.ts`
  bez Reacta, z testami jednostkowymi. Komponenty tylko je wywołują.
- Jeden komponent = jedna odpowiedzialność; ekran składa się z małych komponentów.

## 4. Dane

### Schemat i migracje (`src/db/schema.ts`)

- Historia schematu to lista `SCHEMA_VERSIONS`. Wersje są kolejnymi liczbami od 1.
  **Wydanej wersji nigdy się nie edytuje** – zmiana schematu to nowy wpis z opcjonalną funkcją
  `upgrade`, która przekształca istniejące rekordy.
- Migracja działa w jednej transakcji: jeśli się nie powiedzie, baza zostaje w poprzedniej wersji
  z nienaruszonymi danymi (pokryte testem).
- Baza zapisana przez **nowszą** wersję aplikacji nie zostanie otwarta przez starszy kod
  (`openVerified`) – użytkownik dostaje prośbę o odświeżenie zamiast ryzyka zapisu w starym formacie.
- Gdy inna karta podnosi wersję schematu, bieżąca karta zwalnia połączenie (nie blokuje migracji)
  i prosi o odświeżenie.
- Wersja 3 dodaje tabelę `supersetGroups`. Wersja 2 dodaje ćwiczeniom pole `category`. Wersja 1 zawiera wszystkie encje z §17: `exercises`, `exerciseMedia`, `trainingPlans`,
  `planDays`, `plannedExercises`, `plannedSets`, `workoutSessions`, `sessionExercises`,
  `sessionSets`, `bodyMeasurements`, `appSettings`, `restTimerState`.
- Do zaprojektowania w swoich fazach (jako kolejne wersje schematu): sugestie progresji i
  ukończone rundy superserii (fazy 4–5), metadane importów (faza 7).

### Modele i walidacja (`src/shared/domain`)

- Każda encja ma schemat Zod; typ TypeScript jest z niego wyprowadzany (jedno źródło prawdy).
- Reguły z §18 są w schematach: brak `NaN`/`Infinity`, ciężar ≥ 0, powtórzenia całkowite ≥ 0,
  RIR 0–10, zakres powtórzeń min ≤ max, skok progresji > 0, nazwy nie mogą być samymi spacjami.
- Brak wartości to `undefined`, nigdy `0` – „0 kg” i „nie podano” to różne rzeczy.
- Identyfikatory: UUID (`crypto.randomUUID`). Czas: ISO 8601 w UTC. Data treningu:
  osobne pole `localWorkoutDate` (`RRRR-MM-DD`) zapisywane raz, przy starcie sesji.
- Sesja treningowa przechowuje migawkę (nazwa i typ ćwiczenia, planowane wartości serii), więc
  późniejsza edycja lub usunięcie planu/ćwiczenia nie zmienia historii.
- Wartości pochodne (objętość, rekordy, e1RM) nie są zapisywane – liczone z danych przy odczycie.

### Repozytoria i błędy

- `EntityRepository<T>` – generyczny CRUD z walidacją przy każdym zapisie.
- `SettingsRepository` – jeden rekord ustawień; `load` tworzy wartości domyślne w transakcji,
  `subscribe` informuje o zmianach także z innych kart.
- Każdy błąd warstwy danych jest zamieniany na `StorageError` z polem `kind`
  (`quota`, `unavailable`, `newer-version`, `closed`, `unknown`) i gotowym komunikatem po polsku,
  albo na `ValidationError` (rekord odrzucony, nic nie zapisano).
- Zasada dla UI: stan na ekranie zmienia się **po** udanym zapisie. Nieudany zapis = komunikat,
  a ekran pokazuje to, co faktycznie jest w bazie.

### Przyszła synchronizacja (§20) – tylko przygotowanie

Kod ekranów zna wyłącznie interfejsy repozytoriów. Synchronizację będzie można dodać jako
implementację opakowującą lokalną (zapis lokalny + kolejka zmian do wysłania), bez zmian w
ekranach. Dane są na to gotowe: klucze UUID generowane na urządzeniu, znaczniki `updatedAt`.
Proponowana strategia konfliktów: „ostatni zapis wygrywa” na poziomie rekordu według `updatedAt`,
usunięcia jako znaczniki (tombstone), sesje treningowe scalane po `id`. Kont, logowania
i backendu teraz nie ma i nie ma też żadnych przycisków, które by je udawały.

## 5. Wygląd

- Dwie niezależne osie ustawiane atrybutami na `<html>`: `data-theme` (`light`/`dark`, wynik
  wyboru Jasny/Ciemny/Systemowy) i `data-style` (`minimal`/`performance`/`pro-athlete`).
  Razem 6 kompletnych zestawów tokenów w `tokens.css`.
- Komponenty używają tylko nazw semantycznych (`bg-surface`, `text-muted-foreground`, …).
  Stockowa paleta Tailwinda jest wyłączona, więc nie da się wpisać koloru „na sztywno”.
- Wybór jest zapisywany w IndexedDB (`appSettings`). W `localStorage` jest tylko mała podpowiedź
  dla skryptu w `index.html`, który ustawia motyw przed pierwszym renderem (bez mignięcia).
- Telefon i tablet (< 1024 px): dolny pasek. Komputer (≥ 1024 px): stały sidebar.
- Minimalny obszar dotykowy 44 × 44 px, widoczny fokus klawiatury, `prefers-reduced-motion`,
  marginesy bezpieczne dla iPhone’a (`env(safe-area-inset-*)`).

## 6. Plan implementacji

| Faza | Zakres | Kryterium ukończenia |
|---|---|---|
| **1. Fundament** | projekt, TS strict, routing, Tailwind, tokeny, motywy, layout, IndexedDB, migracje, testy | aplikacja się uruchamia i trwale zapisuje/odczytuje dane |
| 2. Biblioteka ćwiczeń | początkowa baza ćwiczeń, wyszukiwanie, filtry, własne ćwiczenia, ilustracje, pole numeryczne z obsługą przecinka | ćwiczenie można utworzyć, znaleźć, edytować i odczytać po odświeżeniu |
| 3. Kreator planów | wiele planów, dni, tryb stały/elastyczny, serie, superserie, zamienniki, duplikowanie, drag and drop | da się zbudować i zapisać pełny plan Push/Pull/Legs (test A) |
| 4. Aktywny trening | start z planu / pusty, widok tabeli i kart, zapis każdej serii, statusy, edycje, timer, wznawianie, zakończenie i podsumowanie; **Pulpit: najbliższy trening, szybki start, wznowienie** | pełny trening z zamknięciem aplikacji w trakcie (testy B, F) |
| 5. Progresja ✅ | double progression, skoki ciężaru, sugestie po nieudanej serii (w treningu) i między treningami (w podsumowaniu), uzasadnienia, zapis decyzji (schemat v4) | reguły pokryte testami (C, D, E); nic nie zmienia się bez zgody |
| 6. Historia i analityka ✅ | historia, szczegóły i edycja sesji, wykresy, rekordy, kalendarz, pomiary; **Pulpit: podsumowanie aktywności** | statystyki tylko z zapisanych danych, przeliczane po edycji (test I) |
| 7. Ustawienia i backup ✅ | ustawienia timera, przypomnienia, eksport/import JSON | eksport + import odtwarza stan (test G) |
| 8. PWA i dopracowanie | service worker, aktualizacje, dostępność, wydajność (podział kodu), testy mobilne. Manifest, ikony i tryb pełnoekranowy zrobione wcześniej (po fazie 1) | aplikacja instalowalna i poprawnie się aktualizuje |

Specyfikacja nie przypisuje Pulpitu (§4) do żadnej fazy – jest rozłożony na fazy 4 i 6, bo
dopiero wtedy istnieją dane, które ma pokazywać.

Po każdej fazie: `npm run check` (typy, lint, testy, build) + `npm run test:e2e`, aktualizacja
`PROJECT_PROGRESS.md`.

## 7. Ryzyka i ograniczenia platformy

| Ryzyko | Skutek | Jak sobie z tym radzimy |
|---|---|---|
| iOS trzyma dane osobno dla Safari i dla aplikacji dodanej do ekranu początkowego | dane wpisane w Safari nie pojawią się w „zainstalowanej” aplikacji | używać aplikacji z ikony; przeniesienie danych przez eksport/import (faza 7) |
| Safari może usunąć dane strony nieużywanej przez 7 dni (nie dotyczy aplikacji z ekranu początkowego) | utrata danych w zwykłej karcie Safari | instalacja na ekranie początkowym (faza 8), prośba o trwałe przechowywanie, regularny backup |
| Dane są przypisane do adresu strony | zmiana hostingu/adresu = pusta baza | przed zmianą adresu eksport, po zmianie import |
| Repozytorium jest publiczne | kod widzi każdy | w repo nie ma i nie może być żadnych danych użytkownika ani sekretów; dane są tylko w przeglądarce |
| Powiadomienia na iOS działają tylko w zainstalowanej PWA i nie działają w tle bez serwera push | brak niezawodnych przypomnień przy zamkniętej aplikacji | uczciwy opis ograniczeń w UI (fazy 4 i 7), timer liczony ze znaczników czasu |
| Dźwięk wymaga wcześniejszej interakcji użytkownika | timer może zakończyć się bezgłośnie | sygnał wizualny zawsze, dźwięk „odblokowywany” przy pierwszym dotknięciu (faza 4) |
| Rozmiar paczki JS (~185 kB gzip już w fazie 1) | wolniejszy pierwszy start | ładowanie ekranów na żądanie, zwłaszcza wykresów (fazy 6 i 8) |

## 8. Przypadki brzegowe (§21)

Stan: ✅ obsłużone i przetestowane, ◐ częściowo (fundament gotowy), ⏳ zaplanowane.

| # | Przypadek | Oczekiwane zachowanie | Faza | Stan |
|---|---|---|---|---|
| 1 | Zamknięcie aplikacji podczas treningu | każda zmiana serii jest już w bazie; po starcie pytanie „Czy chcesz wznowić trening?” | 4 | ✅ |
| 2 | Odświeżenie strony | jak wyżej; ten sam ekran (adres), te same ustawienia | 1/4 | ✅ |
| 3 | Dwie karty | wspólna baza, zmiany widoczne na żywo; jedna aktywna sesja; migracja w jednej karcie → druga prosi o odświeżenie | 1/4 | ✅ |
| 4 | Próba rozpoczęcia drugiego treningu | sprawdzenie w transakcji; zamiast drugiej sesji propozycja wznowienia lub porzucenia istniejącej | 4 | ✅ |
| 5 | Usunięcie ćwiczenia użytego w historii | historia zostaje (migawka nazwy i typu w sesji); ćwiczenie znika tylko z biblioteki | 2/4 | ✅ |
| 6 | Edycja planu podczas aktywnego treningu | sesja działa na migawce z chwili startu; plan zmienia się niezależnie | 4 | ✅ |
| 7 | Usunięcie serii | usuwana tylko z sesji, kolejność przeliczona; plan bez zmian | 4 | ✅ |
| 8 | Zmiana kolejności ćwiczeń | nowa kolejność zapisana w sesji (lub w planie w kreatorze) | 3/4 | ✅ |
| 9 | Pominięcie całego ćwiczenia | `isSkipped`, serie oczekujące → pominięte; nie liczą się do objętości ani progresji | 4 | ✅ |
| 10 | Zakończenie bez wykonanej serii | ostrzeżenie; do wyboru zapis pustego treningu albo porzucenie | 4 | ✅ |
| 11 | Ciężar 0 kg | poprawna wartość, różna od „nie podano” | 1/3 | ✅ |
| 12 | Ciężar 62,5 kg | pole przyjmuje przecinek i kropkę; obliczenia w gramach bez błędów zmiennoprzecinkowych | 3/5 | ✅ |
| 13 | Brak RIR | zapisane jako brak danych; nie potwierdza celu RIR; bez celu RIR liczą się tylko powtórzenia | 5 | ✅ |
| 14 | Więcej powtórzeń niż cel | zapis rzeczywistej liczby; cel uznany za osiągnięty | 5 | ✅ |
| 15 | Mniej powtórzeń niż plan | zapis rzeczywistej liczby, status nieudana, dwie sugestie do wyboru | 4/5 | ✅ |
| 16 | Niewykonane wszystkie serie | pozostałe → pominięte przy zakończeniu; brak sugestii zwiększenia ciężaru | 4/5 | ✅ |
| 17 | Dwa treningi jednego dnia | dwie osobne sesje z tą samą datą lokalną; kalendarz pokazuje listę | 4/6 | ✅ |
| 18 | Zmiana strefy czasowej | `localWorkoutDate` zapisane raz przy starcie i nigdy nie przeliczane; dokładny czas w UTC | 4 | ✅ |
| 19 | Timer kończy się w tle | czas liczony z `endsAt`; po powrocie pokazany stan faktyczny | 4 | ✅ |
| 20 | Zablokowany dźwięk | timer działa, sygnał wizualny, informacja jak włączyć dźwięk | 4 | ◐ informacja ✅, niesprawdzone na iOS |
| 21 | Odmowa zgody na powiadomienia | przypomnienia tylko w otwartej aplikacji; brak ponawiania prośby | 7 | ✅ (zgoda tylko po kliknięciu; komunikat w aplikacji zawsze) |
| 22 | Uszkodzony JSON przy imporcie | czytelny błąd, baza nietknięta | 7 | ✅ |
| 23 | Import ze starszej wersji schematu | migracja danych importu do bieżącej wersji przed walidacją; nowsza wersja → odmowa | 7 | ✅ |
| 24 | Import z brakującymi relacjami | odmowa z listą problemów, baza nietknięta | 7 | ✅ |
| 25 | Błąd zapisu / brak miejsca | komunikat `StorageError`, ekran pokazuje stan z bazy, nic nie udaje zapisu | 1+ | ◐ ustawienia ✅ |
| 26 | Brak ilustracji ćwiczenia | neutralny placeholder | 2 | ✅ |
| 27 | Usunięcie planu z zachowaniem historii | sesje zostają (mają własną nazwę i migawki); odwołanie do planu może być puste | 3 | ✅ |
| 28 | Edycja historycznego treningu | ostrzeżenie; statystyki i rekordy liczone z danych, więc od razu aktualne | 6 | ✅ |
| 29 | Zmiana stylu i motywu | natychmiastowa, zapamiętana, bez wpływu na dane | 1 | ✅ |
| 30 | Aktualizacja aplikacji podczas sesji | bez automatycznego przeładowania; komunikat o aktualizacji; baza nie jest kasowana | 8 | ◐ ochrona bazy ✅ |
