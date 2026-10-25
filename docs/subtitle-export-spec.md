# Subtitle Export Spec

## Cilj

Subtitle i export sloj mora da podrzi originalne i prevedene titlove, vizuelni styling i MP4 export sa urezanim titlovima.

## Subtitle track model

Aplikacija radi sa najmanje dva track-a:

- `original` - titlovi na detektovanom jeziku videa.
- `translation` - titlovi prevedeni na korisnicki izabran ciljni jezik.

```ts
type TranscriptSegment = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  language: string;
  confidence?: number;
};

type SubtitleTrack = {
  id: string;
  kind: 'original' | 'translation';
  language: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  segments: TranscriptSegment[];
};
```

## Timing pravila

- Nakon trimovanja finalni timeline pocinje od `00:00:00`.
- Originalni i prevedeni track treba da dele isti timing kada je moguce.
- Ako prevod postane predug, tekst se skracuje ili deli u citljivije linije, ali start/end ostaju stabilni dok korisnik ne promeni timing.
- Segment ne sme imati negativan start.
- Segment `endMs` mora biti veci od `startMs`.
- Segmenti ne bi trebalo da se preklapaju osim ako kasnije uvedemo multi-speaker subtitle mode.

## SRT export

SRT format:

```txt
1
00:00:00,000 --> 00:00:02,400
Primer titla

2
00:00:02,500 --> 00:00:05,000
Sledeci segment
```

MVP export fajlovi:

```txt
original.srt
translated.<target-language>.srt
video.<selected-track>.mp4
```

Kasnije export moze dodati:

```txt
video.original-subtitles.mp4
video.translated-subtitles.<target-language>.mp4
```

## Subtitle style model

```ts
type SubtitleStyle = {
  presetId?: string;
  fontFamily: string;
  fontSizePx: number;
  fontWeight: 'regular' | 'medium' | 'semibold' | 'bold';
  italic: boolean;
  textColor: string;
  outlineEnabled: boolean;
  outlineColor: string;
  outlineWidthPx: number;
  shadowEnabled: boolean;
  shadowColor: string;
  shadowBlurPx: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  position: 'top' | 'middle' | 'bottom';
  align: 'left' | 'center' | 'right';
  maxWidthPercent: number;
  maxLines: 1 | 2;
};
```

## Preset-i

MVP preset-i:

- Minimal clean
- Bold social
- High contrast
- Lower third
- Center punch

Preset je samo pocetna vrednost style objekta. Korisnik moze rucno da promeni svaku stavku posle izbora preset-a.

## Preview/export consistency

Preview u aplikaciji i finalni MP4 export moraju da koriste isti izvor style podataka.

Prihvatljivo je da rendering engine bude drugaciji, ali vizuelni rezultat mora biti blizak:

- ista pozicija,
- ista boja,
- slicna velicina,
- isti outline/shadow princip,
- isti line break-ovi.

Trenutni editor ima style kontrole za font family, velicinu, debljinu, boju, outline, shadow, poziciju, alignment, maksimalnu sirinu i broj linija. Isti `SubtitleStyle` state se koristi za preview overlay i `exportProject` zahtev.

Ako `ffmpeg` subtitle renderer ne podrzi tacno isti efekat kao preview, dokumentovati odstupanje i ponuditi najblizi fallback.

## Burned-in MP4 export

Export servis mora:

1. uzeti trimovani video segment,
2. generisati privremeni subtitle fajl,
3. primeniti style,
4. pozvati `ffmpeg`,
5. pratiti progress,
6. prijaviti greske,
7. sacuvati finalni MP4.

Trenutna implementacija ima project export servis koji:

- pise originalni i/ili prevedeni SRT,
- ako je zadat trim range, pravi privremeni trimovani MP4,
- pomera subtitle timing tako da exportovani timeline pocinje od `00:00:00`,
- koristi isti `SubtitleStyle` ugovor za burned-in MP4 export.

## Word highlight

Karaoke highlight boji rec koja se trenutno izgovara. Ima dva rezima: `word` boji samo aktivnu rec, a `progressive` boji sve reci do aktivne. Boja je `highlightColor` (#rrggbb, podrazumevano `#ffd400`).

Podaci:

- `CaptionRow.words?: CaptionWord[]` cuva vremena reci originalnog teksta, sortirana, u SOURCE vremenu. Prisutna su samo kada je transkripcija imala word timing. Prevod nema word timing.
- `SubtitleStyle.wordHighlight?: 'off' | 'word' | 'progressive'` i `SubtitleStyle.highlightColor?: '#rrggbb'`. Stari dokumenti bez ovih polja ucitavaju se kao `off`.
- Export pomera reci za `-trim.startMs` istim pravilom kao titl, pa finalni timeline pocinje od `00:00:00`.

Tacnost vremena:

- Ako tekst titla odgovara timed recima (poredjenje bez velikih slova i interpunkcije, po redu), svaka rec dobija svoje vreme. To je tacno.
- Reci koje ne odgovaraju (korisnicka izmena, bez word timing-a) dele razmak izmedju susednih poznatih reci po broju karaktera. To je aproksimacija. Isti pristup vazi za prevod i za titlove bez word timing-a.
- Vreme reci je uvek ogranceno na [startMs, endMs] titla.

ASS export:

- Kada je `wordHighlight` `off`, izlaz je isti kao pre ove funkcije (bajt-po-bajt).
- Inace se svaki titl deli na jedan `Dialogue` event po intervalu sa stalnom aktivnom recju. Eventi su uzastopni i ne preklapaju se. Interval koji se posle zaokruzivanja na centisekunde svede na nulu se preskace.
- Aktivna (ili obojena) rec dobija inline override `{\c&HBBGGRR&}rec{\r}`. `Default` stil se ne menja.
- Tekst reci prolazi kroz isto escapovanje kao `escapeAssText`, pa vitice i zagrade u tekstu ne mogu da ubace ASS tagove.
- Preview frame prima `activeWordIndex` i crta jedan event za ceo titl, kako bi preview i export delili isti stil.

SRT ostaje nepromenjen: word timing i boja se ne upisuju u SRT.

## Edge case-ovi

### Provider vrati samo tekst

App generise provisional subtitle segmente i trazi rucnu proveru timing-a.

### Prevod je duzi od originala

App pokusava AI polish u `social_caption` modu:

- skrati formulaciju,
- podeli u najvise 2 linije,
- sacuva smisao.

Ako tekst i dalje ne staje, UI oznacava segment.

### Font nije dostupan

App koristi fallback font i prikazuje upozorenje.

### Export pukne

UI prikazuje:

- kratak opis,
- `ffmpeg` stderr detalj,
- predlog da korisnik promeni path, font ili output format.

## Voiceover phase 2

Voiceover/dubbing nije MVP.

Kasniji model:

```ts
type VoiceoverMode =
  | 'replace_original_audio'
  | 'duck_original_audio'
  | 'export_voice_only';
```

Phase 2 workflow:

1. Korisnik bira translated subtitle track.
2. App generise TTS audio.
3. App mapira TTS segmente na video timing.
4. App zamenjuje ili stisava originalni audio.
5. App exportuje novi MP4.
