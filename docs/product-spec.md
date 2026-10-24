# Product Spec

## Kratak opis

Tajtlisha je desktop aplikacija za pravljenje titlova na kratkim MP4 snimcima. Fokus je na brzom social clips workflow-u, ali uz dovoljno kontrole da korisnik moze da popravi tekst, timing i izgled titlova pre exporta.

## Problem

Kreatori kratkih video snimaka cesto moraju brzo da dodaju titlove, prevedu ih i izvezu video spreman za objavu. Web alati mogu biti skupi, vezani za upload, imati watermark, slabu Linux podrsku ili ogranicenu kontrolu nad izgledom titlova.

## Ciljni korisnici

Primarni korisnik je osoba koja pravi kratke snimke za Reels, Shorts, TikTok, LinkedIn ili slicne formate.

Sekundarni korisnici u kasnijim fazama:

- edukatori,
- prevodioci,
- ljudi koji lokalno obradjuju licne ili interne klipove,
- korisnici kojima je Linux desktop primarno okruzenje.

## MVP workflow

1. Korisnik importuje `.mp4` fajl.
2. App prikazuje video preview.
3. Korisnik trimuje pocetak i kraj.
4. App ekstraktuje audio iz trimovanog segmenta.
5. App auto-detekuje input jezik.
6. App transkribuje govor u originalne subtitle segmente.
7. Korisnik bira ciljni jezik prevoda.
8. App generise prevedene subtitle segmente.
9. App radi AI polish teksta za citljiv subtitle format.
10. Korisnik rucno koriguje tekst i timing.
11. Korisnik bira subtitle stil.
12. App prikazuje preview titlova preko videa.
13. Korisnik po potrebi menja podesavanja u Settings stranici.
14. Korisnik izvozi SRT i MP4.

## MVP funkcije

- Import jednog MP4 fajla.
- Trim pocetka i kraja.
- Multijezican UI:
  - engleski,
  - srpski latinica,
  - srpski cirilica.
- Settings stranica za podesavanja aplikacije.
- Poseban AI konektor deo unutar Settings stranice.
- Auto-detekcija jezika iz audio snimka.
- AI transkripcija.
- Biranje jednog ciljnog jezika prevoda.
- Generisanje originalnog subtitle track-a.
- Generisanje prevedenog subtitle track-a.
- Rucno editovanje subtitle segmenata.
- Subtitle styling:
  - font,
  - velicina,
  - stil,
  - boja,
  - senka,
  - outline,
  - pozicija.
- Export originalnog SRT-a.
- Export prevedenog SRT-a.
- Export MP4-a sa trenutno izabranim subtitle track-om.

## UI lokalizacija

UI mora biti projektovan kao multijezican od prve implementacije. Ne uvoditi hardkodovane tekstove u komponentama osim privremenih debug oznaka koje ne ulaze u release build.

Pocetni jezici:

- `en` - English,
- `sr-Latn` - srpski latinica,
- `sr-Cyrl` - srpski cirilica.

Zahtevi:

- korisnik moze da promeni UI jezik u Settings panelu,
- aplikacija pamti poslednji izabrani UI jezik,
- default jezik se bira iz OS locale-a ako je podrzan,
- fallback je `en`,
- UI jezik je odvojen od input jezika videa i target jezika prevoda,
- svi menu item-i, button-i, tooltip-ovi, error poruke i prazna stanja moraju ici kroz i18n sistem,
- duzi srpski tekstovi ne smeju lomiti layout.

Napomena: UI lokalizacija nije isto sto i prevod titlova. UI jezici odredjuju jezik aplikacije, a target language odredjuje jezik prevedenih subtitle fajlova.

## Settings stranica

MVP mora imati posebnu Settings stranicu, dostupnu iz glavne navigacije ili aplikacionog menija.

Settings stranica treba da bude podeljena na jasne sekcije:

- General,
- Language & localization,
- AI connector,
- Export defaults,
- Advanced / diagnostics.

### General

General sekcija sadrzi:

- default output folder,
- recent files on/off,
- autosave on/off,
- privremeni radni folder,
- opcija da se originalni video nikad ne menja direktno.

### Language & localization

Language sekcija sadrzi:

- UI language selector: `en`, `sr-Latn`, `sr-Cyrl`,
- prikaz trenutnog OS locale-a,
- fallback language prikaz,
- reset na system default.

### AI connector

AI konektor je poseban deo Settings stranice i centralno mesto za sve AI opcije.

MVP opcije:

- izbor providera: OpenAI, OpenRouter,
- auth metod po provideru,
- connect/disconnect,
- status konekcije,
- test connection,
- izbor modela za transkripciju,
- izbor modela za prevod i subtitle polish,
- default target language,
- auto-detect input language on/off,
- conservative polish on/off,
- social caption polish on/off,
- max chars per line,
- max lines per caption,
- cost/safety upozorenje ako provider naplacuje pozive.

AI connector ne sme da prikazuje sirove API key-eve ili access token-e posle cuvanja. Dozvoljeno je prikazati masked vrednost i dugme za replace/delete.

### Export defaults

Export sekcija sadrzi:

- default export folder,
- default MP4 naming pattern,
- da li exportovati original SRT,
- da li exportovati translated SRT,
- default burned-in track: original ili translation,
- overwrite policy: ask, overwrite, create copy.

### Advanced / diagnostics

Advanced sekcija sadrzi:

- ffmpeg path/status,
- AI provider debug info bez tajni,
- open logs folder,
- clear temporary files,
- reset settings.

## Subtitle styling

MVP treba da ponudi preset-e i advanced kontrole.

Preset-i:

- Minimal clean
- Bold social
- High contrast
- Lower third
- Center punch

Advanced kontrole:

- font family,
- font size,
- font weight,
- italic,
- text color,
- outline on/off,
- outline width,
- outline color,
- shadow on/off,
- shadow blur,
- shadow offset,
- position: top, middle, bottom,
- alignment: left, center, right,
- max width,
- max lines: 1 ili 2.

## AI funkcije u MVP-u

Obavezno:

- detekcija jezika,
- transkripcija,
- prevod,
- subtitle polish,
- predlog line break-ova,
- kracenje predugih caption-a bez promene znacenja,
- conservative mode za cuvanje originalnog smisla.

Opciono (ukljucuje se u podesavanjima):

- sazetak transkripta na zahtev, sa sopstvenim sistemskim promptom, modelom i thinking effort-om (na primer
  poenta klipa za tweet). Rezultat se kopira, ne menja titlove.

Nije MVP:

- automatski voiceover,
- batch prevod na vise jezika odjednom,
- prepoznavanje vise govornika kao obavezna funkcija,
- generisanje hashtagova,
- generisanje B-roll-a,
- full video editor.

## Out of scope za MVP

- Prostorni crop kadra.
- Spajanje vise klipova.
- Multi-cut timeline.
- Audio miksovanje.
- Efekti i tranzicije.
- Windows build kao obavezni izlaz prve verzije.
- Ugradjeni account/billing sistem.

## Phase 2 ideja

Ako se MVP stabilizuje, dodati opcioni voiceover/dubbing:

- korisnik bira prevedeni subtitle track,
- app generise TTS glas na ciljnom jeziku,
- korisnik bira da li zamenjuje originalni audio ili ga samo stisava,
- app exportuje MP4 sa novim glasom.
