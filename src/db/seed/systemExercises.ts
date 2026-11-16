import type { EquipmentType, ExerciseCategory, MeasurementType, MuscleGroup } from '@/shared/domain';

/**
 * Built-in exercise library (own descriptions, no third-party content).
 *
 * RULES:
 * - `id` values are permanent: plans and workout history refer to them.
 *   Never change or reuse an id; to retire an exercise, leave its entry.
 * - After changing any entry, bump SYSTEM_EXERCISES_REVISION so existing
 *   installations pick the change up on the next start.
 */
export interface SystemExerciseSeed {
  readonly id: string;
  readonly name: string;
  readonly category: ExerciseCategory;
  readonly primaryMuscle: MuscleGroup;
  readonly secondaryMuscles: readonly MuscleGroup[];
  readonly equipment: EquipmentType;
  readonly measurementType: MeasurementType;
  readonly description: string;
}

/** Used as createdAt/updatedAt of system exercises. */
export const SYSTEM_EXERCISES_REVISION = '2026-11-16T00:00:00.000Z';

export const SYSTEM_EXERCISES: readonly SystemExerciseSeed[] = [
  {
    id: 'c473bf78-99c4-4396-a287-cc2a1b78088c',
    name: 'Wyciskanie sztangi na ławce poziomej',
    category: 'compound',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
    equipment: 'barbell',
    measurementType: 'weight_reps',
    description:
      'Leżąc na ławce, opuść sztangę do środka klatki i wyciśnij ją do wyprostu ramion. Łopatki ściągnięte, stopy stabilnie na podłodze.',
  },
  {
    id: '063a9578-b0d8-4a68-a75c-53ef0175d6ce',
    name: 'Wyciskanie sztangi na ławce skośnej',
    category: 'compound',
    primaryMuscle: 'chest',
    secondaryMuscles: ['shoulders', 'triceps'],
    equipment: 'barbell',
    measurementType: 'weight_reps',
    description:
      'Ławka ustawiona skosem w górę. Opuść sztangę do górnej części klatki i wyciśnij do wyprostu ramion.',
  },
  {
    id: '16e370ee-ca20-4b53-b972-495bc84cabd2',
    name: 'Wyciskanie hantli na ławce poziomej',
    category: 'compound',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
    equipment: 'dumbbell',
    measurementType: 'weight_reps',
    description:
      'Leżąc na ławce, opuść hantle na boki klatki i wyciśnij je nad klatkę, prowadząc ruch pod kontrolą.',
  },
  {
    id: '08d84c62-cefd-4ba9-b446-e91cb11555eb',
    name: 'Wyciskanie hantli na ławce skośnej',
    category: 'compound',
    primaryMuscle: 'chest',
    secondaryMuscles: ['shoulders', 'triceps'],
    equipment: 'dumbbell',
    measurementType: 'weight_reps',
    description:
      'Na ławce skośnej opuść hantle do wysokości górnej części klatki i wyciśnij je w górę.',
  },
  {
    id: 'b3a10c0f-3824-49fa-ae77-02742876f8d0',
    name: 'Wyciskanie na maszynie siedząc',
    category: 'compound',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
    equipment: 'machine',
    measurementType: 'weight_reps',
    description:
      'Siedząc z plecami przy oparciu, wypchnij uchwyty przed siebie i powoli wróć do pozycji wyjściowej.',
  },
  {
    id: 'ed1ec8dd-8983-4ee9-bd1c-16eabb4d24e9',
    name: 'Rozpiętki z hantlami',
    category: 'isolation',
    primaryMuscle: 'chest',
    secondaryMuscles: ['shoulders'],
    equipment: 'dumbbell',
    measurementType: 'weight_reps',
    description:
      'Leżąc na ławce z lekko ugiętymi łokciami, opuść hantle szerokim łukiem na boki i wróć tym samym torem.',
  },
  {
    id: 'ef7c6ea8-091c-4355-87bc-40e7a697b480',
    name: 'Rozpiętki na maszynie',
    category: 'isolation',
    primaryMuscle: 'chest',
    secondaryMuscles: ['shoulders'],
    equipment: 'machine',
    measurementType: 'weight_reps',
    description:
      'Siedząc na maszynie, zbliż ramiona przed klatką szerokim łukiem i powoli wróć.',
  },
  {
    id: 'b3916876-681b-456b-b028-5ecfa7c0e651',
    name: 'Krzyżowanie linek wyciągu',
    category: 'isolation',
    primaryMuscle: 'chest',
    secondaryMuscles: ['shoulders'],
    equipment: 'cable',
    measurementType: 'weight_reps',
    description:
      'Stojąc między wyciągami, ściągnij uchwyty łukiem przed klatkę, zatrzymaj na chwilę i wróć pod kontrolą.',
  },
  {
    id: '582ddba3-0b56-47d6-8a40-889896bac7f1',
    name: 'Pompki',
    category: 'compound',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps', 'shoulders', 'abs'],
    equipment: 'bodyweight',
    measurementType: 'bodyweight_reps',
    description:
      'W podporze przodem opuść klatkę tuż nad podłogę i wypchnij ciało w górę. Tułów i nogi w jednej linii.',
  },
  {
    id: 'bb05cf78-8e0a-4ae4-af8a-8a237ee1acb0',
    name: 'Pompki na poręczach',
    category: 'compound',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
    equipment: 'bodyweight',
    measurementType: 'bodyweight_reps',
    description:
      'W podporze na poręczach ugnij ramiona, lekko pochylając tułów, i wypchnij ciało do wyprostu łokci.',
  },
  {
    id: '224de5ca-09bd-4c19-b291-c9fb6fe2a9c1',
    name: 'Podciąganie na drążku nachwytem',
    category: 'compound',
    primaryMuscle: 'back',
    secondaryMuscles: ['biceps', 'forearms'],
    equipment: 'bodyweight',
    measurementType: 'bodyweight_reps',
    description:
      'Ze zwisu nachwytem podciągnij się, aż broda znajdzie się nad drążkiem, i opuść się do pełnego wyprostu ramion.',
  },
  {
    id: '65f4b4c6-37a9-4691-b2b3-a4c99e119663',
    name: 'Podciąganie na drążku podchwytem',
    category: 'compound',
    primaryMuscle: 'back',
    secondaryMuscles: ['biceps', 'forearms'],
    equipment: 'bodyweight',
    measurementType: 'bodyweight_reps',
    description:
      'Ze zwisu podchwytem podciągnij się do drążka i opuść pod kontrolą. Mocniej angażuje biceps.',
  },
  {
    id: 'e51902ab-0925-4046-9f31-e6f759f7f2c1',
    name: 'Ściąganie drążka wyciągu górnego do klatki',
    category: 'compound',
    primaryMuscle: 'back',
    secondaryMuscles: ['biceps'],
    equipment: 'cable',
    measurementType: 'weight_reps',
    description:
      'Siedząc, ściągnij drążek do górnej części klatki, prowadząc łokcie w dół, i powoli wróć.',
  },
  {
    id: '874d1364-cd68-4065-8905-64e2be301d3b',
    name: 'Wiosłowanie sztangą w opadzie tułowia',
    category: 'compound',
    primaryMuscle: 'back',
    secondaryMuscles: ['biceps', 'hamstrings'],
    equipment: 'barbell',
    measurementType: 'weight_reps',
    description:
      'W opadzie z prostymi plecami przyciągnij sztangę do brzucha i opuść ją do wyprostu ramion.',
  },
  {
    id: '50d85624-f553-4f54-a920-7111fa565f79',
    name: 'Wiosłowanie hantlą jednorącz',
    category: 'compound',
    primaryMuscle: 'back',
    secondaryMuscles: ['biceps'],
    equipment: 'dumbbell',
    measurementType: 'weight_reps',
    description:
      'Opierając kolano i dłoń o ławkę, przyciągnij hantlę do biodra i opuść ją pod kontrolą.',
  },
  {
    id: 'b4567175-59bf-45c8-8603-3b0c93e42cdb',
    name: 'Przyciąganie uchwytu wyciągu dolnego siedząc',
    category: 'compound',
    primaryMuscle: 'back',
    secondaryMuscles: ['biceps'],
    equipment: 'cable',
    measurementType: 'weight_reps',
    description:
      'Siedząc z prostymi plecami, przyciągnij uchwyt do brzucha, ściągając łopatki, i wróć powoli.',
  },
  {
    id: '7b00b123-2946-4ffa-8d0b-7ce7c21d72b4',
    name: 'Wiosłowanie na maszynie',
    category: 'compound',
    primaryMuscle: 'back',
    secondaryMuscles: ['biceps'],
    equipment: 'machine',
    measurementType: 'weight_reps',
    description:
      'Z klatką przy oparciu przyciągnij uchwyty do tułowia i powoli wyprostuj ramiona.',
  },
  {
    id: 'bcb33d86-6b22-45a7-9195-1ea17dddd184',
    name: 'Martwy ciąg',
    category: 'compound',
    primaryMuscle: 'back',
    secondaryMuscles: ['glutes', 'hamstrings', 'forearms'],
    equipment: 'barbell',
    measurementType: 'weight_reps',
    description:
      'Z prostymi plecami podnieś sztangę z podłogi do pełnego wyprostu bioder i kolan, po czym odłóż ją pod kontrolą.',
  },
  {
    id: '2c685a28-f295-45fc-839e-e76d5a71a280',
    name: 'Wyprosty tułowia na ławce rzymskiej',
    category: 'isolation',
    primaryMuscle: 'back',
    secondaryMuscles: ['glutes', 'hamstrings'],
    equipment: 'bodyweight',
    measurementType: 'bodyweight_reps',
    description:
      'Z biodrami opartymi o ławkę opuść tułów i unieś go do linii prostej z nogami.',
  },
  {
    id: 'f18664e3-e0b7-4996-94e1-578811adde1d',
    name: 'Szrugsy z hantlami',
    category: 'isolation',
    primaryMuscle: 'back',
    secondaryMuscles: ['forearms'],
    equipment: 'dumbbell',
    measurementType: 'weight_reps',
    description:
      'Stojąc z hantlami wzdłuż tułowia, unieś barki możliwie wysoko i powoli opuść.',
  },
  {
    id: '38d24f9b-4645-494b-9d9d-b54424e5ac21',
    name: 'Wyciskanie żołnierskie sztangi stojąc',
    category: 'compound',
    primaryMuscle: 'shoulders',
    secondaryMuscles: ['triceps', 'abs'],
    equipment: 'barbell',
    measurementType: 'weight_reps',
    description:
      'Stojąc, wyciśnij sztangę z wysokości obojczyków nad głowę do wyprostu ramion. Brzuch i pośladki napięte.',
  },
  {
    id: 'db515a6d-de2d-4ec7-90c7-e7206b5b3080',
    name: 'Wyciskanie hantli nad głowę siedząc',
    category: 'compound',
    primaryMuscle: 'shoulders',
    secondaryMuscles: ['triceps'],
    equipment: 'dumbbell',
    measurementType: 'weight_reps',
    description:
      'Siedząc z oparciem, wyciśnij hantle z wysokości uszu nad głowę i opuść je pod kontrolą.',
  },
  {
    id: '4c751b77-b64f-4cee-b53b-24f767335a48',
    name: 'Wznosy hantli bokiem',
    category: 'isolation',
    primaryMuscle: 'shoulders',
    secondaryMuscles: [],
    equipment: 'dumbbell',
    measurementType: 'weight_reps',
    description:
      'Stojąc, unieś hantle bokiem do wysokości barków z lekko ugiętymi łokciami i powoli opuść.',
  },
  {
    id: '5c9d7dc1-0d44-45b2-8d12-2f735e1e8e32',
    name: 'Wznosy hantli w opadzie tułowia',
    category: 'isolation',
    primaryMuscle: 'shoulders',
    secondaryMuscles: ['back'],
    equipment: 'dumbbell',
    measurementType: 'weight_reps',
    description:
      'W opadzie tułowia unieś hantle na boki, prowadząc ruch tylną częścią barków.',
  },
  {
    id: '62296a34-7936-40c3-a5b0-f89b77e55d71',
    name: 'Wznosy ramienia bokiem na wyciągu',
    category: 'isolation',
    primaryMuscle: 'shoulders',
    secondaryMuscles: [],
    equipment: 'cable',
    measurementType: 'weight_reps',
    description:
      'Stojąc bokiem do wyciągu dolnego, unieś ramię do wysokości barku i opuść pod kontrolą.',
  },
  {
    id: '0e8cf54e-a507-405f-b936-65deef756ba8',
    name: 'Przyciąganie liny do twarzy',
    category: 'isolation',
    primaryMuscle: 'shoulders',
    secondaryMuscles: ['back'],
    equipment: 'cable',
    measurementType: 'weight_reps',
    description:
      'Przyciągnij linę wyciągu na wysokość twarzy, rozchylając końce i prowadząc łokcie wysoko.',
  },
  {
    id: '706ed34c-1cd2-4f8f-8031-e308d40fbf33',
    name: 'Podciąganie sztangi wzdłuż tułowia',
    category: 'compound',
    primaryMuscle: 'shoulders',
    secondaryMuscles: ['back', 'biceps'],
    equipment: 'barbell',
    measurementType: 'weight_reps',
    description:
      'Stojąc, podciągnij sztangę wzdłuż tułowia do wysokości klatki, prowadząc łokcie w górę.',
  },
  {
    id: '99ad2f80-9e62-43c5-bae5-01e119a23ac4',
    name: 'Uginanie ramion ze sztangą stojąc',
    category: 'isolation',
    primaryMuscle: 'biceps',
    secondaryMuscles: ['forearms'],
    equipment: 'barbell',
    measurementType: 'weight_reps',
    description:
      'Stojąc z łokciami przy tułowiu, ugnij ramiona ze sztangą i opuść ją do pełnego wyprostu.',
  },
  {
    id: '4e19553e-7d92-4430-8b1e-9972a92f40ab',
    name: 'Uginanie ramion z hantlami z supinacją',
    category: 'isolation',
    primaryMuscle: 'biceps',
    secondaryMuscles: ['forearms'],
    equipment: 'dumbbell',
    measurementType: 'weight_reps',
    description:
      'Uginając ramię, obracaj dłoń wnętrzem do góry. Opuszczaj hantle powoli.',
  },
  {
    id: '97b94c2f-26dd-4f94-8fdb-04f53785b6f4',
    name: 'Uginanie młotkowe z hantlami',
    category: 'isolation',
    primaryMuscle: 'biceps',
    secondaryMuscles: ['forearms'],
    equipment: 'dumbbell',
    measurementType: 'weight_reps',
    description:
      'Uginaj ramiona z hantlami trzymanymi chwytem neutralnym (kciuki do góry).',
  },
  {
    id: 'fce5f998-9b9e-4bee-88bb-c22dc04e9e41',
    name: 'Uginanie ramion na modlitewniku',
    category: 'isolation',
    primaryMuscle: 'biceps',
    secondaryMuscles: ['forearms'],
    equipment: 'barbell',
    measurementType: 'weight_reps',
    description:
      'Z ramionami opartymi o modlitewnik ugnij ręce ze sztangą i opuść ją bez odrywania łokci.',
  },
  {
    id: '89019aa8-4a59-489a-9811-e9845374d0ea',
    name: 'Uginanie ramion na wyciągu dolnym',
    category: 'isolation',
    primaryMuscle: 'biceps',
    secondaryMuscles: ['forearms'],
    equipment: 'cable',
    measurementType: 'weight_reps',
    description:
      'Stojąc przodem do wyciągu dolnego, ugnij ramiona z drążkiem i wróć pod kontrolą.',
  },
  {
    id: '2603484d-c3a8-4cbc-9948-b50f87db20ae',
    name: 'Prostowanie ramion na wyciągu górnym',
    category: 'isolation',
    primaryMuscle: 'triceps',
    secondaryMuscles: [],
    equipment: 'cable',
    measurementType: 'weight_reps',
    description:
      'Z łokciami przy tułowiu wyprostuj ramiona, ściągając drążek w dół, i powoli wróć.',
  },
  {
    id: 'ccfcc800-bc59-4280-872e-b6124c10f31b',
    name: 'Prostowanie ramion z liną na wyciągu',
    category: 'isolation',
    primaryMuscle: 'triceps',
    secondaryMuscles: [],
    equipment: 'cable',
    measurementType: 'weight_reps',
    description:
      'Ściągnij linę w dół do wyprostu ramion, na końcu rozchylając jej końce na boki.',
  },
  {
    id: 'af40b925-702a-475d-9acd-596e9337fd88',
    name: 'Wyciskanie francuskie sztangi leżąc',
    category: 'isolation',
    primaryMuscle: 'triceps',
    secondaryMuscles: [],
    equipment: 'barbell',
    measurementType: 'weight_reps',
    description:
      'Leżąc, opuść sztangę za czoło, zginając tylko łokcie, i wyprostuj ramiona.',
  },
  {
    id: '8875c8e9-95b7-40e3-abf6-e01778985dce',
    name: 'Prostowanie ramienia z hantlą zza głowy',
    category: 'isolation',
    primaryMuscle: 'triceps',
    secondaryMuscles: [],
    equipment: 'dumbbell',
    measurementType: 'weight_reps',
    description:
      'Trzymając hantlę nad głową, opuść ją za głowę, zginając łokieć, i wyprostuj ramię.',
  },
  {
    id: '5fc7c83e-00d7-4157-ac75-ae28d4afd310',
    name: 'Wyciskanie sztangi wąskim chwytem',
    category: 'compound',
    primaryMuscle: 'triceps',
    secondaryMuscles: ['chest', 'shoulders'],
    equipment: 'barbell',
    measurementType: 'weight_reps',
    description:
      'Leżąc na ławce, wyciskaj sztangę chwytem na szerokość barków, prowadząc łokcie blisko tułowia.',
  },
  {
    id: '4e25b81a-fe69-4ab0-af50-076c7b4bc6c5',
    name: 'Uginanie nadgarstków ze sztangą',
    category: 'isolation',
    primaryMuscle: 'forearms',
    secondaryMuscles: [],
    equipment: 'barbell',
    measurementType: 'weight_reps',
    description:
      'Z przedramionami opartymi o ławkę uginaj same nadgarstki, unosząc i opuszczając sztangę.',
  },
  {
    id: 'c5ecf784-8f0d-4eca-95ca-0ec564f95e42',
    name: 'Spacer farmera',
    category: 'compound',
    primaryMuscle: 'forearms',
    secondaryMuscles: ['back', 'abs'],
    equipment: 'dumbbell',
    measurementType: 'distance',
    description:
      'Idź wyprostowany, niosąc ciężar w obu dłoniach. Zapisz pokonany dystans.',
  },
  {
    id: '2c71af55-06a8-4cd3-9fc6-01f8745a8212',
    name: 'Przysiad ze sztangą na plecach',
    category: 'compound',
    primaryMuscle: 'quadriceps',
    secondaryMuscles: ['glutes', 'hamstrings', 'abs'],
    equipment: 'barbell',
    measurementType: 'weight_reps',
    description:
      'Ze sztangą na barkach zejdź w przysiad co najmniej do równoległości ud z podłogą i wstań, utrzymując proste plecy.',
  },
  {
    id: '42bcec58-cd59-49d3-8de6-f1fb29fc795c',
    name: 'Przysiad przedni ze sztangą',
    category: 'compound',
    primaryMuscle: 'quadriceps',
    secondaryMuscles: ['glutes', 'abs'],
    equipment: 'barbell',
    measurementType: 'weight_reps',
    description:
      'Ze sztangą opartą z przodu na barkach wykonaj przysiad z wyprostowanym tułowiem i wysoko uniesionymi łokciami.',
  },
  {
    id: '9e442a83-38d4-4e7b-b30d-e2ab827c6f0b',
    name: 'Wypychanie nóg na suwnicy',
    category: 'compound',
    primaryMuscle: 'quadriceps',
    secondaryMuscles: ['glutes', 'hamstrings'],
    equipment: 'machine',
    measurementType: 'weight_reps',
    description:
      'Wypchnij platformę do niemal pełnego wyprostu nóg i opuść ją pod kontrolą. Nie blokuj kolan.',
  },
  {
    id: '865c26fc-e3f6-40f1-ba91-e520c6d79354',
    name: 'Hack przysiad na maszynie',
    category: 'compound',
    primaryMuscle: 'quadriceps',
    secondaryMuscles: ['glutes'],
    equipment: 'machine',
    measurementType: 'weight_reps',
    description:
      'Z plecami przy oparciu maszyny zejdź w przysiad i wypchnij ciężar nogami.',
  },
  {
    id: '0551467c-1e48-4046-afc5-e1ba7d2cfb17',
    name: 'Prostowanie nóg na maszynie',
    category: 'isolation',
    primaryMuscle: 'quadriceps',
    secondaryMuscles: [],
    equipment: 'machine',
    measurementType: 'weight_reps',
    description:
      'Siedząc, wyprostuj nogi w kolanach, zatrzymaj na chwilę i powoli opuść.',
  },
  {
    id: '9de84a61-3afa-47e9-800f-d2d1aace3584',
    name: 'Wykroki z hantlami',
    category: 'compound',
    primaryMuscle: 'quadriceps',
    secondaryMuscles: ['glutes', 'hamstrings'],
    equipment: 'dumbbell',
    measurementType: 'weight_reps',
    description:
      'Zrób krok w przód i opuść tylne kolano tuż nad podłogę, po czym wróć do pozycji stojącej.',
  },
  {
    id: '570ed298-2894-4b1a-9ec1-d8a2ac59e749',
    name: 'Przysiad bułgarski z hantlami',
    category: 'compound',
    primaryMuscle: 'quadriceps',
    secondaryMuscles: ['glutes', 'hamstrings'],
    equipment: 'dumbbell',
    measurementType: 'weight_reps',
    description:
      'Z tylną stopą opartą o ławkę zejdź w przysiad na nodze wykrocznej i wstań.',
  },
  {
    id: 'aa37bc4c-2fc3-42ff-a50c-b001a2d773e2',
    name: 'Przysiad goblet z kettlebell',
    category: 'compound',
    primaryMuscle: 'quadriceps',
    secondaryMuscles: ['glutes', 'abs'],
    equipment: 'kettlebell',
    measurementType: 'weight_reps',
    description:
      'Trzymając kettlebell przy klatce, wykonaj głęboki przysiad z wyprostowanym tułowiem.',
  },
  {
    id: '9928fcbc-18c1-4a50-b260-3e1ef8c53782',
    name: 'Martwy ciąg rumuński',
    category: 'compound',
    primaryMuscle: 'hamstrings',
    secondaryMuscles: ['glutes', 'back'],
    equipment: 'barbell',
    measurementType: 'weight_reps',
    description:
      'Z lekko ugiętymi kolanami cofaj biodra, opuszczając sztangę wzdłuż nóg, i wróć do wyprostu.',
  },
  {
    id: 'bd20e0fb-47ea-4f02-a30b-617693626ef1',
    name: 'Uginanie nóg leżąc na maszynie',
    category: 'isolation',
    primaryMuscle: 'hamstrings',
    secondaryMuscles: ['calves'],
    equipment: 'machine',
    measurementType: 'weight_reps',
    description:
      'Leżąc przodem, przyciągnij wałek do pośladków i powoli wyprostuj nogi.',
  },
  {
    id: 'e0b429ea-59d8-4ee7-bfc5-c564004128ee',
    name: 'Uginanie nóg siedząc na maszynie',
    category: 'isolation',
    primaryMuscle: 'hamstrings',
    secondaryMuscles: ['calves'],
    equipment: 'machine',
    measurementType: 'weight_reps',
    description:
      'Siedząc, ugnij nogi, ściągając wałek pod siedzisko, i wróć pod kontrolą.',
  },
  {
    id: '86cd3d20-17a2-45df-b14b-3fa095ab4c40',
    name: 'Skłony ze sztangą (dzień dobry)',
    category: 'compound',
    primaryMuscle: 'hamstrings',
    secondaryMuscles: ['glutes', 'back'],
    equipment: 'barbell',
    measurementType: 'weight_reps',
    description:
      'Ze sztangą na barkach pochyl tułów w przód, cofając biodra, i wróć do pozycji stojącej. Plecy proste.',
  },
  {
    id: '2c56990c-e05e-4d0a-a790-df6c261f8af8',
    name: 'Hip thrust ze sztangą',
    category: 'compound',
    primaryMuscle: 'glutes',
    secondaryMuscles: ['hamstrings'],
    equipment: 'barbell',
    measurementType: 'weight_reps',
    description:
      'Z łopatkami opartymi o ławkę unieś biodra ze sztangą do linii tułowia i opuść je pod kontrolą.',
  },
  {
    id: 'f32a3524-7d8c-4af2-823b-043f535f7403',
    name: 'Odwodzenie nóg na maszynie',
    category: 'isolation',
    primaryMuscle: 'glutes',
    secondaryMuscles: [],
    equipment: 'machine',
    measurementType: 'weight_reps',
    description:
      'Siedząc na maszynie, rozsuń nogi na zewnątrz wbrew oporowi i powoli wróć.',
  },
  {
    id: 'cd52aff6-5018-49af-9004-89bd8438c399',
    name: 'Wyprost nogi w tył na wyciągu',
    category: 'isolation',
    primaryMuscle: 'glutes',
    secondaryMuscles: ['hamstrings'],
    equipment: 'cable',
    measurementType: 'weight_reps',
    description:
      'Z opaską na kostce odwiedź prostą nogę w tył, napinając pośladek, i wróć.',
  },
  {
    id: 'a2853238-6956-41f6-8461-fe52295b1c8a',
    name: 'Swing z kettlebell',
    category: 'compound',
    primaryMuscle: 'glutes',
    secondaryMuscles: ['hamstrings', 'back', 'shoulders'],
    equipment: 'kettlebell',
    measurementType: 'weight_reps',
    description:
      'Dynamicznym wyprostem bioder wyrzuć kettlebell przed siebie do wysokości klatki i pozwól mu opaść między nogi.',
  },
  {
    id: '6317566f-fc92-4d0e-bf12-187b8ed0e563',
    name: 'Wspięcia na palce stojąc',
    category: 'isolation',
    primaryMuscle: 'calves',
    secondaryMuscles: [],
    equipment: 'machine',
    measurementType: 'weight_reps',
    description:
      'Stojąc, unieś pięty możliwie wysoko, zatrzymaj na chwilę i opuść je poniżej poziomu palców.',
  },
  {
    id: '6260c650-a297-4300-8bab-15a1c9c5b994',
    name: 'Wspięcia na palce siedząc',
    category: 'isolation',
    primaryMuscle: 'calves',
    secondaryMuscles: [],
    equipment: 'machine',
    measurementType: 'weight_reps',
    description:
      'Siedząc z obciążeniem na kolanach, unoś i opuszczaj pięty w pełnym zakresie.',
  },
  {
    id: 'bc1a390f-679b-4b5f-bd7a-fe5e20afc220',
    name: 'Wspięcia na palce na suwnicy',
    category: 'isolation',
    primaryMuscle: 'calves',
    secondaryMuscles: [],
    equipment: 'machine',
    measurementType: 'weight_reps',
    description:
      'Na suwnicy wypychaj platformę samymi palcami stóp, przy niemal prostych kolanach.',
  },
  {
    id: 'b63c9982-66ac-49d5-9028-75c14b79faa6',
    name: 'Deska (plank)',
    category: 'isolation',
    primaryMuscle: 'abs',
    secondaryMuscles: ['shoulders'],
    equipment: 'bodyweight',
    measurementType: 'duration',
    description:
      'W podporze na przedramionach utrzymuj ciało w jednej linii. Zapisz czas utrzymania pozycji.',
  },
  {
    id: 'c805666d-305f-450f-a4d8-a21cac9ced95',
    name: 'Spięcia brzucha',
    category: 'isolation',
    primaryMuscle: 'abs',
    secondaryMuscles: [],
    equipment: 'bodyweight',
    measurementType: 'bodyweight_reps',
    description:
      'Leżąc na plecach z ugiętymi nogami, unieś łopatki nad podłogę, napinając brzuch, i opuść.',
  },
  {
    id: '4e4e67cc-e6a0-4148-ab5b-e99c9ec90d97',
    name: 'Unoszenie nóg w zwisie',
    category: 'isolation',
    primaryMuscle: 'abs',
    secondaryMuscles: ['forearms'],
    equipment: 'bodyweight',
    measurementType: 'bodyweight_reps',
    description:
      'W zwisie na drążku unieś nogi przed siebie bez bujania tułowiem i opuść je powoli.',
  },
  {
    id: '1b863f50-35b5-478f-908e-2f0593a1db0a',
    name: 'Spięcia brzucha na wyciągu klęcząc',
    category: 'isolation',
    primaryMuscle: 'abs',
    secondaryMuscles: [],
    equipment: 'cable',
    measurementType: 'weight_reps',
    description:
      'Klęcząc z liną przy głowie, zwiń tułów w dół, napinając brzuch, i wróć pod kontrolą.',
  },
  {
    id: '014bc17d-75e8-4861-8a3a-88bf6457d55d',
    name: 'Skręty tułowia siedząc (russian twist)',
    category: 'isolation',
    primaryMuscle: 'abs',
    secondaryMuscles: [],
    equipment: 'bodyweight',
    measurementType: 'bodyweight_reps',
    description:
      'Siedząc z odchylonym tułowiem, przenoś dłonie lub ciężar na przemian na obie strony.',
  },
  {
    id: '6f29eb5f-a649-45f2-a867-5ca65261965c',
    name: 'Rollout z kółkiem',
    category: 'compound',
    primaryMuscle: 'abs',
    secondaryMuscles: ['shoulders', 'back'],
    equipment: 'other',
    measurementType: 'bodyweight_reps',
    description:
      'Klęcząc, wytocz kółko przed siebie do wyprostu tułowia i wróć, utrzymując napięty brzuch.',
  },
];
