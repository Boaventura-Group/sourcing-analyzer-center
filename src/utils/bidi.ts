import { readdir, readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DANGEROUS_BIDI_PATTERN = /[\u202A-\u202E\u2066-\u2069]/gu;
const CODE_EXTENSIONS = new Set(['.cjs', '.js', '.json', '.jsonc', '.mjs', '.ts', '.tsx']);

export type DangerousBidiCharacter = {
  character: string;
  codePoint: string;
  index: number;
};

export type DangerousBidiFileFinding = {
  filePath: string;
  matches: DangerousBidiCharacter[];
};

export function findDangerousBidiCharacters(content: string): DangerousBidiCharacter[] {
  return Array.from(content.matchAll(DANGEROUS_BIDI_PATTERN), (match) => {
    const character = match[0];
    const codePoint = character.codePointAt(0) ?? 0;

    return {
      character,
      codePoint: `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`,
      index: match.index ?? 0,
    };
  });
}

function isCodeFile(fileUrl: URL): boolean {
  return CODE_EXTENSIONS.has(extname(fileUrl.pathname));
}

function toFilePath(fileUrl: URL): string {
  return fileURLToPath(fileUrl.href);
}

async function collectCodeFiles(directoryUrl: URL): Promise<URL[]> {
  const entries = await readdir(toFilePath(directoryUrl), { withFileTypes: true });
  const files: URL[] = [];

  for (const entry of entries) {
    if (entry.name === 'node_modules') {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...(await collectCodeFiles(new URL(`${entry.name}/`, directoryUrl))));
      continue;
    }

    if (entry.isFile()) {
      const fileUrl = new URL(entry.name, directoryUrl);

      if (isCodeFile(fileUrl)) {
        files.push(fileUrl);
      }
    }
  }

  return files;
}

export async function scanSourceFilesForDangerousBidi(
  sourceDirectoryUrl: URL,
): Promise<DangerousBidiFileFinding[]> {
  const files = await collectCodeFiles(sourceDirectoryUrl);
  const findings: DangerousBidiFileFinding[] = [];

  for (const fileUrl of files) {
    const content = await readFile(toFilePath(fileUrl), 'utf8');
    const matches = findDangerousBidiCharacters(content);

    if (matches.length > 0) {
      findings.push({
        filePath: toFilePath(fileUrl),
        matches,
      });
    }
  }

  return findings;
}
