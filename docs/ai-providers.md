# AI Providers

## Cilj

AI sloj mora biti modularan. Aplikacija ne sme da zavisi od jednog providera u UI i subtitle logici.

OpenAI i OpenRouter su API provider-i; oba koriste korisnikov API key koji se cuva van renderer-a.

Sva korisnicka podesavanja za AI nalaze se u posebnoj AI connector sekciji Settings stranice.

## Trenutno stanje iz dokumentacije

OpenAI API referenca navodi Bearer autentikaciju preko API keys ili kratkotrajnih access token-a iz workload identity federation:

- https://developers.openai.com/api/reference/overview/

OpenAI production best practices naglasavaju da API key ne treba izlagati u browserima ili aplikacijama i da se tajne cuvaju server-side ili u key management sistemu:

- https://developers.openai.com/api/docs/guides/production-best-practices

Codex ima poseban auth model za Codex CLI:

- https://developers.openai.com/codex/auth

OpenRouter koristi Bearer token / API key auth i ima API referencu:

- https://openrouter.ai/docs/api/reference/authentication
- https://openrouter.ai/docs/api/reference/overview

OpenRouter takodje ima STT endpoint za transkripciju:

- https://openrouter.ai/docs/guides/overview/multimodal/stt
- https://openrouter.ai/docs/api/api-reference/transcriptions/create-audio-transcriptions

## Trenutno stanje implementacije

- OpenAI API-key provider ima runtime pozive za transcription, translation i subtitle polish.
- OpenAI transcription koristi `/v1/audio/transcriptions`, `verbose_json` i segment timestamp granularnost.
- OpenAI translation/polish koristi Responses API i structured output preko `text.format` JSON schema ugovora.
- Main process ima subtitle workflow servis koji iz videa ekstraktuje privremeni audio, poziva provider za transkripciju, prevod i opcioni polish, pa renderer-u vraca originalni i prevedeni track.
- OpenRouter ima runtime tok za transkripciju preko `/api/v1/audio/transcriptions`, kao i translation/polish preko `/api/v1/chat/completions`.
- Settings ucitava OpenAI poznate modele i OpenRouter katalog modela za odgovarajuce capability-je.
- OpenAI API key je jedini podrzani auth tok za ovu aplikaciju. ChatGPT/Codex login se ne koristi za OpenAI API pozive.

## Auth strategija

### OpenAI OAuth/login

Ne implementirati ChatGPT/Codex OAuth/login kao autentikaciju za OpenAI API. Zvanicna OpenAI dokumentacija navodi Platform API keys za opste OpenAI API pozive; Codex access token-i su namenjeni Enterprise automatizaciji, ne ovoj desktop aplikaciji.

### Codex CLI auth reuse

Na lokalnom sistemu moze postojati `~/.codex/auth.json`, ali aplikacija ne treba da cita taj fajl direktno kao production auth mehanizam.

Razlog:

- to je interni auth cache Codex CLI-a,
- format nije javni ugovor za ovu aplikaciju,
- moze se promeniti,
- moze imati security i policy implikacije.

Dozvoljeno za istrazivanje:

- proveriti da li Codex CLI nudi podrzan nacin da izlozi access token,
- proveriti da li je takav token validan za potrebne API pozive,
- dokumentovati ogranicenja.

### Fallback: OpenAI API key

Credential se cuva u main-process credential store-u koji koristi OS-backed Electron `safeStorage` encryption, ne u projektu i ne u Settings store-u.

### OpenRouter provider

OpenRouter je API provider preko Bearer token-a. Koristi se kao alternativni provider za:

- transcription preko `openai/whisper-large-v3` po default-u; trenutno vraca jedan segment za ceo audio jer taj endpoint ne vraca timing segmente,
- translation/polish preko izabranog chat modela,
- kasnije mozda TTS ako provider/model podrzi kvalitet koji treba.

## Provider capability model

Svaki provider mora eksplicitno da prijavi sta podrzava.

```ts
type AiProviderId = 'openai' | 'openrouter';

type AuthMode =
  | 'oauth_or_chatgpt_login'
  | 'api_key'
  | 'codex_auth_experimental';

type AiProviderCapabilities = {
  detectLanguage: boolean;
  transcription: boolean;
  segmentTimestamps: boolean;
  wordTimestamps: boolean;
  translation: boolean;
  subtitlePolish: boolean;
  textToSpeech: boolean;
  summary: boolean;
};
```

### Sazetak videa (summary)

Opcioni, korisnicki ukljucen korak. Kada je `summary.enabled`, Editor prikazuje dugme Summarize. Main salje
transkript (originalni tekst caption-a unutar trim-a, vremena relativna na pocetak trim-a, format `[m:ss] tekst`)
aktivnom provideru sa sistemskim promptom iz podesavanja i vraca obican tekst.

- Kanal: `workflow:summarize` (job, moze da se otkaze), stage `summarizing`.
- Model: `summary.modelByProvider[provider]`, pa `textModelByProvider[provider]`, pa default providera.
- Thinking effort: `summary.reasoningEffort`. `default` ne salje parametar (radi i sa modelima bez reasoning-a);
  ostale vrednosti (`none` ... `max`) idu kao `reasoning.effort` (OpenAI Responses API i OpenRouter). Koje
  vrednosti model prihvata zavisi od modela; nepodrzanu vrednost provider odbije i korisnik vidi poruku API-ja.
- Rezultat se ne cuva u projektu; ostaje u Editoru dok se ne otvori drugi projekat.

## AI connector settings

AI connector je UI i konfiguracioni sloj iznad provider interfejsa.

Mora podrzati:

- izbor aktivnog providera,
- prikaz podrzanih capability-ja,
- izbor auth metoda po provideru,
- connect/disconnect,
- test connection,
- masked credential status,
- brisanje credential-a,
- izbor modela za transkripciju,
- izbor modela za prevod i subtitle polish,
- default target language,
- auto-detect input language on/off,
- conservative polish on/off,
- social caption polish on/off,
- max chars per line,
- max lines per caption.

AI connector mora jasno odvojiti:

- tajne, koje idu u credential store,
- obicna podesavanja, koja idu u settings store,
- provider runtime status, koji se dobija iz provider registry-ja.

Provider konekcija ne sme zavisiti od UI jezika aplikacije.

## Core AI tipovi

```ts
type LanguageCode = string;

type TranscriptSegment = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  language: LanguageCode;
  confidence?: number;
};

type SubtitleTrackKind = 'original' | 'translation';

type SubtitleTrack = {
  id: string;
  kind: SubtitleTrackKind;
  language: LanguageCode;
  sourceLanguage?: LanguageCode;
  targetLanguage?: LanguageCode;
  segments: TranscriptSegment[];
};

type TranscriptionRequest = {
  audioPath: string;
  audioFormat: 'wav' | 'mp3' | 'm4a';
  expectedLanguage?: LanguageCode;
  autoDetectLanguage: boolean;
  clipDurationMs: number;
};

type TranscriptionResult = {
  detectedLanguage: LanguageCode;
  text: string;
  segments: TranscriptSegment[];
  providerMetadata?: unknown;
};

type TranslationRequest = {
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  segments: TranscriptSegment[];
  preserveTiming: true;
};

type SubtitlePolishRequest = {
  track: SubtitleTrack;
  mode: 'conservative' | 'social_caption';
  maxCharsPerLine: number;
  maxLinesPerCaption: 1 | 2;
};
```

## Provider interfejs

```ts
type AiProvider = {
  id: AiProviderId;
  displayName: string;
  authModes: AuthMode[];
  capabilities: AiProviderCapabilities;
  listModels?(capability: keyof AiProviderCapabilities): Promise<string[]>;
  testConnection(): Promise<{ ok: boolean; message?: string }>;
  connect(authMode: AuthMode): Promise<void>;
  disconnect(): Promise<void>;
  detectLanguage?(request: TranscriptionRequest): Promise<LanguageCode>;
  transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>;
  translate(request: TranslationRequest): Promise<SubtitleTrack>;
  polishSubtitles(request: SubtitlePolishRequest): Promise<SubtitleTrack>;
};
```

## Timestamp fallback

Ako provider vrati samo tekst bez segment ili word timestamp-a:

1. App generise provisional segmente po trajanju klipa i duzini teksta.
2. Segmente oznacava kao low confidence.
3. UI jasno dozvoljava rucno popravljanje timing-a.
4. Export ne sme da puca zbog nedostatka provider timestamp-a.

## Srpski: ekavica i ijekavica

Whisper mesa srpski, hrvatski i bosanski i ekavski govor cesto pise ijekavski (mjesto, podsjetimo), a ponekad ga oznaci kao bosanski ili hrvatski. Transcription prompt to ne popravlja pouzdano (provereno na stvarnom klipu sa `whisper-1`).

- Srpski transkript (`sr-Latn`, `sr-Cyrl`) se odmah posle transkripcije konvertuje u ekavicu preko recnika cestih jat osnova (`src/main/ai/serbian-variant.ts`). Menja se tekst reci, ne timing; vlastita imena sa velikim slovom (Rijeka, Bijeljina, Prijedor) ostaju.
- AI korekcija, prevod i polish na srpski dobijaju eksplicitno ekavsko pravilo; korekcija tretira ijekavske oblike kao gresku pisanja.
- Ako video kontekst ili korisnicke instrukcije pominju ijekavicu, sve ostaje ijekavski. Ako pominju ekavicu, transkript prepoznat kao `bs` ili `hr` se tretira kao srpski.

## Auth spike acceptance criteria

OpenAI OAuth/login moze postati default samo ako:

- postoji stabilan public flow,
- flow radi bez citanja privatnih Codex cache fajlova,
- token pristupa potrebnim AI endpoint-ima,
- refresh token ili session renewal radi,
- moze da se objasni korisniku bez komplikovanog setup-a,
- nema ocigledan policy/security rizik.

Ako ovo ne prodje, MVP koristi OpenAI API key i OpenRouter API key kao podrzane provider tokove.
