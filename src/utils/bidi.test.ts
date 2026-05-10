import { describe, expect, it } from 'vitest';
import { findDangerousBidiCharacters, scanSourceFilesForDangerousBidi } from './bidi';

describe('Unicode/Bidi source hardening', () => {
  it('detects dangerous bidirectional override and isolate characters', () => {
    expect(findDangerousBidiCharacters('safe')).toEqual([]);
    expect(findDangerousBidiCharacters('unsafe\u202Etext\u2066')).toEqual([
      { character: '\u202E', codePoint: 'U+202E', index: 6 },
      { character: '\u2066', codePoint: 'U+2066', index: 11 },
    ]);
  });

  it('fails if dangerous Bidi characters are present in source code files', async () => {
    await expect(scanSourceFilesForDangerousBidi(new URL('../', import.meta.url))).resolves.toEqual([]);
  });
});
