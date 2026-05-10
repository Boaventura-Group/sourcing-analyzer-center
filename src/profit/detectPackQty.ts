export type DetectPackQtyInput =
  | string
  | {
      amazonTitle?: string;
      supplierTitle?: string;
    };

const PACK_PATTERNS = [
  /\bpack\s+of\s+(\d{1,3})\b/i,
  /\b(\d{1,3})\s*-\s*pack\b/i,
  /\b(\d{1,3})\s+pack\b/i,
  /\bpack\s*x\s*(\d{1,3})\b/i,
  /\bcase\s+of\s+(\d{1,3})\b/i,
  /\bcase\s+(\d{1,3})\b/i,
  /\bmultipack\s+(\d{1,3})\b/i,
  /\b(\d{1,3})\s+count\b/i,
  /\b(\d{1,3})\s*ct\b/i,
] as const;

function chooseTitle(input: DetectPackQtyInput): string {
  if (typeof input === 'string') {
    return input;
  }

  const amazonTitle = input.amazonTitle?.trim();
  if (amazonTitle) {
    return amazonTitle;
  }

  return input.supplierTitle?.trim() ?? '';
}

function parsePackQty(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return undefined;
  }

  return parsed;
}

function detectGenericXPackQty(title: string): number | undefined {
  const genericXPattern = /\bx\s*(\d{1,3})\b/gi;

  for (const match of title.matchAll(genericXPattern)) {
    const matchIndex = match.index;

    if (matchIndex === undefined) {
      continue;
    }

    const beforeMatch = title.slice(0, matchIndex);
    if (/\d\s*$/.test(beforeMatch)) {
      continue;
    }

    const packQty = parsePackQty(match[1]);
    if (packQty !== undefined) {
      return packQty;
    }
  }

  return undefined;
}

export function detectPackQty(input: DetectPackQtyInput): number {
  const title = chooseTitle(input);

  for (const pattern of PACK_PATTERNS) {
    const match = pattern.exec(title);
    const packQty = parsePackQty(match?.[1]);

    if (packQty !== undefined) {
      return packQty;
    }
  }

  const genericXPackQty = detectGenericXPackQty(title);
  if (genericXPackQty !== undefined) {
    return genericXPackQty;
  }

  return 1;
}
