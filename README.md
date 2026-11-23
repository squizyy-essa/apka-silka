# Training Planner

Aplikacja do planowania i zapisywania treningów siłowych. Działa w przeglądarce na telefonie
i komputerze, bez konta i bez serwera – dane są zapisywane lokalnie na urządzeniu.

> **Stan projektu:** ukończone wszystkie 8 faz. Działa biblioteka ćwiczeń, kreator planów,
> wykonywanie treningów, progresja, historia z edycją, statystyki i rekordy, kalendarz,
> pomiary ciała, podsumowanie aktywności na Pulpicie, ustawienia timera, przypomnienia
> i kopia zapasowa JSON. Service worker pozwala otworzyć aplikację bez internetu po pierwszym załadowaniu.
> Szczegóły: [`PROJECT_PROGRESS.md`](PROJECT_PROGRESS.md), plan: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Wymagania

- Node.js 22 lub nowszy, npm 10+
- Do testów e2e: Google Chrome (albo `npx playwright install chromium` i `PW_BROWSER=bundled`)

## Instalacja i uruchamianie

```bash
npm install
npm run dev        # serwer deweloperski, adres pojawi się w terminalu
```

## Testowanie

```bash
npm run typecheck  # TypeScript (strict)
npm run lint       # ESLint
npm test           # testy jednostkowe i komponentowe (Vitest)
npm run test:e2e   # testy w prawdziwej przeglądarce na buildzie produkcyjnym (Playwright)
npm run check      # typecheck + lint + test + build
```

## Budowanie produkcyjne

```bash
npm run build      # wynik w katalogu dist/
npm run preview    # podgląd builda lokalnie
```

Katalog `dist/` to zwykłe pliki statyczne. Można je wrzucić na dowolny hosting z HTTPS.

### Publikacja na GitHub Pages

Repozytorium zawiera workflow `.github/workflows/deploy.yml`, który po każdym pushu do `main`
sprawdza projekt i publikuje go. Jednorazowo trzeba włączyć Pages:
**Settings → Pages → Build and deployment → Source: „GitHub Actions”**.
Adres aplikacji: `https://<użytkownik>.github.io/<repozytorium>/`.

## Instalowanie na telefonie

**iPhone / iPad:** otwórz adres aplikacji w **Safari** → przycisk Udostępnij → „Dodaj do ekranu
początkowego”. Aplikacja dostaje własną ikonę i otwiera się na pełnym ekranie.

**Android (Chrome):** menu ⋮ → „Dodaj do ekranu głównego” / „Zainstaluj aplikację”.

Aplikacja uruchomiona z ikony ma na iPhonie **osobne dane** niż ta sama strona w Safari.

Gdy zostanie opublikowana nowsza wersja, aplikacja pokaże pasek „Dostępna jest nowsza wersja”
z przyciskiem „Odśwież” (sama się nie przeładowuje).

Service worker zapisuje na urządzeniu pliki aplikacji, więc po pierwszym załadowaniu (z internetem)
aplikacja powinna otwierać się także bez sieci; dane i tak są lokalne. Nie jest to gwarancja dla
każdej przeglądarki, a nowe wersje pobierają się tylko z internetem. Nowa wersja nie podmienia się
sama: pasek „Odśwież” podmienia ją na życzenie, a w trakcie treningu przycisk jest wyłączony do
jego zakończenia. Aktualizacja nie dotyka bazy danych.

## Przechowywanie danych

- Wszystko jest w IndexedDB przeglądarki, pod adresem, z którego otwarto aplikację.
  Nic nie jest wysyłane na żaden serwer.
- Dane są przypisane do adresu i do przeglądarki: inna przeglądarka, inne urządzenie albo inny
  adres strony = osobna, pusta baza.
- Wyczyszczenie danych witryny w przeglądarce usuwa dane aplikacji.
- `localStorage` przechowuje wyłącznie podpowiedź motywu (żeby ekran nie mignął przy starcie).

## Backup

Ustawienia → „Kopia zapasowa”:

- **Eksportuj dane** zapisuje plik `training-backup-RRRR-MM-DD.json` (plany, treningi, wyniki, pomiary,
  własne ćwiczenia z ilustracjami, ustawienia; numer wersji schematu, data i wersja aplikacji).
- **Importuj dane z pliku** sprawdza plik (JSON, wersja, struktura, powiązania), pokazuje
  podsumowanie i dopiero po potwierdzeniu **zastępuje wszystkie dane**. Jest to operacja
  „wszystko albo nic”; błędny plik niczego nie zmienia. Przed zastąpieniem można pobrać kopię
  obecnych danych.
- Kopię warto robić regularnie: to jedyna kopia danych, które są tylko w tej przeglądarce.

## Znane ograniczenia

- Pierwszy zapisany wynik ćwiczenia jest punktem odniesienia, a nie rekordem. Rekord e1RM to
  szacunek (wzór Epleya, 1–10 powtórzeń). Wykresy i rekordy powstają wyłącznie z zapisanych serii.
- Sugestie progresji to proste, jawne reguły oparte na zapisanych wynikach, a nie model zmęczenia.
  Aplikacja niczego nie zmienia bez Twojej decyzji.
- iOS: Safari i aplikacja dodana do ekranu początkowego mają osobne dane. Safari może usunąć dane
  strony nieużywanej przez 7 dni (nie dotyczy aplikacji z ekranu początkowego).
- Przypomnienia działają tylko, gdy aplikacja jest otwarta (brak serwera i powiadomień push);
  zamknięta aplikacja nic nie wyśle. Na iPhonie powiadomienia systemowe wymagają aplikacji
  z ekranu początkowego, a komunikat w aplikacji pokazuje się zawsze.
- Pierwsze uruchomienie wymaga internetu (pobranie plików aplikacji); potem aplikacja zwykle działa bez sieci.
- Pełna lista ryzyk: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#7-ryzyka-i-ograniczenia-platformy).
