# Specyfikacja – wymagania faz 5–8

Wyciąg z „MASTER PROMPT: TRAINING PLANNER PWA” (wklejony przez właściciela na początku projektu).
Zawiera sekcje potrzebne w pozostałych fazach, w brzmieniu specyfikacji. Fazy 1–4 są już
zrobione; ich wymagania opisuje `PROJECT_PROGRESS.md`.

## §9. Silnik progresji treningowej

Zaimplementuj osobny moduł progression-engine. Wszystkie sugestie mają być deterministyczne,
wyjaśnialne i testowalne. Aplikacja nigdy nie zmienia ciężaru ani powtórzeń bez zgody użytkownika.

### 9.1. Double progression

Domyślna metoda: double progression. Przykład: zakres 8–12 powtórzeń, docelowy RIR 2, ciężar 60 kg.
Jeżeli użytkownik osiągnie co najmniej 12 powtórzeń we wszystkich wymaganych seriach roboczych
i spełni warunek RIR, aplikacja może zasugerować zwiększenie ciężaru (12/12/12 przy RIR 2 →
zwiększ ciężar w kolejnym treningu). Jeżeli wynik to 12, 11, 10, nie sugeruj jeszcze zwiększenia
ciężaru – zasugeruj pracę nad liczbą powtórzeń.

- Serie rozgrzewkowe nie uczestniczą w ocenie spełnienia celu.
- Serie pominięte nie mogą być uznane za udane.
- Nie traktuj braku danych RIR jako potwierdzenia spełnienia celu RIR.
- Jeżeli użytkownik nie podał docelowego RIR, stosuj wyłącznie warunek powtórzeń.

### 9.2. Indywidualne skoki ciężaru

Każde ćwiczenie może mieć własny, edytowalny skok progresji (np. 1 / 2,5 / 5 kg).
Nowy ciężar = obecny ciężar + skok ćwiczenia. Uwzględnij precyzję dziesiętną i unikaj błędów
obliczeń zmiennoprzecinkowych. Domyślnie skok 2,5 kg.

### 9.3. Sugestia po nieudanej serii

Cel 60 kg × 12, wykonanie 60 kg × 9. Dwie propozycje:
- **Opcja A: zmniejsz ciężar**, np. 57,5 kg, zachowując pierwotny cel powtórzeń.
- **Opcja B: dostosuj powtórzenia**, np. zostań przy 60 kg i przyjmij cel 9 powtórzeń w kolejnej serii.

To są sugestie, nie gwarancje. Algorytm: porównaj plan z wykonaniem; oblicz różnicę powtórzeń;
uwzględnij aktualny ciężar, dostępny RIR, historię wcześniejszych serii i skok ciężaru;
wygeneruj maksymalnie dwie zrozumiałe sugestie. Obniżka domyślnie o jeden skok, nie poniżej zera.
Sugestia powtórzeń może brać wynik ostatniej serii jako punkt odniesienia. Nie przedstawiaj tych
reguł jako dokładnego modelu fizjologicznego zmęczenia. Przy braku danych – ostrożna sugestia
lub komunikat o niewystarczających danych.

Użytkownik może: zastosować sugestię ciężaru, zastosować sugestię powtórzeń, zignorować sugestię.
**Zastosowanie sugestii aktualizuje tylko wybraną przyszłą serię, nie zakończone serie.**

### 9.4. Sugestie między treningami

Po zakończeniu treningu przeanalizuj każde ćwiczenie. Rekomendacje: zwiększ ciężar; spróbuj
zwiększyć powtórzenia; utrzymaj obecne parametry; rozważ zmniejszenie obciążenia po
powtarzających się niepowodzeniach. W każdej sugestii pokaż uzasadnienie, np. „W trzech seriach
osiągnąłeś 12 powtórzeń przy RIR 2. Możesz spróbować zwiększyć ciężar z 60 do 62,5 kg”.
Nie wprowadzaj automatycznie deloadu ani zmiany planu.

## §10. Zakończenie treningu (pozostałe elementy podsumowania)

Podsumowanie: nazwa, data, start, koniec, łączny czas, liczba ćwiczeń i serii, łączna objętość,
**nowe rekordy osobiste**, trenowane partie mięśniowe, **porównanie z poprzednim treningiem**,
notatka, ocena samopoczucia 1–5 z opcjonalnym komentarzem.

Objętość = ciężar × wykonane powtórzenia; bez rozgrzewki i pominiętych; nieudana seria liczy się
według rzeczywistego wyniku; czas i dystans osobno; masy ciała nie dodawać bez zdefiniowanej metody.

## §11. Historia treningów (faza 6)

Lista zakończonych treningów: data, nazwa, czas trwania, liczba ćwiczeń, objętość robocza,
informacja o rekordach. Filtry: zakres dat, plan, rodzaj treningu, ćwiczenie. Szczegóły sesji
z dokładnym zapisem każdej serii. Edycja historycznej sesji z ostrzeżeniem, że wpływa na
statystyki i rekordy; po zmianie przelicz zależne statystyki. Historia nie zmienia się po edycji
szablonu planu.

## §12. Statystyki i rekordy (faza 6)

Ogólne: liczba treningów, treningi tygodniowo, łączny czas, objętość robocza, najczęstsze
ćwiczenia, historia aktywności.

Ćwiczenie: historia ciężaru, historia powtórzeń, największy ciężar, największa liczba powtórzeń,
objętość w kolejnych sesjach, szacowane 1RM, historia rekordów. Wykresy z zakresami czasu.
Nie łącz na jednym wykresie niezgodnych jednostek bez oznaczenia.

Rekordy osobiste – rozróżniaj: największy ciężar (≥ 1 poprawnie zapisane powtórzenie);
najwięcej powtórzeń przy określonym ciężarze; największa objętość pojedynczej serii; największa
objętość robocza w sesji; najwyższe szacowane 1RM. Epley: e1RM = ciężar × (1 + powtórzenia / 30),
wyraźnie oznaczone jako szacunkowe, tylko dla sensownego zakresu powtórzeń (np. 1–10); e1RM to nie
podniesiony ciężar.

## §13. Kalendarz (faza 6)

Kalendarz miesięczny: dni z zakończonym treningiem, dni z zaplanowanym treningiem, dzień
dzisiejszy. Kliknięcie daty otwiera treningi; wiele treningów jednego dnia. Przypisanie do
lokalnej daty startu (`localWorkoutDate`); zmiana strefy czasowej nie zmienia historycznej daty.

## §14. Pomiary ciała (faza 6)

Masa ciała (kg); obwody (cm): talia, klatka, ramię, udo, biodra, łydka. Wpis: id, data, wartości,
opcjonalna notatka. Żadne pole nie jest wymagane. Wykres masy ciała i osobne wykresy obwodów.
Edycja i usuwanie.

## §15. Przypomnienia (faza 7)

Włącz/wyłącz, godzina, wyprzedzenie przed treningiem. Nie obiecuj niezawodnych powiadomień w tle
bez serwera i push. Przypomnienia podczas działania aplikacji + Notification API, jeśli dostępne.
Zgoda tylko po świadomej akcji użytkownika. Informacja o ograniczeniach na iOS. Żadnego
fikcyjnego systemu, który wygląda na aktywny, a nie zadziała.

## §16. PWA (faza 8)

Manifest, ikony (w tym maskable), theme color, standalone, service worker, HTTPS, poprawna obsługa
aktualizacji, responsywność. Pełny offline nie jest wymagany; cache zasobów bez obietnicy działania
wszystkiego offline. Aktualizacja nie może usuwać bazy. Bez wymuszonego przeładowania podczas
aktywnego treningu – komunikat i zastosowanie w bezpiecznym momencie.

## §19. Backup JSON (faza 7)

Eksport („Eksportuj dane”): plany, dni, ćwiczenia, serie planowane, historia sesji, wyniki,
pomiary, ustawienia, własne ilustracje (Base64 z kontrolą rozmiaru). Format: JSON z numerem
wersji schematu, datą eksportu i metadanymi aplikacji. Nazwa np. `training-backup-2026-11-16.json`.

Import: odczytaj plik → sprawdź JSON → zweryfikuj wersję → zweryfikuj strukturę Zod → sprawdź
relacje → pokaż podsumowanie → poproś o potwierdzenie. Domyślnie bezpieczne zastąpienie danych po
potwierdzeniu; przed zastąpieniem możliwość zrobienia kopii obecnej bazy. Import w całości
transakcyjny – bez częściowo zaimportowanych danych. Nie wykonuj kodu ani nie interpretuj HTML
z pliku. Test eksportu i ponownego importu z porównaniem danych.

## §23. Testy akceptacyjne pozostałych faz

- **C – Progresja:** 3 serie, 8–12 powt., 60 kg, RIR 2; wyniki 12/12/12, RIR 2/2/2; skok 2,5 kg →
  sugestia 62,5 kg.
- **D – Brak progresji:** wyniki 12/11/10 → brak sugestii zwiększenia ciężaru, sugestia poprawy
  powtórzeń.
- **E – Nieudana seria:** cel 60 kg × 12, wynik 60 kg × 9 → dwie propozycje (zmniejszenie ciężaru,
  dostosowanie powtórzeń); żadna nie jest stosowana automatycznie.
- **G – Backup:** plany, treningi, pomiary → eksport → wyczyść bazę testową → import → odtworzone
  wszystkie dane i relacje.
- **I – Historia:** wykonaj trening, zapisz rekord, edytuj historyczną serię → rekordy i wykresy
  przeliczone.
