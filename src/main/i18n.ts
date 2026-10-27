import type { UiLanguage } from '../shared/types/settings';

/**
 * Strings that only the main process shows (native dialogs). Renderer strings
 * live in src/renderer/src/i18n. Keep the three languages in step.
 */
export type MainLanguage = 'en' | 'sr-Latn' | 'sr-Cyrl';

const en = {
  exportConflictTitle: 'Output files already exist',
  exportConflictMessage: 'Some export files already exist. Replace them or create copies?',
  exportConflictReplace: 'Replace files',
  exportConflictCreateCopies: 'Create copies',
  exportConflictCancel: 'Cancel',
  selectVideoTitle: 'Open video',
  selectOutputFolderTitle: 'Choose export folder',
  videoFilterName: 'Video files',
  quitUnsavedTitle: 'Changes could not be saved',
  quitUnsavedMessage: 'Changes could not be saved',
  quitUnsavedDetail: 'The project could not be written to disk.',
  quitUnsavedRetry: 'Try again',
  quitUnsavedQuit: 'Quit without saving',
  quitUnsavedCancel: 'Cancel'
};

export type MainStrings = Record<keyof typeof en, string>;

const MAIN_STRINGS: Record<MainLanguage, MainStrings> = {
  en,
  'sr-Latn': {
    exportConflictTitle: 'Izlazni fajlovi već postoje',
    exportConflictMessage: 'Neki izlazni fajlovi već postoje. Da li da ih zamenim ili da napravim kopije?',
    exportConflictReplace: 'Zameni fajlove',
    exportConflictCreateCopies: 'Napravi kopije',
    exportConflictCancel: 'Otkaži',
    selectVideoTitle: 'Otvori video',
    selectOutputFolderTitle: 'Izaberi folder za izvoz',
    videoFilterName: 'Video fajlovi',
    quitUnsavedTitle: 'Promene nisu mogle da se sačuvaju',
    quitUnsavedMessage: 'Promene nisu mogle da se sačuvaju',
    quitUnsavedDetail: 'Projekat nije mogao da se upiše na disk.',
    quitUnsavedRetry: 'Pokušaj ponovo',
    quitUnsavedQuit: 'Izađi bez čuvanja',
    quitUnsavedCancel: 'Otkaži'
  },
  'sr-Cyrl': {
    exportConflictTitle: 'Излазни фајлови већ постоје',
    exportConflictMessage: 'Неки излазни фајлови већ постоје. Да ли да их заменим или да направим копије?',
    exportConflictReplace: 'Замени фајлове',
    exportConflictCreateCopies: 'Направи копије',
    exportConflictCancel: 'Откажи',
    selectVideoTitle: 'Отвори видео',
    selectOutputFolderTitle: 'Изабери фолдер за извоз',
    videoFilterName: 'Видео фајлови',
    quitUnsavedTitle: 'Промене нису могле да се сачувају',
    quitUnsavedMessage: 'Промене нису могле да се сачувају',
    quitUnsavedDetail: 'Пројекат није могао да се упише на диск.',
    quitUnsavedRetry: 'Покушај поново',
    quitUnsavedQuit: 'Изађи без чувања',
    quitUnsavedCancel: 'Откажи'
  }
};

/**
 * Resolves the UI language for main. 'system' follows the OS locale: Serbian,
 * Croatian, Bosnian and Serbo-Croatian (sh) map to Latin unless the locale
 * names Cyrillic; anything else falls back to English. Keep this in step with
 * resolveSystemLanguage in src/renderer/src/i18n/index.ts.
 */
export function resolveMainLanguage(uiLanguage: UiLanguage, systemLocale: string): MainLanguage {
  if (uiLanguage !== 'system') return uiLanguage;
  if (/^(sr|hr|bs|sh)([-_@.]|$)/i.test(systemLocale)) {
    return /cyrl/i.test(systemLocale) ? 'sr-Cyrl' : 'sr-Latn';
  }
  return 'en';
}

export function mainStringsFor(language: MainLanguage): MainStrings {
  return MAIN_STRINGS[language];
}
