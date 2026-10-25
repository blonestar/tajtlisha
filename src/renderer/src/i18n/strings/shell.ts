/**
 * UI strings for the 'shell' area, merged into resources.ts under the
 * 'shell' namespace key (use t('shell.someKey')). Keep the three languages in
 * sync: sr-Latn must be the exact Latin transliteration of sr-Cyrl (enforced by
 * tests/renderer/i18n-resources.test.tsx). Shortcut names such as Ctrl+O are
 * added in code, not translated here.
 */
export const shellStrings = {
  en: {
    loading: 'Loading…',
    loadError: {
      title: 'Settings could not be loaded',
      body: 'The app cannot continue safely without its settings. Try again.',
      retry: 'Try again'
    },
    top: {
      openVideo: 'Open video',
      undo: 'Undo',
      redo: 'Redo',
      settings: 'Settings',
      export: 'Export',
      noClip: 'No clip open',
      history: 'History'
    },
    save: {
      saved: 'Saved',
      saving: 'Saving…',
      failed: 'Save failed',
      retry: 'Retry save'
    },
    steps: {
      label: 'Workflow steps',
      import: 'Import',
      trim: 'Trim',
      transcribe: 'Transcribe',
      translate: 'Translate',
      review: 'Review',
      export: 'Export'
    },
    empty: {
      title: 'Start with a clip',
      lead: 'Subtitles are made in three steps.',
      step1: 'Open a short video and trim the start and end if needed.',
      step2: 'Transcribe the speech, then translate the captions.',
      step3: 'Check the timing, style the text and export.',
      formats: 'Supported formats',
      dropHint: 'or drag a video file here'
    },
    ffmpeg: {
      checking: 'Checking FFmpeg…',
      ready: 'FFmpeg is ready',
      unknown: 'FFmpeg status is unknown',
      unavailable: 'FFmpeg is not available',
      missing: 'Missing: {{items}}',
      hint: 'Install FFmpeg or reinstall Tajtlisha, then restart the app.'
    },
    source: {
      moved: 'The video file was moved or changed.',
      findVideo: 'Find video',
      missingPreview: 'The video file is missing. Use Find video in the banner above.'
    },
    settings: {
      title: 'Settings',
      close: 'Close settings'
    },
    confirm: {
      openVideoTitle: 'Open another video?',
      openVideoBody: 'The current video, its {{count}} captions and their translations will be discarded.',
      openVideoBodyNoCaptions: 'The current video and its trim will be replaced.',
      openVideoAction: 'Open video',
      transcribeTitle: 'Transcribe again?',
      transcribeBody: 'The {{count}} existing captions will be replaced by the new transcript. Their translations are lost too.',
      transcribeAction: 'Transcribe',
      replaceEditedTitle: 'Replace edited captions?',
      replaceEditedBody: 'You edited captions while transcription was running. The new transcript replaces them.',
      replaceAction: 'Replace',
      cancel: 'Cancel'
    },
    drop: {
      title: 'Drop the video to open it',
      replaceHint: 'The current project will be replaced after you confirm.',
      unsupported: 'Only video files can be opened ({{formats}}).'
    },
    result: {
      transcribed: 'Created {{count}} captions.',
      translated: 'Translated {{count}} captions.',
      translatedSkipped: 'Translated {{count}}. Skipped {{skipped}} because their text changed during translation.',
      targetChanged: 'The target language changed while translating. The result was not applied.',
      canceled: 'Stopped. Nothing was changed.',
      stale: 'The project or video changed while the job ran. The result was not applied.',
      busy: 'Another job is already running.',
      done: 'Done',
      details: 'Details'
    },
    translate: {
      nothingToDo: 'Every row is already translated and up to date.'
    },
    playback: {
      failed: 'The video cannot be played (media error {{code}}).'
    },
    cancelFailed: 'The job could not be stopped.',
    captions: {
      noRoom: 'There is no free space after this caption.',
      exactFrameFailed: 'The exact frame could not be rendered.',
      shiftAtStart: 'The first caption already starts at the beginning of the video, so captions cannot move earlier.',
      shiftLimited: 'Captions moved only {{seconds}} s earlier, so the first one starts at the beginning of the video.'
    },
    track: {
      label: 'Preview text',
      original: 'Original',
      translation: 'Translation'
    },
    areas: {
      preview: 'Preview',
      captions: 'Captions',
      generate: 'AI steps'
    },
    layout: {
      resizeColumns: 'Resize captions and preview',
      resizeStyle: 'Resize preview and subtitle style'
    },
    dismiss: 'Dismiss',
    projectLoad: {
      title: 'The saved project could not be loaded',
      body: 'The saved project on disk is untouched. Try loading it again, or open a video to start a new project.',
      retry: 'Try loading again',
      openVideo: 'Open a new video'
    },
    workspace: 'Editor'
  },
  'sr-Latn': {
    loading: 'Učitavanje…',
    loadError: {
      title: 'Podešavanja nije moguće učitati',
      body: 'Aplikacija ne može bezbedno da nastavi bez podešavanja. Pokušaj ponovo.',
      retry: 'Pokušaj ponovo'
    },
    top: {
      openVideo: 'Otvori video',
      undo: 'Poništi',
      redo: 'Ponovi',
      settings: 'Podešavanja',
      export: 'Izvezi',
      noClip: 'Nema otvorenog klipa',
      history: 'Istorija'
    },
    save: {
      saved: 'Sačuvano',
      saving: 'Čuvanje…',
      failed: 'Čuvanje nije uspelo',
      retry: 'Pokušaj ponovo'
    },
    steps: {
      label: 'Koraci rada',
      import: 'Uvoz',
      trim: 'Skraćivanje',
      transcribe: 'Transkripcija',
      translate: 'Prevod',
      review: 'Pregled',
      export: 'Izvoz'
    },
    empty: {
      title: 'Počni od klipa',
      lead: 'Titlovi nastaju u tri koraka.',
      step1: 'Otvori kratak video i po potrebi skrati početak i kraj.',
      step2: 'Transkribuj govor, pa prevedi titlove.',
      step3: 'Proveri vreme, stil titla i izvezi rezultat.',
      formats: 'Podržani formati',
      dropHint: 'ili prevuci video fajl ovde'
    },
    ffmpeg: {
      checking: 'Provera FFmpeg-a…',
      ready: 'FFmpeg je spreman',
      unknown: 'Stanje FFmpeg-a nije poznato',
      unavailable: 'FFmpeg nije dostupan',
      missing: 'Nedostaje: {{items}}',
      hint: 'Instaliraj FFmpeg ili ponovo instaliraj Tajtlišu, pa ponovo pokreni aplikaciju.'
    },
    source: {
      moved: 'Video fajl je premešten ili promenjen.',
      findVideo: 'Pronađi video',
      missingPreview: 'Video fajl nedostaje. Pronađi ga pomoću trake iznad.'
    },
    settings: {
      title: 'Podešavanja',
      close: 'Zatvori podešavanja'
    },
    confirm: {
      openVideoTitle: 'Otvoriti drugi video?',
      openVideoBody: 'Trenutni video, njegovih {{count}} titlova i njihovi prevodi biće odbačeni.',
      openVideoBodyNoCaptions: 'Trenutni video i njegovo skraćivanje biće zamenjeni.',
      openVideoAction: 'Otvori video',
      transcribeTitle: 'Transkribovati ponovo?',
      transcribeBody: 'Postojećih {{count}} titlova biće zamenjeno novom transkripcijom. Prevodi se gube.',
      transcribeAction: 'Transkribuj',
      replaceEditedTitle: 'Zameniti izmenjene titlove?',
      replaceEditedBody: 'Menjao si titlove dok je transkripcija radila. Novi rezultat ih zamenjuje.',
      replaceAction: 'Zameni',
      cancel: 'Otkaži'
    },
    drop: {
      title: 'Prevuci video ovde da ga otvoriš',
      replaceHint: 'Trenutni projekat biće zamenjen kada potvrdiš.',
      unsupported: 'Mogu da se otvore samo video fajlovi ({{formats}}).'
    },
    result: {
      transcribed: 'Napravljeno titlova: {{count}}.',
      translated: 'Prevedeno titlova: {{count}}.',
      translatedSkipped: 'Prevedeno: {{count}}. Preskočeno: {{skipped}}, jer je tekst u međuvremenu promenjen.',
      targetChanged: 'Ciljni jezik je promenjen dok je prevod radio. Rezultat nije primenjen.',
      canceled: 'Zaustavljeno. Ništa nije promenjeno.',
      stale: 'Projekat ili video su promenjeni dok je posao radio. Rezultat nije primenjen.',
      busy: 'Drugi posao je već u toku.',
      done: 'Gotovo',
      details: 'Detalji'
    },
    translate: {
      nothingToDo: 'Svi redovi su već prevedeni i ažurni.'
    },
    playback: {
      failed: 'Video ne može da se pusti (medijska greška {{code}}).'
    },
    cancelFailed: 'Posao nije mogao da se zaustavi.',
    captions: {
      noRoom: 'Nema slobodnog prostora posle ovog titla.',
      exactFrameFailed: 'Tačan kadar nije mogao da se prikaže.',
      shiftAtStart: 'Prvi titl već počinje na početku videa, pa titlovi ne mogu ranije.',
      shiftLimited: 'Titlovi su pomereni samo {{seconds}} s ranije, da prvi počne na početku videa.'
    },
    track: {
      label: 'Tekst u pregledu',
      original: 'Original',
      translation: 'Prevod'
    },
    areas: {
      preview: 'Pregled',
      captions: 'Titlovi',
      generate: 'AI koraci'
    },
    layout: {
      resizeColumns: 'Promeni širinu titlova i pregleda',
      resizeStyle: 'Promeni visinu pregleda i stila titlova'
    },
    dismiss: 'Zatvori',
    projectLoad: {
      title: 'Sačuvani projekat nije mogao da se učita',
      body: 'Sačuvani projekat na disku nije menjan. Pokušaj ponovo da ga učitaš ili otvori video da započneš novi projekat.',
      retry: 'Pokušaj ponovo da učitaš',
      openVideo: 'Otvori novi video'
    },
    workspace: 'Editor'
  },
  'sr-Cyrl': {
    loading: 'Учитавање…',
    loadError: {
      title: 'Подешавања није могуће учитати',
      body: 'Апликација не може безбедно да настави без подешавања. Покушај поново.',
      retry: 'Покушај поново'
    },
    top: {
      openVideo: 'Отвори видео',
      undo: 'Поништи',
      redo: 'Понови',
      settings: 'Подешавања',
      export: 'Извези',
      noClip: 'Нема отвореног клипа',
      history: 'Историја'
    },
    save: {
      saved: 'Сачувано',
      saving: 'Чување…',
      failed: 'Чување није успело',
      retry: 'Покушај поново'
    },
    steps: {
      label: 'Кораци рада',
      import: 'Увоз',
      trim: 'Скраћивање',
      transcribe: 'Транскрипција',
      translate: 'Превод',
      review: 'Преглед',
      export: 'Извоз'
    },
    empty: {
      title: 'Почни од клипа',
      lead: 'Титлови настају у три корака.',
      step1: 'Отвори кратак видео и по потреби скрати почетак и крај.',
      step2: 'Транскрибуј говор, па преведи титлове.',
      step3: 'Провери време, стил титла и извези резултат.',
      formats: 'Подржани формати',
      dropHint: 'или превуци видео фајл овде'
    },
    ffmpeg: {
      checking: 'Провера FFmpeg-а…',
      ready: 'FFmpeg је спреман',
      unknown: 'Стање FFmpeg-а није познато',
      unavailable: 'FFmpeg није доступан',
      missing: 'Недостаје: {{items}}',
      hint: 'Инсталирај FFmpeg или поново инсталирај Тајтлишу, па поново покрени апликацију.'
    },
    source: {
      moved: 'Видео фајл је премештен или промењен.',
      findVideo: 'Пронађи видео',
      missingPreview: 'Видео фајл недостаје. Пронађи га помоћу траке изнад.'
    },
    settings: {
      title: 'Подешавања',
      close: 'Затвори подешавања'
    },
    confirm: {
      openVideoTitle: 'Отворити други видео?',
      openVideoBody: 'Тренутни видео, његових {{count}} титлова и њихови преводи биће одбачени.',
      openVideoBodyNoCaptions: 'Тренутни видео и његово скраћивање биће замењени.',
      openVideoAction: 'Отвори видео',
      transcribeTitle: 'Транскрибовати поново?',
      transcribeBody: 'Постојећих {{count}} титлова биће замењено новом транскрипцијом. Преводи се губе.',
      transcribeAction: 'Транскрибуј',
      replaceEditedTitle: 'Заменити измењене титлове?',
      replaceEditedBody: 'Мењао си титлове док је транскрипција радила. Нови резултат их замењује.',
      replaceAction: 'Замени',
      cancel: 'Откажи'
    },
    drop: {
      title: 'Превуци видео овде да га отвориш',
      replaceHint: 'Тренутни пројекат биће замењен када потврдиш.',
      unsupported: 'Могу да се отворе само видео фајлови ({{formats}}).'
    },
    result: {
      transcribed: 'Направљено титлова: {{count}}.',
      translated: 'Преведено титлова: {{count}}.',
      translatedSkipped: 'Преведено: {{count}}. Прескочено: {{skipped}}, јер је текст у међувремену промењен.',
      targetChanged: 'Циљни језик је промењен док је превод радио. Резултат није примењен.',
      canceled: 'Заустављено. Ништа није промењено.',
      stale: 'Пројекат или видео су промењени док је посао радио. Резултат није примењен.',
      busy: 'Други посао је већ у току.',
      done: 'Готово',
      details: 'Детаљи'
    },
    translate: {
      nothingToDo: 'Сви редови су већ преведени и ажурни.'
    },
    playback: {
      failed: 'Видео не може да се пусти (медијска грешка {{code}}).'
    },
    cancelFailed: 'Посао није могао да се заустави.',
    captions: {
      noRoom: 'Нема слободног простора после овог титла.',
      exactFrameFailed: 'Тачан кадар није могао да се прикаже.',
      shiftAtStart: 'Први титл већ почиње на почетку видеа, па титлови не могу раније.',
      shiftLimited: 'Титлови су померени само {{seconds}} с раније, да први почне на почетку видеа.'
    },
    track: {
      label: 'Текст у прегледу',
      original: 'Оригинал',
      translation: 'Превод'
    },
    areas: {
      preview: 'Преглед',
      captions: 'Титлови',
      generate: 'AI кораци'
    },
    layout: {
      resizeColumns: 'Промени ширину титлова и прегледа',
      resizeStyle: 'Промени висину прегледа и стила титлова'
    },
    dismiss: 'Затвори',
    projectLoad: {
      title: 'Сачувани пројекат није могао да се учита',
      body: 'Сачувани пројекат на диску није мењан. Покушај поново да га учиташ или отвори видео да започнеш нови пројекат.',
      retry: 'Покушај поново да учиташ',
      openVideo: 'Отвори нови видео'
    },
    workspace: 'Едитор'
  }
};
