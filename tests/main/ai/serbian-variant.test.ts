import { describe, expect, it } from 'vitest';
import { requestedSerbianVariant, serbianVariant, toEkavian } from '../../../src/main/ai/serbian-variant';

describe('toEkavian', () => {
  it('converts common Ijekavian words, including prefixed forms', () => {
    expect(toEkavian('Neophodno je da se podsjetimo i kako je izvještavano.')).toBe('Neophodno je da se podsetimo i kako je izveštavano.');
    expect(toEkavian('gdje ovdje uvijek vrijeme mjesto umjesto čovjek djevojka djeca riječ lijepo')).toBe(
      'gde ovde uvek vreme mesto umesto čovek devojka deca reč lepo'
    );
    expect(toEkavian('prije poslije dvije obje dio sljedeći posljedica uspješno procjena prijedlog')).toBe(
      'pre posle dve obe deo sledeći posledica uspešno procena predlog'
    );
  });

  it('converts jat verb forms', () => {
    expect(toEkavian('vidjeti vidjela živjeli htio vidio volio voljela sjela razumijem pobijedio')).toBe(
      'videti videla živeli hteo video voleo volela sela razumem pobedio'
    );
  });

  it('leaves words that only look Ijekavian unchanged', () => {
    const text = 'nije Srbije emisije pije ubije pojela bio radio kupio objekat projekat odjednom Sjedinjene objedinjen';
    expect(toEkavian(text)).toBe(text);
  });

  it('keeps Ijekavian place names when they are capitalized', () => {
    expect(toEkavian('Rijeka Bijeljina Prijedor Prijepolje Sjenica Bijelo')).toBe('Rijeka Bijeljina Prijedor Prijepolje Sjenica Bijelo');
    expect(toEkavian('rijeka')).toBe('reka');
  });

  it('keeps the case of the word and the punctuation around it', () => {
    expect(toEkavian('Podsjetimo, PODSJETIMO! "Gdje?"')).toBe('Podsetimo, PODSETIMO! "Gde?"');
  });

  it('converts Serbian Cyrillic words', () => {
    expect(toEkavian('мјесто и вријеме, Њемачка')).toBe('место и време, Немачка');
  });

  it('leaves Ekavian text unchanged', () => {
    const text = 'Evo samo da podsetimo nekoliko stvari, uvek na istom mestu.';
    expect(toEkavian(text)).toBe(text);
  });
});

describe('Serbian variant from the user text', () => {
  it('is undefined when no variant is named', () => {
    expect(requestedSerbianVariant(undefined, '', 'Intervju o studentima.')).toBeUndefined();
    expect(serbianVariant('Intervju o studentima.')).toBe('ekavian');
  });

  it('finds Ekavian and Ijekavian in Latin and Cyrillic, in any case', () => {
    expect(requestedSerbianVariant('SRPSKA EKAVICA!!!')).toBe('ekavian');
    expect(requestedSerbianVariant('govori ekavski')).toBe('ekavian');
    expect(requestedSerbianVariant('srpska ijekavica')).toBe('ijekavian');
    expect(requestedSerbianVariant(undefined, 'Piši jekavski.')).toBe('ijekavian');
    expect(requestedSerbianVariant('српска ијекавица')).toBe('ijekavian');
    expect(requestedSerbianVariant('екавица')).toBe('ekavian');
  });

  it('prefers Ekavian when both are named', () => {
    expect(requestedSerbianVariant('Ekavica, ne ijekavica.')).toBe('ekavian');
  });
});
