# Training Planner

Aplikacja do planowania i zapisywania treningów siłowych. Działa w przeglądarce na telefonie
i komputerze, bez konta i bez serwera – dane są zapisywane lokalnie na urządzeniu.

> **Stan projektu:** ukończone fazy 1–2 z 8. Działa szkielet aplikacji, motywy, instalacja na
> ekranie początkowym i biblioteka ćwiczeń (gotowe i własne). Plany, treningi i statystyki są w budowie.
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

Jeszcze niewdrożone (faza 8): service worker, działanie bez internetu i komunikat o aktualizacji.
Do uruchomienia aplikacji potrzebne jest połączenie z internetem.

## Przechowywanie danych

- Wszystko jest w IndexedDB przeglądarki, pod adresem, z którego otwarto aplikację.
  Nic nie jest wysyłane na żaden serwer.
- Dane są przypisane do adresu i do przeglądarki: inna przeglądarka, inne urządzenie albo inny
  adres strony = osobna, pusta baza.
- Wyczyszczenie danych witryny w przeglądarce usuwa dane aplikacji.
- `localStorage` przechowuje wyłącznie podpowiedź motywu (żeby ekran nie mignął przy starcie).

## Backup

Eksport i import kopii zapasowej (JSON) są zaplanowane na fazę 7 i **jeszcze nie są wdrożone**.

## Znane ograniczenia

- Funkcje treningowe (plany, trening, progresja, historia, pomiary) nie są
  jeszcze wdrożone – ich ekrany mówią o tym wprost.
- iOS: Safari i aplikacja dodana do ekranu początkowego mają osobne dane. Safari może usunąć dane
  strony nieużywanej przez 7 dni (nie dotyczy aplikacji z ekranu początkowego).
- Brak trybu offline i powiadomień (faza 8 i 7); start aplikacji wymaga internetu.
- Pełna lista ryzyk: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#7-ryzyka-i-ograniczenia-platformy).
