import { captionsStrings } from './strings/captions';
import { previewStrings } from './strings/preview';
import { shellStrings } from './strings/shell';

const baseResources = {
  en: {
    translation: {
      app: {
        name: 'Tajtlisha',
        tagline: 'Subtitle workspace for short video clips'
      },
      nav: {
        settings: 'Settings'
      },
      language: {
        label: 'Interface language',
        system: 'System',
        en: 'English',
        srLatn: 'Srpski latinica',
        srCyrl: 'Srpski cirilica'
      },
      settings: {
        title: 'Settings',
        close: 'Close settings',
        sections: 'Settings sections',
        nav: {
          general: 'General',
          connectors: 'Connectors',
          transcription: 'Transcription',
          translation: 'Translation',
          summary: 'Summary',
          export: 'Export',
          about: 'About'
        },
        general: {
          uiLanguage: 'Interface language',
          uiLanguageHint: 'Changes menus and labels only. Video and subtitle languages stay the same.',
          uiZoom: 'Interface size',
          uiZoomHint: 'Scales text and controls. Shortcuts: Ctrl + to enlarge, Ctrl - to shrink, Ctrl 0 to reset.',
          targetLanguage: 'Default translation language',
          targetLanguageHint: 'Target for new projects. Each project can change it.',
          notSet: 'Not set'
        },
        ai: {
          providers: 'Providers',
          noProviders: 'No AI providers are available in this version.',
          active: 'Active',
          connected: 'Connected',
          notConnected: 'Not connected',
          apiKey: 'API key',
          apiKeyPlaceholder: 'Paste your API key',
          replaceKeyPlaceholder: 'Paste a new key to replace it',
          apiKeyHint: 'Stored encrypted on this computer. The full key is never shown again.',
          storedKey: 'Stored key',
          keyNotSupported: 'This provider cannot be connected with an API key in this version.',
          connect: 'Connect',
          replaceKey: 'Replace key',
          testConnection: 'Test connection',
          useForSubtitles: 'Use for subtitles',
          disconnect: 'Disconnect',
          connectSucceeded: 'Provider connected.',
          connectFailed: 'Provider connection failed.',
          disconnectSucceeded: 'Provider disconnected.',
          testSucceeded: 'Connection test passed.',
          testFailed: 'Connection test failed.',
          connectToChooseModels: 'Connect this provider to choose its models.',
          transcriptionModel: 'Transcription model',
          transcriptionHint: 'Exact subtitle timing needs a model with word timing.',
          whisperRetired: '{{model}} has word timing, but OpenAI retires it on 2027-02-26.',
          textModel: 'Translation model',
          textHint: 'Used for translation and polish.',
          summaryModel: 'Summary model',
          summaryModelHint: 'Free text, so newer model IDs work too. Suggestions come from the provider.',
          summaryModelPlaceholder: 'Same as text model',
          modelDefault: 'Provider default',
          modelsLoading: 'Loading models…',
          modelsError: 'Models could not be loaded. Check the connection and try again.',
          timing: {
            word: 'Word timing',
            none: 'No timing - approximate',
            segment: 'Segment timing'
          }
        },
        captions: {
          detectLanguage: 'Auto-detect spoken language',
          detectHint: 'Detect the spoken language before transcribing. When off, the project’s source language is used.',
          maxChars: 'Max characters per line',
          maxCharsHint: 'The editor also keeps lines within the width of the video.',
          charactersValue: '{{count}} characters',
          maxLines: 'Max lines per caption',
          polish: 'Text polish',
          polishNone: 'None',
          polishLight: 'Light',
          polishSocial: 'Social captions',
          polishHint: {
            none: 'Translations are used exactly as the provider returns them.',
            light: 'Light cleanup of the translated text. The meaning is kept.',
            social: 'Shorter, more natural wording for social media captions.'
          }
        },
        transcription: {
          correct: 'AI correction after transcription',
          correctHint: 'After transcription, AI goes over the text and fixes errors. It uses the text model chosen under Connectors and keeps the timing.',
          correctionInstructions: 'Correction instructions',
          correctionInstructionsHint: 'Added to the built-in correction rules. Say what to keep, avoid or write differently. Used only when AI correction is on. Changes are saved when you leave the field.',
          correctionPlaceholder: "Example: The speaker's name is Marko Petrović. Write 'AI', never 'artificial intelligence'. Do not censor swear words."
        },
        translation: {
          instructions: 'Translation instructions',
          instructionsHint: 'Added to the built-in translation rules. The polish pass uses them too. Changes are saved when you leave the field.',
          instructionsPlaceholder: "Example: Use informal 'ti'. Keep brand names in English."
        },
        instructions: {
          counter: '{{count}} / {{max}} characters'
        },
        summary: {
          enable: 'Show Summarize in the editor',
          enableHint: 'Shows or hides the Summarize button in the editor. The transcript is sent to the AI provider only when you press it.',
          modelProvider: 'Uses the active AI provider: {{provider}}.',
          modelUnavailable: 'Connect the active AI provider in the Connectors section to choose a model.',
          modelUnsupported: '{{provider}} cannot summarize text.',
          prompt: 'System prompt',
          promptHint: 'Tells the model what to take from the transcript. Changes are saved when you leave the field.',
          promptCounter: '{{count}} / {{max}} characters',
          resetPrompt: 'Reset to default',
          effort: 'Thinking effort',
          effortHint: 'Only reasoning models use it. Providers reject levels a model does not support, so keep Default for other models.',
          effortDefault: 'Default (not sent)',
          effortLevels: {
            none: 'None',
            minimal: 'Minimal',
            low: 'Low',
            medium: 'Medium',
            high: 'High',
            xhigh: 'Extra high',
            max: 'Maximum'
          }
        },
        export: {
          outputFolder: 'Default output folder',
          outputFolderHint: 'Exported files are saved here. Empty means the same folder as the video.',
          sameFolder: 'Same folder as the video',
          chooseFolder: 'Choose folder',
          clearFolder: 'Clear',
          folderFailed: 'The folder could not be selected.',
          defaultOutputs: 'Default outputs',
          defaultOutputsHint: 'Files created by an export.',
          originalSrt: 'Original SRT',
          translatedSrt: 'Translated SRT',
          burnedIn: 'Video with burned-in subtitles',
          burnedInHint: 'Which subtitle track is drawn into the MP4.',
          trackOriginal: 'Original',
          trackTranslated: 'Translated',
          overwrite: 'When files already exist',
          overwriteHint: 'Ask confirms before replacing a file. Create copies keeps both files.',
          overwriteAsk: 'Ask',
          overwriteReplace: 'Replace',
          overwriteCopy: 'Create copies',
          originalNeverModified: 'The original video is never modified.'
        },
        about: {
          appVersion: 'Version',
          platform: 'Platform',
          platformLinux: 'Linux',
          platformWindows: 'Windows',
          platformMacos: 'macOS',
          updates: 'Updates',
          checkUpdates: 'Check for updates',
          checking: 'Checking…',
          upToDate: 'You have the latest version.',
          updateAvailable: 'Version {{version}} is available.',
          download: 'Download',
          downloading: 'Downloading version {{version}}… {{percent}}%',
          readyToInstall: 'Version {{version}} is downloaded. The app restarts to finish the update.',
          install: 'Install and restart',
          updateFailed: 'Update check failed.',
          unsupportedDev: 'Updates are not available in a development build.',
          unsupportedDeb: 'This install comes from a Debian package, which does not update itself. Install the new version from the releases page.',
          releaseNotes: 'Release notes'
        },
        ffmpeg: {
          heading: 'FFmpeg',
          checking: 'Checking FFmpeg…',
          ready: 'FFmpeg is ready for export.',
          notFound: 'FFmpeg was not found. Install FFmpeg, then check again.',
          missing: 'Missing: {{items}}. Install an FFmpeg build that includes them, then check again.',
          unreadable: 'FFmpeg status could not be read.',
          recheck: 'Check again',
          available: 'Available',
          missingStatus: 'Missing',
          cap: {
            probe: 'Media probing',
            subtitles: 'Subtitle burning',
            video: 'Video encoder',
            audio: 'Audio encoder'
          }
        }
      }
    }
  },
  'sr-Latn': {
    translation: {
      app: {
        name: 'Tajtlisha',
        tagline: 'Radni prostor za titlove kratkih video klipova'
      },
      nav: {
        settings: 'Podešavanja'
      },
      language: {
        label: 'Jezik interfejsa',
        system: 'Sistemski',
        en: 'Engleski',
        srLatn: 'Srpski (latinica)',
        srCyrl: 'Srpski (ćirilica)'
      },
      settings: {
        title: 'Podešavanja',
        close: 'Zatvori podešavanja',
        sections: 'Odeljci podešavanja',
        nav: {
          general: 'Opšte',
          connectors: 'Konektori',
          transcription: 'Transkripcija',
          translation: 'Prevod',
          summary: 'Sažetak',
          export: 'Izvoz',
          about: 'O programu'
        },
        general: {
          uiLanguage: 'Jezik interfejsa',
          uiLanguageHint: 'Menja samo menije i oznake. Jezici videa i titlova se ne menjaju.',
          uiZoom: 'Veličina interfejsa',
          uiZoomHint: 'Menja veličinu teksta i kontrola. Prečice: Ctrl + za uvećanje, Ctrl - za smanjenje, Ctrl 0 za vraćanje na 100%.',
          targetLanguage: 'Podrazumevani jezik prevoda',
          targetLanguageHint: 'Cilj za nove projekte. Svaki projekat može da ga promeni.',
          notSet: 'Nije podešeno'
        },
        ai: {
          providers: 'Provajderi',
          noProviders: 'Ni jedan AI provajder nije dostupan u ovoj verziji.',
          active: 'Aktivan',
          connected: 'Povezan',
          notConnected: 'Nije povezan',
          apiKey: 'API ključ',
          apiKeyPlaceholder: 'Nalepite API ključ',
          replaceKeyPlaceholder: 'Nalepite novi ključ za zamenu',
          apiKeyHint: 'Čuva se šifrovano na ovom računaru. Ceo ključ se nikad više ne prikazuje.',
          storedKey: 'Sačuvan ključ',
          keyNotSupported: 'Ovaj provajder se u ovoj verziji ne može povezati API ključem.',
          connect: 'Poveži',
          replaceKey: 'Zameni ključ',
          testConnection: 'Proveri vezu',
          useForSubtitles: 'Koristi za titlove',
          disconnect: 'Prekini vezu',
          connectSucceeded: 'Provajder je povezan.',
          connectFailed: 'Povezivanje provajdera nije uspelo.',
          disconnectSucceeded: 'Veza sa provajderom je prekinuta.',
          testSucceeded: 'Provera veze je uspešna.',
          testFailed: 'Provera veze nije uspela.',
          connectToChooseModels: 'Povežite provajdera da biste izabrali modele.',
          transcriptionModel: 'Model za transkripciju',
          transcriptionHint: 'Tačno vreme titlova zahteva model sa vremenom po rečima.',
          whisperRetired: '{{model}} ima vreme po rečima, ali OpenAI ga ukida 2027-02-26.',
          textModel: 'Model za prevod',
          textHint: 'Koristi se za prevod i doradu.',
          summaryModel: 'Model za sažetak',
          summaryModelHint: 'Slobodan unos, pa rade i noviji ID-jevi modela. Predloge daje provajder.',
          summaryModelPlaceholder: 'Isti kao model za tekst',
          modelDefault: 'Podrazumevani za provajdera',
          modelsLoading: 'Učitavam modele…',
          modelsError: 'Modeli nisu učitani. Proverite vezu i pokušajte ponovo.',
          timing: {
            word: 'Vreme po rečima',
            none: 'Nema vremena - približno',
            segment: 'Vreme po segmentima'
          }
        },
        captions: {
          detectLanguage: 'Automatski prepoznaj jezik govora',
          detectHint: 'Prepoznaje jezik govora pre transkripcije. Kada je isključeno, koristi se izvorni jezik projekta.',
          maxChars: 'Najviše znakova po redu',
          maxCharsHint: 'Uređivač takođe drži redove u okviru širine videa.',
          charactersValue: '{{count}} znakova',
          maxLines: 'Najviše redova po titlu',
          polish: 'Dorada teksta',
          polishNone: 'Nema',
          polishLight: 'Lagana',
          polishSocial: 'Titlovi za društvene mreže',
          polishHint: {
            none: 'Prevodi se koriste onako kako ih provajder vrati.',
            light: 'Lagana dorada prevedenog teksta. Značenje se zadržava.',
            social: 'Kraći i prirodniji tekst za titlove na društvenim mrežama.'
          }
        },
        transcription: {
          correct: 'AI ispravka posle transkripcije',
          correctHint: 'Posle transkripcije AI prolazi kroz tekst i ispravlja greške. Koristi model za tekst izabran u odeljku Konektori i zadržava vreme titlova.',
          correctionInstructions: 'Uputstva za ispravku',
          correctionInstructionsHint: 'Dodaje se ugrađenim pravilima za ispravku. Napiši šta da se zadrži, izbegava ili piše drugačije. Koristi se samo kada je AI ispravka uključena. Izmene se čuvaju kada napustiš polje.',
          correctionPlaceholder: 'Primer: Govornik se zove Marko Petrović. Piši „AI”, nikad „veštačka inteligencija”. Ne cenzuriši psovke.'
        },
        translation: {
          instructions: 'Uputstva za prevod',
          instructionsHint: 'Dodaje se ugrađenim pravilima za prevod, a koristi ih i dorada teksta. Izmene se čuvaju kada napustiš polje.',
          instructionsPlaceholder: 'Primer: Koristi neformalno „ti”. Nazive brendova ostavi na engleskom.'
        },
        instructions: {
          counter: '{{count}} / {{max}} karaktera'
        },
        summary: {
          enable: 'Prikaži Sažmi u editoru',
          enableHint: 'Prikazuje ili skriva dugme Sažmi u editoru. Transkript se šalje AI provajderu tek kada ga pritisneš.',
          modelProvider: 'Koristi aktivni AI provajder: {{provider}}.',
          modelUnavailable: 'Poveži aktivni AI provajder u odeljku Konektori da bi izabrao model.',
          modelUnsupported: '{{provider}} ne može da sažima tekst.',
          prompt: 'Sistemska uputstva',
          promptHint: 'Govori modelu šta da izdvoji iz transkripta. Izmene se čuvaju kada napustiš polje.',
          promptCounter: '{{count}} / {{max}} karaktera',
          resetPrompt: 'Vrati podrazumevana',
          effort: 'Intenzitet razmišljanja',
          effortHint:
            'Koriste ga samo modeli za razmišljanje. Provajderi odbijaju nivoe koje model ne podržava, zato za ostale modele ostavi Podrazumevano.',
          effortDefault: 'Podrazumevano (ne šalje se)',
          effortLevels: {
            none: 'Bez razmišljanja',
            minimal: 'Minimalno',
            low: 'Nisko',
            medium: 'Srednje',
            high: 'Visoko',
            xhigh: 'Vrlo visoko',
            max: 'Maksimalno'
          }
        },
        export: {
          outputFolder: 'Podrazumevana fascikla za izvoz',
          outputFolderHint: 'Izvezene datoteke se čuvaju ovde. Prazno znači istu fasciklu kao video.',
          sameFolder: 'Ista fascikla kao video',
          chooseFolder: 'Izaberi fasciklu',
          clearFolder: 'Obriši',
          folderFailed: 'Fascikla nije mogla da se izabere.',
          defaultOutputs: 'Podrazumevani izlazi',
          defaultOutputsHint: 'Datoteke koje nastaju prilikom izvoza.',
          originalSrt: 'Originalni SRT',
          translatedSrt: 'Prevedeni SRT',
          burnedIn: 'Video sa ugrađenim titlovima',
          burnedInHint: 'Koja traka titlova se upisuje u MP4.',
          trackOriginal: 'Original',
          trackTranslated: 'Prevod',
          overwrite: 'Kada datoteke već postoje',
          overwriteHint: 'Pitaj traži potvrdu pre zamene datoteke. Pravi kopije čuva obe datoteke.',
          overwriteAsk: 'Pitaj',
          overwriteReplace: 'Zameni',
          overwriteCopy: 'Pravi kopije',
          originalNeverModified: 'Originalni video se nikada ne menja.'
        },
        about: {
          appVersion: 'Verzija',
          platform: 'Platforma',
          platformLinux: 'Linuks',
          platformWindows: 'Vindouz',
          platformMacos: 'Mak OS',
          updates: 'Ažuriranja',
          checkUpdates: 'Proveri ažuriranja',
          checking: 'Proveravam…',
          upToDate: 'Imate najnoviju verziju.',
          updateAvailable: 'Verzija {{version}} je dostupna.',
          download: 'Preuzmi',
          downloading: 'Preuzimam verziju {{version}}… {{percent}}%',
          readyToInstall: 'Verzija {{version}} je preuzeta. Aplikacija se ponovo pokreće da završi ažuriranje.',
          install: 'Instaliraj i ponovo pokreni',
          updateFailed: 'Provera ažuriranja nije uspela.',
          unsupportedDev: 'Ažuriranja nisu dostupna u razvojnoj verziji.',
          unsupportedDeb: 'Ova instalacija je iz Debijan paketa, koji se ne ažurira sam. Instalirajte novu verziju sa stranice izdanja.',
          releaseNotes: 'Beleške o izdanju'
        },
        ffmpeg: {
          heading: 'FFmpeg',
          checking: 'Proveravam FFmpeg…',
          ready: 'FFmpeg je spreman za izvoz.',
          notFound: 'FFmpeg nije pronađen. Instalirajte FFmpeg, pa proverite ponovo.',
          missing: 'Nedostaje: {{items}}. Instalirajte FFmpeg verziju koja ih sadrži, pa proverite ponovo.',
          unreadable: 'Stanje FFmpeg-a nije moglo da se pročita.',
          recheck: 'Proveri ponovo',
          available: 'Dostupno',
          missingStatus: 'Nedostaje',
          cap: {
            probe: 'Čitanje medija podataka',
            subtitles: 'Upisivanje titlova',
            video: 'Video enkoder',
            audio: 'Audio enkoder'
          }
        }
      }
    }
  },
  'sr-Cyrl': {
    translation: {
      app: {
        name: 'Тајтлиша',
        tagline: 'Радни простор за титлове кратких видео клипова'
      },
      nav: {
        settings: 'Подешавања'
      },
      language: {
        label: 'Језик интерфејса',
        system: 'Системски',
        en: 'Енглески',
        srLatn: 'Српски (латиница)',
        srCyrl: 'Српски (ћирилица)'
      },
      settings: {
        title: 'Подешавања',
        close: 'Затвори подешавања',
        sections: 'Одељци подешавања',
        nav: {
          general: 'Опште',
          connectors: 'Конектори',
          transcription: 'Транскрипција',
          translation: 'Превод',
          summary: 'Сажетак',
          export: 'Извоз',
          about: 'О програму'
        },
        general: {
          uiLanguage: 'Језик интерфејса',
          uiLanguageHint: 'Мења само меније и ознаке. Језици видеа и титлова се не мењају.',
          uiZoom: 'Величина интерфејса',
          uiZoomHint: 'Мења величину текста и контрола. Пречице: Ctrl + за увећање, Ctrl - за смањење, Ctrl 0 за враћање на 100%.',
          targetLanguage: 'Подразумевани језик превода',
          targetLanguageHint: 'Циљ за нове пројекте. Сваки пројекат може да га промени.',
          notSet: 'Није подешено'
        },
        ai: {
          providers: 'Провајдери',
          noProviders: 'Ни један AI провајдер није доступан у овој верзији.',
          active: 'Активан',
          connected: 'Повезан',
          notConnected: 'Није повезан',
          apiKey: 'API кључ',
          apiKeyPlaceholder: 'Налепите API кључ',
          replaceKeyPlaceholder: 'Налепите нови кључ за замену',
          apiKeyHint: 'Чува се шифровано на овом рачунару. Цео кључ се никад више не приказује.',
          storedKey: 'Сачуван кључ',
          keyNotSupported: 'Овај провајдер се у овој верзији не може повезати API кључем.',
          connect: 'Повежи',
          replaceKey: 'Замени кључ',
          testConnection: 'Провери везу',
          useForSubtitles: 'Користи за титлове',
          disconnect: 'Прекини везу',
          connectSucceeded: 'Провајдер је повезан.',
          connectFailed: 'Повезивање провајдера није успело.',
          disconnectSucceeded: 'Веза са провајдером је прекинута.',
          testSucceeded: 'Провера везе је успешна.',
          testFailed: 'Провера везе није успела.',
          connectToChooseModels: 'Повежите провајдера да бисте изабрали моделе.',
          transcriptionModel: 'Модел за транскрипцију',
          transcriptionHint: 'Тачно време титлова захтева модел са временом по речима.',
          whisperRetired: '{{model}} има време по речима, али OpenAI га укида 2027-02-26.',
          textModel: 'Модел за превод',
          textHint: 'Користи се за превод и дораду.',
          summaryModel: 'Модел за сажетак',
          summaryModelHint: 'Слободан унос, па раде и новији ИД-јеви модела. Предлоге даје провајдер.',
          summaryModelPlaceholder: 'Исти као модел за текст',
          modelDefault: 'Подразумевани за провајдера',
          modelsLoading: 'Учитавам моделе…',
          modelsError: 'Модели нису учитани. Проверите везу и покушајте поново.',
          timing: {
            word: 'Време по речима',
            none: 'Нема времена - приближно',
            segment: 'Време по сегментима'
          }
        },
        captions: {
          detectLanguage: 'Аутоматски препознај језик говора',
          detectHint: 'Препознаје језик говора пре транскрипције. Када је искључено, користи се изворни језик пројекта.',
          maxChars: 'Највише знакова по реду',
          maxCharsHint: 'Уређивач такође држи редове у оквиру ширине видеа.',
          charactersValue: '{{count}} знакова',
          maxLines: 'Највише редова по титлу',
          polish: 'Дорада текста',
          polishNone: 'Нема',
          polishLight: 'Лагана',
          polishSocial: 'Титлови за друштвене мреже',
          polishHint: {
            none: 'Преводи се користе онако како их провајдер врати.',
            light: 'Лагана дорада преведеног текста. Значење се задржава.',
            social: 'Краћи и природнији текст за титлове на друштвеним мрежама.'
          }
        },
        transcription: {
          correct: 'AI исправка после транскрипције',
          correctHint: 'После транскрипције AI пролази кроз текст и исправља грешке. Користи модел за текст изабран у одељку Конектори и задржава време титлова.',
          correctionInstructions: 'Упутства за исправку',
          correctionInstructionsHint: 'Додаје се уграђеним правилима за исправку. Напиши шта да се задржи, избегава или пише другачије. Користи се само када је AI исправка укључена. Измене се чувају када напустиш поље.',
          correctionPlaceholder: 'Пример: Говорник се зове Марко Петровић. Пиши „AI”, никад „вештачка интелигенција”. Не цензуриши псовке.'
        },
        translation: {
          instructions: 'Упутства за превод',
          instructionsHint: 'Додаје се уграђеним правилима за превод, а користи их и дорада текста. Измене се чувају када напустиш поље.',
          instructionsPlaceholder: 'Пример: Користи неформално „ти”. Називе брендова остави на енглеском.'
        },
        instructions: {
          counter: '{{count}} / {{max}} карактера'
        },
        summary: {
          enable: 'Прикажи Сажми у едитору',
          enableHint: 'Приказује или скрива дугме Сажми у едитору. Транскрипт се шаље AI провајдеру тек када га притиснеш.',
          modelProvider: 'Користи активни AI провајдер: {{provider}}.',
          modelUnavailable: 'Повежи активни AI провајдер у одељку Конектори да би изабрао модел.',
          modelUnsupported: '{{provider}} не може да сажима текст.',
          prompt: 'Системска упутства',
          promptHint: 'Говори моделу шта да издвоји из транскрипта. Измене се чувају када напустиш поље.',
          promptCounter: '{{count}} / {{max}} карактера',
          resetPrompt: 'Врати подразумевана',
          effort: 'Интензитет размишљања',
          effortHint:
            'Користе га само модели за размишљање. Провајдери одбијају нивое које модел не подржава, зато за остале моделе остави Подразумевано.',
          effortDefault: 'Подразумевано (не шаље се)',
          effortLevels: {
            none: 'Без размишљања',
            minimal: 'Минимално',
            low: 'Ниско',
            medium: 'Средње',
            high: 'Високо',
            xhigh: 'Врло високо',
            max: 'Максимално'
          }
        },
        export: {
          outputFolder: 'Подразумевана фасцикла за извоз',
          outputFolderHint: 'Извезене датотеке се чувају овде. Празно значи исту фасциклу као видео.',
          sameFolder: 'Иста фасцикла као видео',
          chooseFolder: 'Изабери фасциклу',
          clearFolder: 'Обриши',
          folderFailed: 'Фасцикла није могла да се изабере.',
          defaultOutputs: 'Подразумевани излази',
          defaultOutputsHint: 'Датотеке које настају приликом извоза.',
          originalSrt: 'Оригинални SRT',
          translatedSrt: 'Преведени SRT',
          burnedIn: 'Видео са уграђеним титловима',
          burnedInHint: 'Која трака титлова се уписује у MP4.',
          trackOriginal: 'Оригинал',
          trackTranslated: 'Превод',
          overwrite: 'Када датотеке већ постоје',
          overwriteHint: 'Питај тражи потврду пре замене датотеке. Прави копије чува обе датотеке.',
          overwriteAsk: 'Питај',
          overwriteReplace: 'Замени',
          overwriteCopy: 'Прави копије',
          originalNeverModified: 'Оригинални видео се никада не мења.'
        },
        about: {
          appVersion: 'Верзија',
          platform: 'Платформа',
          platformLinux: 'Линукс',
          platformWindows: 'Виндоуз',
          platformMacos: 'Мак ОС',
          updates: 'Ажурирања',
          checkUpdates: 'Провери ажурирања',
          checking: 'Проверавам…',
          upToDate: 'Имате најновију верзију.',
          updateAvailable: 'Верзија {{version}} је доступна.',
          download: 'Преузми',
          downloading: 'Преузимам верзију {{version}}… {{percent}}%',
          readyToInstall: 'Верзија {{version}} је преузета. Апликација се поново покреће да заврши ажурирање.',
          install: 'Инсталирај и поново покрени',
          updateFailed: 'Провера ажурирања није успела.',
          unsupportedDev: 'Ажурирања нису доступна у развојној верзији.',
          unsupportedDeb: 'Ова инсталација је из Дебијан пакета, који се не ажурира сам. Инсталирајте нову верзију са странице издања.',
          releaseNotes: 'Белешке о издању'
        },
        ffmpeg: {
          heading: 'FFmpeg',
          checking: 'Проверавам FFmpeg…',
          ready: 'FFmpeg је спреман за извоз.',
          notFound: 'FFmpeg није пронађен. Инсталирајте FFmpeg, па проверите поново.',
          missing: 'Недостаје: {{items}}. Инсталирајте FFmpeg верзију која их садржи, па проверите поново.',
          unreadable: 'Стање FFmpeg-а није могло да се прочита.',
          recheck: 'Провери поново',
          available: 'Доступно',
          missingStatus: 'Недостаје',
          cap: {
            probe: 'Читање медија података',
            subtitles: 'Уписивање титлова',
            video: 'Видео енкодер',
            audio: 'Аудио енкодер'
          }
        }
      }
    }
  }
} as const;

type UiLang = keyof typeof baseResources;

function withAreaStrings<L extends UiLang>(language: L) {
  return {
    translation: {
      ...baseResources[language].translation,
      preview: previewStrings[language],
      captions: captionsStrings[language],
      shell: shellStrings[language]
    }
  };
}

export const resources = {
  en: withAreaStrings('en'),
  'sr-Latn': withAreaStrings('sr-Latn'),
  'sr-Cyrl': withAreaStrings('sr-Cyrl')
};
