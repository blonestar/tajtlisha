/**
 * UI strings for the 'captions' area, merged into resources.ts under the
 * 'captions' namespace key (use t('captions.someKey')). Keep the three languages in
 * sync: sr-Latn must be the exact Latin transliteration of sr-Cyrl
 * (enforced by tests/renderer/i18n-resources.test.tsx).
 */
export const captionsStrings = {
  en: {
    empty: 'No captions yet. Transcribe the clip or add a caption manually.',
    count: '{{count}} captions',
    table: {
      label: 'Caption table'
    },
    columns: {
      index: '#',
      time: 'Time',
      status: 'Status',
      actions: 'Actions'
    },
    translationPending: '{{count}} to translate',
    time: {
      start: 'Start',
      end: 'End',
      duration: '{{seconds}} s'
    },
    nudge: {
      startEarlier: 'Start 100 ms earlier',
      startLater: 'Start 100 ms later',
      endEarlier: 'End 100 ms earlier',
      endLater: 'End 100 ms later'
    },
    line: {
      tooLong: 'Line {{detail}} characters'
    },
    shift: {
      label: 'Shift all captions',
      earlier: 'Earlier',
      later: 'Later',
      amount: 'Shift amount in seconds',
      unit: 's',
      earlierTooltip: 'Move all captions {{seconds}} s earlier',
      laterTooltip: 'Move all captions {{seconds}} s later',
      invalid: 'Enter seconds greater than 0, for example 0.5 or 1.5'
    },
    actions: {
      insertAfter: 'Insert caption after',
      split: 'Split at playhead',
      merge: 'Merge with next caption',
      mergeUnavailable: 'No next caption to merge with',
      delete: 'Delete caption'
    },
    issues: {
      end_before_start: 'End is before start',
      overlaps_previous: 'Overlaps previous by {{ms}} ms',
      outside_trim: 'Outside the trim range',
      empty_original: 'Original text is empty',
      empty_translation: 'Translation is empty',
      too_short: 'Caption is very short',
      line_too_long: 'A line is too long',
      stale_translation: 'Translation is out of date',
      unknown: 'Other issue'
    },
    stale: 'Needs translation',
    languages: {
      auto: 'Detect automatically',
      en: 'English',
      'sr-Latn': 'Serbian (Latin)',
      'sr-Cyrl': 'Serbian (Cyrillic)',
      hr: 'Croatian',
      bs: 'Bosnian',
      sl: 'Slovenian',
      mk: 'Macedonian',
      de: 'German',
      fr: 'French',
      es: 'Spanish',
      it: 'Italian',
      pt: 'Portuguese',
      ru: 'Russian',
      uk: 'Ukrainian',
      pl: 'Polish',
      tr: 'Turkish',
      ar: 'Arabic',
      hi: 'Hindi',
      id: 'Indonesian',
      th: 'Thai',
      vi: 'Vietnamese',
      zh: 'Chinese (Simplified)',
      ja: 'Japanese',
      ko: 'Korean'
    },
    stages: {
      extracting_audio: 'Extracting audio',
      detecting_speech: 'Detecting speech',
      transcribing: 'Transcribing',
      translating: 'Translating',
      polishing: 'Polishing text',
      correcting: 'Correcting transcript',
      rendering_video: 'Rendering video',
      writing_srt: 'Writing SRT',
      summarizing: 'Summarizing'
    },
    jobs: {
      transcribe: 'Transcription',
      translate: 'Translation',
      export: 'Export',
      preview: 'Preview',
      summarize: 'Summary'
    },
    job: {
      working: 'Working…',
      elapsed: 'Elapsed {{time}}',
      progress: 'Progress {{percent}}%',
      cancel: 'Cancel',
      dismiss: 'Dismiss'
    },
    result: {
      done: 'Done',
      canceled: 'Canceled',
      error: 'Failed'
    },
    generate: {
      toolbar: 'AI steps',
      sourceLanguage: 'Spoken language',
      targetLanguage: 'Translation language',
      provider: 'AI provider',
      providerConnected: 'Connected',
      providerNotConnected: 'Not connected',
      noProvider: 'No AI provider selected',
      openSettings: 'Open Settings',
      transcribe: 'Transcribe',
      transcribeAgain: 'Transcribe again',
      translate: 'Translate',
      translateCount: 'Translate {{count}} rows',
      translateAgain: 'Translate again',
      summarize: 'Summarize',
      summarizeAgain: 'Summarize again',
      showSummary: 'Show summary',
      timingApproximate: 'Timing is approximate',
      timingApproximateHint: 'Timing comes from speech detection, not from word timestamps.',
      reason: {
        noVideo: 'Open a video first',
        noAudio: 'This video has no audio track',
        noProvider: 'Choose an AI provider in Settings',
        notConnected: 'Connect {{provider}} in Settings first',
        cannotTranscribe: '{{provider}} cannot transcribe audio',
        cannotTranslate: '{{provider}} cannot translate',
        noCaptions: 'Transcribe the clip first',
        allTranslated: 'Every row is translated and up to date',
        busy: 'Wait for the current job to finish',
        noTranscript: 'No caption text inside the trim range',
        cannotSummarize: '{{provider}} cannot summarize'
      }
    },
    context: {
      button: 'Video context',
      buttonSetTitle: 'Video context: {{text}}',
      buttonEmptyTitle: 'Describe what the video is about',
      dialogTitle: 'Video context',
      description:
        'Describe what the video is about: topic, place, people, names and terms. AI uses it to recognize words during transcription, correction and translation. It is never copied into the captions.',
      languageHint: 'Transcription uses it as a hint only when the spoken language is known: pick it in the toolbar, or transcribe once to detect it.',
      placeholder:
        'Example: Street in Jakarta, Indonesia. A parking attendant (tukang parkir) guides drivers and collects parking fees.',
      textLabel: 'Video context text',
      counter: '{{count}} / {{max}}',
      save: 'Save',
      cancel: 'Cancel',
      clear: 'Clear'
    },
    summary: {
      title: 'Video summary',
      description: 'Based on the captions inside the trim range. Edit the text, then copy it.',
      textLabel: 'Summary text',
      characterCount: '{{count}} characters',
      revisionChanged: 'Captions changed after this summary',
      copy: 'Copy',
      copied: 'Copied',
      copyFailed: 'Copying failed. Select the text and copy it by hand.',
      close: 'Close',
      nothingToSummarize: 'There is no caption text inside the trim range to summarize.'
    },
    export: {
      title: 'Export subtitles',
      description: 'Choose which files to create. The original video is never changed.',
      originalSrt: 'Original subtitles (.srt)',
      translationSrt: 'Translated subtitles (.srt)',
      video: 'Video',
      videoNone: 'No video',
      videoOriginal: 'Burn original',
      videoTranslation: 'Burn translation',
      logo: 'Add logo',
      folder: 'Output folder',
      noFolder: 'No folder chosen',
      chooseFolder: 'Choose folder',
      baseName: 'File name',
      outputs: 'Outputs',
      files: 'Files to create',
      noFiles: 'No files selected',
      showInFolder: 'Show in folder',
      close: 'Close',
      start: 'Export',
      exporting: 'Exporting…',
      created: 'Created files',
      kind: {
        original_srt: 'Original subtitles',
        translation_srt: 'Translated subtitles',
        video: 'Video'
      },
      reason: {
        nothingSelected: 'Select at least one output',
        noFolder: 'Choose an output folder',
        invalidBaseName: 'Enter a file name without slashes',
        blockingIssues: 'Fix blocking caption issues: {{count}}',
        missingTranslations: 'Translate the remaining rows: {{count}}'
      }
    },
    errors: {
      JOB_CANCELED: 'The job was canceled.',
      FFMPEG_MISSING: 'FFmpeg was not found. Install FFmpeg and restart the app.',
      FFMPEG_FAILED: 'FFmpeg failed while processing the clip. Try a shorter trim or another file.',
      INVALID_TRIM: 'The trim range is invalid. Set the start before the end.',
      INVALID_TIMING:
        'Caption timing is invalid. Each caption must end after it starts and must not overlap the next one.',
      NO_AUDIO: 'This video has no audio to transcribe.',
      NO_SPEECH: 'No speech was detected in the selected range. Check the trim range or the audio.',
      PROVIDER_NOT_CONNECTED: 'The AI provider is not connected. Add an API key in Settings.',
      PROVIDER_UNSUPPORTED: 'The selected AI provider cannot do this step. Choose another provider in Settings.',
      PROVIDER_REQUEST_FAILED: 'The AI provider request failed. Check your connection and try again.',
      PROVIDER_AUTH_FAILED: 'The AI provider rejected the API key. Check it in Settings.',
      PROVIDER_RATE_LIMITED: 'The AI provider is rate limiting requests. Wait a minute and try again.',
      AUDIO_TOO_LARGE: 'The audio is too large for one request. Trim the clip to a shorter range.',
      TRANSLATION_INCOMPLETE: 'The AI provider returned an incomplete translation. Try again.',
      REASONING_UNSUPPORTED:
        'This model does not support the chosen thinking effort. In Settings > Summary choose Default, or pick a reasoning model.',
      OUTPUT_EXISTS: 'A file with this name already exists in the output folder.',
      OUTPUT_IS_SOURCE: 'The output would overwrite the original video. Choose a different name or folder.',
      OUTPUT_FOLDER_INVALID: 'The output folder cannot be used. Choose another folder.',
      EXPORT_CANCELED: 'Export was canceled.',
      NOTHING_TO_EXPORT: 'Select at least one output to export.',
      SOURCE_MISSING: 'The original video file is missing. Import the clip again.',
      UNKNOWN: 'Something went wrong. Try again.'
    }
  },
  'sr-Latn': {
    empty: 'Još nema titlova. Transkribuj isečak ili ručno dodaj titl.',
    count: 'Titlova: {{count}}',
    table: {
      label: 'Tabela titlova'
    },
    columns: {
      index: '#',
      time: 'Vreme',
      status: 'Status',
      actions: 'Radnje'
    },
    translationPending: 'Za prevod: {{count}}',
    time: {
      start: 'Početak',
      end: 'Kraj',
      duration: '{{seconds}} s'
    },
    nudge: {
      startEarlier: 'Početak 100 ms ranije',
      startLater: 'Početak 100 ms kasnije',
      endEarlier: 'Kraj 100 ms ranije',
      endLater: 'Kraj 100 ms kasnije'
    },
    line: {
      tooLong: 'Red {{detail}} znakova'
    },
    shift: {
      label: 'Pomeri sve titlove',
      earlier: 'Ranije',
      later: 'Kasnije',
      amount: 'Pomeraj u sekundama',
      unit: 's',
      earlierTooltip: 'Pomeri sve titlove {{seconds}} s ranije',
      laterTooltip: 'Pomeri sve titlove {{seconds}} s kasnije',
      invalid: 'Unesi broj sekundi veći od 0, na primer 0.5 ili 1.5'
    },
    actions: {
      insertAfter: 'Dodaj titl posle',
      split: 'Podeli na poziciji reprodukcije',
      merge: 'Spoj sa sledećim titlom',
      mergeUnavailable: 'Nema sledećeg titla za spajanje',
      delete: 'Obriši titl'
    },
    issues: {
      end_before_start: 'Kraj je pre početka',
      overlaps_previous: 'Preklapa prethodni za {{ms}} ms',
      outside_trim: 'Van opsega isecanja',
      empty_original: 'Originalni tekst je prazan',
      empty_translation: 'Prevod je prazan',
      too_short: 'Titl je veoma kratak',
      line_too_long: 'Red je predugačak',
      stale_translation: 'Prevod nije ažuran',
      unknown: 'Ostali problem'
    },
    stale: 'Treba prevod',
    languages: {
      auto: 'Automatski prepoznaj',
      en: 'Engleski',
      'sr-Latn': 'Srpski (latinica)',
      'sr-Cyrl': 'Srpski (ćirilica)',
      hr: 'Hrvatski',
      bs: 'Bosanski',
      sl: 'Slovenački',
      mk: 'Makedonski',
      de: 'Nemački',
      fr: 'Francuski',
      es: 'Španski',
      it: 'Italijanski',
      pt: 'Portugalski',
      ru: 'Ruski',
      uk: 'Ukrajinski',
      pl: 'Poljski',
      tr: 'Turski',
      ar: 'Arapski',
      hi: 'Hindi',
      id: 'Indonežanski',
      th: 'Tajlandski',
      vi: 'Vijetnamski',
      zh: 'Kineski (pojednostavljeni)',
      ja: 'Japanski',
      ko: 'Korejski'
    },
    stages: {
      extracting_audio: 'Izdvajanje zvuka',
      detecting_speech: 'Prepoznavanje govora',
      transcribing: 'Transkripcija',
      translating: 'Prevođenje',
      polishing: 'Dorada teksta',
      correcting: 'Ispravka transkripta',
      rendering_video: 'Renderovanje videa',
      writing_srt: 'Pisanje SRT-a',
      summarizing: 'Sažimanje'
    },
    jobs: {
      transcribe: 'Transkripcija',
      translate: 'Prevod',
      export: 'Izvoz',
      preview: 'Pregled',
      summarize: 'Sažetak'
    },
    job: {
      working: 'U toku…',
      elapsed: 'Prošlo {{time}}',
      progress: 'Napredak {{percent}}%',
      cancel: 'Otkaži',
      dismiss: 'Zatvori'
    },
    result: {
      done: 'Završeno',
      canceled: 'Otkazano',
      error: 'Neuspešno'
    },
    generate: {
      toolbar: 'AI koraci',
      sourceLanguage: 'Jezik govora',
      targetLanguage: 'Jezik prevoda',
      provider: 'AI provajder',
      providerConnected: 'Povezan',
      providerNotConnected: 'Nije povezan',
      noProvider: 'Nije izabran AI provajder',
      openSettings: 'Otvori podešavanja',
      transcribe: 'Transkribuj',
      transcribeAgain: 'Transkribuj ponovo',
      translate: 'Prevedi',
      translateCount: 'Prevedi redove: {{count}}',
      translateAgain: 'Prevedi ponovo',
      summarize: 'Sažmi',
      summarizeAgain: 'Sažmi ponovo',
      showSummary: 'Prikaži sažetak',
      timingApproximate: 'Vremena su približna',
      timingApproximateHint: 'Vremena dolaze iz detekcije govora, a ne iz vremena reči.',
      reason: {
        noVideo: 'Prvo otvori video',
        noAudio: 'Ovaj video nema audio zapis',
        noProvider: 'Izaberi AI provajdera u podešavanjima',
        notConnected: 'Prvo poveži {{provider}} u podešavanjima',
        cannotTranscribe: '{{provider}} ne može da transkribuje zvuk',
        cannotTranslate: '{{provider}} ne može da prevodi',
        noCaptions: 'Prvo transkribuj isečak',
        allTranslated: 'Svi redovi su prevedeni i ažurni',
        busy: 'Sačekaj da se završi trenutni posao',
        noTranscript: 'Nema teksta titlova u opsegu isečka',
        cannotSummarize: '{{provider}} ne može da sažima'
      }
    },
    context: {
      button: 'Kontekst videa',
      buttonSetTitle: 'Kontekst videa: {{text}}',
      buttonEmptyTitle: 'Opiši o čemu je video',
      dialogTitle: 'Kontekst videa',
      description:
        'Opiši o čemu je video: tema, mesto, ljudi, imena i pojmovi. AI ih koristi da prepozna reči pri transkripciji, ispravci i prevodu. Nikad se ne kopira u titlove.',
      languageHint: 'Transkripcija ga koristi kao pomoć tek kad je poznat govorni jezik: izaberi ga u traci ili prvo transkribuj.',
      placeholder:
        'Primer: Ulica u Džakarti, Indonezija. Čuvar parkinga (tukang parkir) navodi vozače i naplaćuje parking.',
      textLabel: 'Tekst konteksta videa',
      counter: '{{count}} / {{max}}',
      save: 'Sačuvaj',
      cancel: 'Otkaži',
      clear: 'Obriši'
    },
    summary: {
      title: 'Sažetak videa',
      description: 'Zasnovano na titlovima unutar isečka. Izmeni tekst, pa ga kopiraj.',
      textLabel: 'Tekst sažetka',
      characterCount: '{{count}} karaktera',
      revisionChanged: 'Titlovi su menjani posle ovog sažetka',
      copy: 'Kopiraj',
      copied: 'Kopirano',
      copyFailed: 'Kopiranje nije uspelo. Označi tekst i kopiraj ga ručno.',
      close: 'Zatvori',
      nothingToSummarize: 'U opsegu isečka nema teksta titlova za sažimanje.'
    },
    export: {
      title: 'Izvoz titlova',
      description: 'Izaberi koje fajlove želiš da napraviš. Originalni video se ne menja.',
      originalSrt: 'Originalni titlovi (.SRT)',
      translationSrt: 'Prevedeni titlovi (.SRT)',
      video: 'Video',
      videoNone: 'Bez videa',
      videoOriginal: 'Utisni original',
      videoTranslation: 'Utisni prevod',
      logo: 'Dodaj logo',
      folder: 'Folder za izvoz',
      noFolder: 'Folder nije izabran',
      chooseFolder: 'Izaberi folder',
      baseName: 'Naziv fajla',
      outputs: 'Izlazi',
      files: 'Fajlovi za pravljenje',
      noFiles: 'Nijedan fajl nije izabran',
      showInFolder: 'Prikaži u folderu',
      close: 'Zatvori',
      start: 'Izvezi',
      exporting: 'Izvoz u toku…',
      created: 'Napravljeni fajlovi',
      kind: {
        original_srt: 'Originalni titlovi',
        translation_srt: 'Prevedeni titlovi',
        video: 'Video'
      },
      reason: {
        nothingSelected: 'Izaberi bar jedan izlaz',
        noFolder: 'Izaberi folder za izvoz',
        invalidBaseName: 'Unesi naziv fajla bez kosih crta',
        blockingIssues: 'Ispravi blokirajuće probleme: {{count}}',
        missingTranslations: 'Prevedi preostale redove: {{count}}'
      }
    },
    errors: {
      JOB_CANCELED: 'Posao je otkazan.',
      FFMPEG_MISSING: 'FFmpeg nije pronađen. Instaliraj FFmpeg i ponovo pokreni aplikaciju.',
      FFMPEG_FAILED: 'FFmpeg je prijavio grešku pri obradi isečka. Probaj kraći opseg ili drugi fajl.',
      INVALID_TRIM: 'Opseg isecanja nije ispravan. Početak mora biti pre kraja.',
      INVALID_TIMING:
        'Vremena titlova nisu ispravna. Svaki titl mora da se završi posle početka i ne sme da se preklapa sa sledećim.',
      NO_AUDIO: 'Video nema zvuk za transkripciju.',
      NO_SPEECH: 'U izabranom opsegu nije pronađen govor. Proveri opseg isecanja ili zvuk.',
      PROVIDER_NOT_CONNECTED: 'AI provajder nije povezan. Dodaj API ključ u podešavanjima.',
      PROVIDER_UNSUPPORTED: 'Izabrani AI provajder ne može ovaj korak. Izaberi drugog provajdera u podešavanjima.',
      PROVIDER_REQUEST_FAILED: 'Zahtev ka AI provajderu nije uspeo. Proveri internet vezu i pokušaj ponovo.',
      PROVIDER_AUTH_FAILED: 'AI provajder je odbio API ključ. Proveri ga u podešavanjima.',
      PROVIDER_RATE_LIMITED: 'AI provajder privremeno ograničava zahteve. Sačekaj minut i pokušaj ponovo.',
      AUDIO_TOO_LARGE: 'Zvuk je prevelik za jedan zahtev. Skrati opseg isecanja.',
      TRANSLATION_INCOMPLETE: 'AI provajder je vratio nepotpun prevod. Pokušaj ponovo.',
      REASONING_UNSUPPORTED:
        'Ovaj model ne podržava izabrani intenzitet razmišljanja. U Podešavanja > Sažetak izaberi Podrazumevano ili model za razmišljanje.',
      OUTPUT_EXISTS: 'Fajl sa ovim imenom već postoji u izabranom folderu.',
      OUTPUT_IS_SOURCE: 'Izlaz bi prepisao originalni video. Izaberi drugo ime ili folder.',
      OUTPUT_FOLDER_INVALID: 'Izabrani folder ne može da se koristi. Izaberi drugi folder.',
      EXPORT_CANCELED: 'Izvoz je otkazan.',
      NOTHING_TO_EXPORT: 'Izaberi bar jedan izlaz za izvoz.',
      SOURCE_MISSING: 'Fajl originalnog videa nedostaje. Uvezi isečak ponovo.',
      UNKNOWN: 'Nešto je pošlo naopako. Pokušaj ponovo.'
    }
  },
  'sr-Cyrl': {
    empty: 'Још нема титлова. Транскрибуј исечак или ручно додај титл.',
    count: 'Титлова: {{count}}',
    table: {
      label: 'Табела титлова'
    },
    columns: {
      index: '#',
      time: 'Време',
      status: 'Статус',
      actions: 'Радње'
    },
    translationPending: 'За превод: {{count}}',
    time: {
      start: 'Почетак',
      end: 'Крај',
      duration: '{{seconds}} с'
    },
    nudge: {
      startEarlier: 'Почетак 100 мс раније',
      startLater: 'Почетак 100 мс касније',
      endEarlier: 'Крај 100 мс раније',
      endLater: 'Крај 100 мс касније'
    },
    line: {
      tooLong: 'Ред {{detail}} знакова'
    },
    shift: {
      label: 'Помери све титлове',
      earlier: 'Раније',
      later: 'Касније',
      amount: 'Померај у секундама',
      unit: 'с',
      earlierTooltip: 'Помери све титлове {{seconds}} с раније',
      laterTooltip: 'Помери све титлове {{seconds}} с касније',
      invalid: 'Унеси број секунди већи од 0, на пример 0.5 или 1.5'
    },
    actions: {
      insertAfter: 'Додај титл после',
      split: 'Подели на позицији репродукције',
      merge: 'Спој са следећим титлом',
      mergeUnavailable: 'Нема следећег титла за спајање',
      delete: 'Обриши титл'
    },
    issues: {
      end_before_start: 'Крај је пре почетка',
      overlaps_previous: 'Преклапа претходни за {{ms}} мс',
      outside_trim: 'Ван опсега исецања',
      empty_original: 'Оригинални текст је празан',
      empty_translation: 'Превод је празан',
      too_short: 'Титл је веома кратак',
      line_too_long: 'Ред је предугачак',
      stale_translation: 'Превод није ажуран',
      unknown: 'Остали проблем'
    },
    stale: 'Треба превод',
    languages: {
      auto: 'Аутоматски препознај',
      en: 'Енглески',
      'sr-Latn': 'Српски (латиница)',
      'sr-Cyrl': 'Српски (ћирилица)',
      hr: 'Хрватски',
      bs: 'Босански',
      sl: 'Словеначки',
      mk: 'Македонски',
      de: 'Немачки',
      fr: 'Француски',
      es: 'Шпански',
      it: 'Италијански',
      pt: 'Португалски',
      ru: 'Руски',
      uk: 'Украјински',
      pl: 'Пољски',
      tr: 'Турски',
      ar: 'Арапски',
      hi: 'Хинди',
      id: 'Индонежански',
      th: 'Тајландски',
      vi: 'Вијетнамски',
      zh: 'Кинески (поједностављени)',
      ja: 'Јапански',
      ko: 'Корејски'
    },
    stages: {
      extracting_audio: 'Издвајање звука',
      detecting_speech: 'Препознавање говора',
      transcribing: 'Транскрипција',
      translating: 'Превођење',
      polishing: 'Дорада текста',
      correcting: 'Исправка транскрипта',
      rendering_video: 'Рендеровање видеа',
      writing_srt: 'Писање SRT-а',
      summarizing: 'Сажимање'
    },
    jobs: {
      transcribe: 'Транскрипција',
      translate: 'Превод',
      export: 'Извоз',
      preview: 'Преглед',
      summarize: 'Сажетак'
    },
    job: {
      working: 'У току…',
      elapsed: 'Прошло {{time}}',
      progress: 'Напредак {{percent}}%',
      cancel: 'Откажи',
      dismiss: 'Затвори'
    },
    result: {
      done: 'Завршено',
      canceled: 'Отказано',
      error: 'Неуспешно'
    },
    generate: {
      toolbar: 'AI кораци',
      sourceLanguage: 'Језик говора',
      targetLanguage: 'Језик превода',
      provider: 'AI провајдер',
      providerConnected: 'Повезан',
      providerNotConnected: 'Није повезан',
      noProvider: 'Није изабран AI провајдер',
      openSettings: 'Отвори подешавања',
      transcribe: 'Транскрибуј',
      transcribeAgain: 'Транскрибуј поново',
      translate: 'Преведи',
      translateCount: 'Преведи редове: {{count}}',
      translateAgain: 'Преведи поново',
      summarize: 'Сажми',
      summarizeAgain: 'Сажми поново',
      showSummary: 'Прикажи сажетак',
      timingApproximate: 'Времена су приближна',
      timingApproximateHint: 'Времена долазе из детекције говора, а не из времена речи.',
      reason: {
        noVideo: 'Прво отвори видео',
        noAudio: 'Овај видео нема аудио запис',
        noProvider: 'Изабери AI провајдера у подешавањима',
        notConnected: 'Прво повежи {{provider}} у подешавањима',
        cannotTranscribe: '{{provider}} не може да транскрибује звук',
        cannotTranslate: '{{provider}} не може да преводи',
        noCaptions: 'Прво транскрибуј исечак',
        allTranslated: 'Сви редови су преведени и ажурни',
        busy: 'Сачекај да се заврши тренутни посао',
        noTranscript: 'Нема текста титлова у опсегу исечка',
        cannotSummarize: '{{provider}} не може да сажима'
      }
    },
    context: {
      button: 'Контекст видеа',
      buttonSetTitle: 'Контекст видеа: {{text}}',
      buttonEmptyTitle: 'Опиши о чему је видео',
      dialogTitle: 'Контекст видеа',
      description:
        'Опиши о чему је видео: тема, место, људи, имена и појмови. AI их користи да препозна речи при транскрипцији, исправци и преводу. Никад се не копира у титлове.',
      languageHint: 'Транскрипција га користи као помоћ тек кад је познат говорни језик: изабери га у траци или прво транскрибуј.',
      placeholder:
        'Пример: Улица у Џакарти, Индонезија. Чувар паркинга (туканг паркир) наводи возаче и наплаћује паркинг.',
      textLabel: 'Текст контекста видеа',
      counter: '{{count}} / {{max}}',
      save: 'Сачувај',
      cancel: 'Откажи',
      clear: 'Обриши'
    },
    summary: {
      title: 'Сажетак видеа',
      description: 'Засновано на титловима унутар исечка. Измени текст, па га копирај.',
      textLabel: 'Текст сажетка',
      characterCount: '{{count}} карактера',
      revisionChanged: 'Титлови су мењани после овог сажетка',
      copy: 'Копирај',
      copied: 'Копирано',
      copyFailed: 'Копирање није успело. Означи текст и копирај га ручно.',
      close: 'Затвори',
      nothingToSummarize: 'У опсегу исечка нема текста титлова за сажимање.'
    },
    export: {
      title: 'Извоз титлова',
      description: 'Изабери које фајлове желиш да направиш. Оригинални видео се не мења.',
      originalSrt: 'Оригинални титлови (.SRT)',
      translationSrt: 'Преведени титлови (.SRT)',
      video: 'Видео',
      videoNone: 'Без видеа',
      videoOriginal: 'Утисни оригинал',
      videoTranslation: 'Утисни превод',
      logo: 'Додај лого',
      folder: 'Фолдер за извоз',
      noFolder: 'Фолдер није изабран',
      chooseFolder: 'Изабери фолдер',
      baseName: 'Назив фајла',
      outputs: 'Излази',
      files: 'Фајлови за прављење',
      noFiles: 'Ниједан фајл није изабран',
      showInFolder: 'Прикажи у фолдеру',
      close: 'Затвори',
      start: 'Извези',
      exporting: 'Извоз у току…',
      created: 'Направљени фајлови',
      kind: {
        original_srt: 'Оригинални титлови',
        translation_srt: 'Преведени титлови',
        video: 'Видео'
      },
      reason: {
        nothingSelected: 'Изабери бар један излаз',
        noFolder: 'Изабери фолдер за извоз',
        invalidBaseName: 'Унеси назив фајла без косих црта',
        blockingIssues: 'Исправи блокирајуће проблеме: {{count}}',
        missingTranslations: 'Преведи преостале редове: {{count}}'
      }
    },
    errors: {
      JOB_CANCELED: 'Посао је отказан.',
      FFMPEG_MISSING: 'FFmpeg није пронађен. Инсталирај FFmpeg и поново покрени апликацију.',
      FFMPEG_FAILED: 'FFmpeg је пријавио грешку при обради исечка. Пробај краћи опсег или други фајл.',
      INVALID_TRIM: 'Опсег исецања није исправан. Почетак мора бити пре краја.',
      INVALID_TIMING:
        'Времена титлова нису исправна. Сваки титл мора да се заврши после почетка и не сме да се преклапа са следећим.',
      NO_AUDIO: 'Видео нема звук за транскрипцију.',
      NO_SPEECH: 'У изабраном опсегу није пронађен говор. Провери опсег исецања или звук.',
      PROVIDER_NOT_CONNECTED: 'AI провајдер није повезан. Додај API кључ у подешавањима.',
      PROVIDER_UNSUPPORTED: 'Изабрани AI провајдер не може овај корак. Изабери другог провајдера у подешавањима.',
      PROVIDER_REQUEST_FAILED: 'Захтев ка AI провајдеру није успео. Провери интернет везу и покушај поново.',
      PROVIDER_AUTH_FAILED: 'AI провајдер је одбио API кључ. Провери га у подешавањима.',
      PROVIDER_RATE_LIMITED: 'AI провајдер привремено ограничава захтеве. Сачекај минут и покушај поново.',
      AUDIO_TOO_LARGE: 'Звук је превелик за један захтев. Скрати опсег исецања.',
      TRANSLATION_INCOMPLETE: 'AI провајдер је вратио непотпун превод. Покушај поново.',
      REASONING_UNSUPPORTED:
        'Овај модел не подржава изабрани интензитет размишљања. У Подешавања > Сажетак изабери Подразумевано или модел за размишљање.',
      OUTPUT_EXISTS: 'Фајл са овим именом већ постоји у изабраном фолдеру.',
      OUTPUT_IS_SOURCE: 'Излаз би преписао оригинални видео. Изабери друго име или фолдер.',
      OUTPUT_FOLDER_INVALID: 'Изабрани фолдер не може да се користи. Изабери други фолдер.',
      EXPORT_CANCELED: 'Извоз је отказан.',
      NOTHING_TO_EXPORT: 'Изабери бар један излаз за извоз.',
      SOURCE_MISSING: 'Фајл оригиналног видеа недостаје. Увези исечак поново.',
      UNKNOWN: 'Нешто је пошло наопако. Покушај поново.'
    }
  }
};
