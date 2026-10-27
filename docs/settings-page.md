# Settings Page

## Cilj

Settings stranica je centralno mesto za podesavanja aplikacije. Mora biti deo MVP-a, jer aplikacija ima vise nezavisnih konfiguracionih oblasti: UI jezik, export, radne foldere i AI konektor.

Settings nije modal za jednu opciju, vec posebna stranica ili panel dostupan iz glavne navigacije i aplikacionog menija.

## Sekcije

Settings stranica ima ove sekcije:

- General
- Language & localization
- AI connector
- Export defaults
- Advanced / diagnostics

## General

Opcije:

- default output folder,
- working/temp folder,
- autosave on/off,
- recent files on/off,
- never modify original video on/off.

Pravila:

- default je da se originalni video nikad ne menja,
- ako output folder nije izabran, app pita korisnika pri exportu,
- temporary fajlovi se mogu obrisati iz Advanced sekcije.

### Velicina interfejsa

- Settings > General bira `uiZoomPercent` (80% do 150%, koraci 5% do 130%, zatim 10%; podrazumevano 100%).
- Ctrl + uvecava, Ctrl - smanjuje, Ctrl 0 vraca na 100%. Precice rade i u poljima za unos i na Settings stranici.
- Zoom je Chromium page zoom (skalira tekst i sve elemente), primenjuje se u preload-u preko `webFrame`, bez posebnog IPC kanala.
- Vrednost se pamti u settings store-u, a nevazece vrednosti u fajlu se svode na najblizi nivo (ili 100%).

## Language & localization

Opcije:

- UI language:
  - English (`en`),
  - srpski latinica (`sr-Latn`),
  - srpski cirilica (`sr-Cyrl`),
  - system default.
- prikaz detektovanog OS locale-a,
- reset na system default.

Pravila:

- izbor UI jezika se pamti,
- `en` je fallback,
- promena UI jezika ne menja input jezik videa,
- promena UI jezika ne menja target jezik prevoda.

## AI connector

AI connector je posebna sekcija Settings stranice i centralno mesto za sve AI opcije.

### Provider izbor

MVP provider-i:

- OpenAI,
- OpenRouter.

UI mora da prikaze:

- aktivni provider,
- status konekcije,
- auth metod,
- podrzane capability-je,
- dugmad: connect, disconnect, test connection.

### Auth opcije

OpenAI:

- API key.

OpenRouter:

- API key / Bearer token.

Codex auth:

- samo experimental/dev ako se nadje podrzan nacin,
- ne citati direktno `~/.codex/auth.json` kao production mehanizam.

### Model opcije

AI connector treba da omoguci:

- model za transkripciju,
- model za prevod,
- model za subtitle polish,
- kasnije TTS/voiceover model.

App prikazuje birače modela: poznate OpenAI modele i katalog OpenRouter modela. Prazan izbor koristi provider default; OpenRouter transkripcija koristi `openai/whisper-large-v3` kada model nije izabran.

### Subtitle AI opcije

Opcije:

- auto-detect input language,
- default target language,
- conservative polish,
- social caption polish,
- max chars per line,
- max lines per caption,
- keep original meaning,
- preserve timing during translation.

### Sazetak videa (zaseban tab "Summary")

- prekidac koji prikazuje ili sakriva dugme Summarize u Editoru (podrazumevano iskljuceno); ostala polja ostaju
  vidljiva i izmenljiva i kada je iskljucen,
- sistemski prompt (do 8000 znakova, dugme za vracanje podrazumevanog; prazan prompt se vraca na podrazumevani),
- thinking effort: Default (ne salje se) ili `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`,
- model za aktivni provider (slobodan unos sa predlozima; prazno = isti kao model za tekst); cuva se po provideru.

### Credential prikaz

AI connector ne sme da prikazuje tajne posle cuvanja.

Dozvoljeno:

- prikaz `Connected`,
- masked key, npr. `sk-...abcd`,
- datum poslednje provere,
- replace credential,
- delete credential.

Nije dozvoljeno:

- plain text API key,
- plain text access token,
- logovanje tajni u debug izlaz.

### Test connection

Test connection treba da proveri:

- da credential postoji,
- da provider prihvata auth,
- da izabrani modeli postoje ili su dostupni,
- da capability koji app trazi nije ocigledno nepodrzan.

Test ne treba automatski da radi skupu transkripciju osim ako korisnik eksplicitno pokrene dublji provider test.

## Export defaults

Opcije:

- default export folder,
- export original SRT by default,
- export translated SRT by default,
- default burned-in track: original ili translation,
- MP4 file naming pattern,
- overwrite policy:
  - ask,
  - overwrite,
  - create copy.

### Logo

- switch "Logo on video" (podrazumevano ukljucen),
- stil: `T` ili `T + tajtliša` (brend se uvek pise latinicom, i u srpskoj cirilici),
- ugao: gore levo, gore desno, dole levo, dole desno (podrazumevano gore levo),
- velicina: 3..15% krace strane videa (podrazumevano 7%),
- neprozirnost: 20..100% (podrazumevano 90%).

Kada je logo iskljucen, kontrole za stil, ugao, velicinu i neprozirnost su onemogucene.
Margina (3%) nije u UI-ju i koristi podrazumevanu vrednost. Logo nije tajna, pa ide u
obican settings store.

## Advanced / diagnostics

Opcije:

- ffmpeg path/status,
- provider debug status bez tajni,
- open logs folder,
- clear temporary files,
- reset all settings,
- reset AI connector only.

## Acceptance criteria

- Settings stranica postoji u MVP-u.
- AI connector je posebna sekcija, ne usputno dugme u editoru.
- Korisnik moze da promeni UI jezik iz Settings-a.
- Korisnik moze da izabere AI provider i auth metod.
- Korisnik moze da testira konekciju.
- Tajne se cuvaju u credential store-u, ne u settings fajlu.
- Obicna podesavanja se cuvaju u settings store-u.
- Settings UI je potpuno lokalizovan kroz i18n sistem.
