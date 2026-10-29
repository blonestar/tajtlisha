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
- Logo
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

AI opcije su u UI-u podeljene u tabove:

- Connectors: samo povezivanje. Svi registrovani provider-i, API kljucevi, status lokalnog CLI-ja, test i
  disconnect. Nema izbora modela.
- Transcription: provider za transkripciju (`aiConnector.activeProviderId`, samo provider-i koji umeju da
  transkribuju) i model, jezik, raspored titlova, AI ispravka transkripta.
- Translation: provider za tekst (`aiConnector.textProviderId`; prevod, dorada i ispravka transkripta), model,
  thinking effort (`aiConnector.textReasoningEffort`), dorada prevoda, uputstva za prevod.
- Summary: zaseban provider (`summary.providerId`, prazno = isto kao za prevod), model, thinking effort, prompt.

Provider koji nije registrovan u ovom build-u (npr. Claude Code u javnom izdanju) pada nazad: tekst na provider
za transkripciju, sazetak na provider za tekst (`src/shared/ai-providers.ts`). Povezivanje novog API provider-a
preuzima transkripciju samo ako nijedan povezan provider za transkripciju nije izabran.

### Provider izbor

Provider-i:

- OpenAI,
- OpenRouter,
- Codex CLI (lokalno, experimental; samo tekst),
- Claude Code (lokalno, experimental; samo tekst; samo dev build ili `TAJTLISHA_ENABLE_CLAUDE_CODE=1`).

Lokalni CLI provider-i nemaju kljuc: kartica pokazuje Found / Not found, panel pokazuje verziju i putanju
CLI-ja, dugmad Check again i Test connection (proverava login CLI-ja). Detalji su u `docs/ai-providers.md`.

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

Codex CLI / Claude Code:

- bez kljuca; aplikacija pokrece instalirani CLI koji koristi sopstveni login,
- nikad ne citati `~/.codex/auth.json` ni Claude Code auth fajlove.

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

### Korisnicka uputstva (tabovi Transcription i Translation)

- AI ispravka posle transkripcije (podrazumevano iskljucena): drugi prolaz modela za tekst ispravlja pogresno
  cute reci, imena, interpunkciju; timing i word timing ostaju isti. Ako ispravka ne uspe, zadrzava se sirovi
  transkript i korisnik dobija poruku; cancel i dalje prekida ceo posao.
- Uputstva za ispravku i uputstva za prevod (do 4000 znakova, prazno = nema): dodaju se posle ugradjenih pravila
  u bloku `<user_instructions>`; pravila o id-jevima, broju stavki i JSON formatu imaju prednost.
- Uputstva za prevod koristi i dorada (polish) prevoda.

### Sazetak videa (zaseban tab "Summary")

- prekidac koji prikazuje ili sakriva dugme Summarize u Editoru (podrazumevano iskljuceno); ostala polja ostaju
  vidljiva i izmenljiva i kada je iskljucen,
- sistemski prompt (do 8000 znakova, dugme za vracanje podrazumevanog; prazan prompt se vraca na podrazumevani),
- thinking effort: Default (ne salje se) ili `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`,
- provider za sazetak (prazno = isto kao za prevod),
- model za taj provider (slobodan unos sa predlozima; prazno = isti kao model za tekst); cuva se po provideru.

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

## Logo

Zaseban tab u Settings, odmah posle Export. Logo se crta u izvezeni MP4 i u pregled
istim rasporedom (`computeWatermarkLayout`), pa pregled i izvoz izgledaju isto.

Kontrole:

- switch "Logo na videu" (podrazumevano ukljucen). Dok je iskljucen, sve ostale kontrole su onemogucene,
  ukljucujuci "Vrati podrazumevano",
- sadrzaj: "Znak + tekst" (podrazumevano), "Samo znak" ili "Samo tekst". Polje za znak i polje za tekst
  nestaju kad ta strana nije u sadrzaju,
- slova u znaku: do 3 znaka (podrazumevano `T`). Prazno sakriva znak,
- tekst: do 30 znakova (podrazumevano `tajtliša`). Prazno sakriva tekst,
- pozadina: "Iza svega" (podrazumevano), "Samo iza znaka" ili "Bez pozadine",
- boje: pozadina (`#1D2025`), znak (`#F2A93B`) i tekst (`#F2F2F2`),
- zaobljenost ivica: 0..50% visine loga (podrazumevano 19%),
- polozaj: mreza 3 x 2 (gore levo, gore u sredini, gore desno, dole levo, dole u sredini, dole desno;
  podrazumevano gore levo). Strelice na tastaturi pomeraju izbor,
- velicina: 3..15% krace strane videa (podrazumevano 7%),
- margina: 0..10% krace strane videa (podrazumevano 3%),
- neprozirnost: 20..100% (podrazumevano 90%),
- pregled: uzorak 16:9 sa trenutnim podesavanjem, odmah ispod switch-a,
- "Vrati podrazumevano" vraca ceo logo na podrazumevana podesavanja.

Tekst se upisuje dok se kuca, ociscen (bez novih redova i spoljnih razmaka, po limitu znakova).
Razmak izmedju reci ostaje u polju dok se kuca. Velicina, margina, zaobljenost i neprozirnost
se upisuju pri svakom koraku klizaca. Logo nije tajna, pa ide u obican settings store.

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
