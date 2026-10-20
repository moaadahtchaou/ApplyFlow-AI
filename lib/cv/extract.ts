import { cvExtractionResultSchema, type CVExtractionResult } from '@/lib/ai/contracts';

export const MAX_CV_FILE_SIZE = 5 * 1024 * 1024;
export const MIN_CV_TEXT_LENGTH = 20;
export const MAX_CV_TEXT_LENGTH = 30_000;
export const CV_EXTRACTION_TIMEOUT_MS = 15_000;

export type CvFileKind = 'pdf' | 'docx' | 'text';

export class CvValidationError extends Error {
  status = 400;

  constructor(message: string) {
    super(message);
    this.name = 'CvValidationError';
  }
}

export type CvFileMetadata = {
  name: string;
  type: string;
  size: number;
};

const sectionMatchers = [
  ['Contact', /\b(contact|coordonn[ée]es|email|e-mail|phone|t[ée]l[ée]phone)\b/i],
  ['Summary', /\b(summary|profile|profil|objective|about me|professional summary)\b/i],
  ['Experience', /\b(experience|employment|work history|exp[ée]rience professionnelle)\b/i],
  ['Projects', /\b(projects?|projets?|portfolio)\b/i],
  ['Skills', /\b(skills?|comp[ée]tences?|technologies?|tech stack)\b/i],
  ['Education', /\b(education|formation|academic|dipl[oô]me)\b/i],
  ['Languages', /\b(languages?|langues?)\b/i],
  ['Certifications', /\b(certifications?|certificats?)\b/i]
] as const;

export function normalizeCvText(text: string, maxLength = MAX_CV_TEXT_LENGTH) {
  const normalized = text
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/[ \t]{3,}/g, '  ')
    .trim();

  return normalized.length > maxLength ? normalized.slice(0, maxLength).trimEnd() : normalized;
}

export function validateExtractedCvText(text: string) {
  const normalized = normalizeCvText(text);
  if (normalized.length < MIN_CV_TEXT_LENGTH) {
    throw new CvValidationError('The CV text is empty or too short. Paste the CV text manually before analysis.');
  }
  return normalized;
}

export function detectCvFileKind(file: CvFileMetadata): CvFileKind {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) return 'docx';
  if (
    type.startsWith('text/') ||
    (type === 'application/octet-stream' && (name.endsWith('.txt') || name.endsWith('.md'))) ||
    name.endsWith('.txt') ||
    name.endsWith('.text') ||
    name.endsWith('.md')
  ) return 'text';

  throw new CvValidationError('Unsupported CV file type. Upload a PDF, DOCX, or plain text file.');
}

export function validateCvFileMetadata(file: CvFileMetadata): CvFileKind {
  if (!file.name) throw new CvValidationError('Choose a CV file first.');
  if (file.size <= 0) throw new CvValidationError('The selected CV file is empty.');
  if (file.size > MAX_CV_FILE_SIZE) throw new CvValidationError('The CV file is too large. Maximum size is 5 MB.');
  return detectCvFileKind(file);
}

async function withTimeout<T>(promise: Promise<T>) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new CvValidationError('CV extraction timed out. Try a simpler file or paste the text manually.')),
          CV_EXTRACTION_TIMEOUT_MS
        );
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function validateContentSignature(kind: CvFileKind, buffer: Buffer) {
  if (kind === 'pdf' && buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new CvValidationError('The file extension says PDF, but the content is not a valid PDF.');
  }
  if (kind === 'docx' && !(buffer[0] === 0x50 && buffer[1] === 0x4b)) {
    throw new CvValidationError('The file extension says DOCX, but the content is not a valid Office document.');
  }
}

async function extractPdfText(buffer: Buffer) {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText({ pageJoiner: '\n\n' });
    return result.text;
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function extractDocxText(buffer: Buffer) {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

export function assessCvExtraction(
  rawText: string,
  options: { fileName?: string; fileKind?: CVExtractionResult['fileKind'] } = {}
): CVExtractionResult {
  const text = validateExtractedCvText(rawText);
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}+#./'-]*/gu) ?? [];
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const detectedSections = sectionMatchers.filter(([, matcher]) => matcher.test(text)).map(([name]) => name);
  const warnings: string[] = [];
  let score = 10;

  if (words.length < 80) {
    warnings.push(`Only ${words.length} readable words were extracted.`);
    score -= words.length < 35 ? 4 : 2;
  }
  if (detectedSections.length < 3) {
    warnings.push('Few common CV sections were detected; columns or text boxes may have been extracted out of order.');
    score -= 2;
  }

  const shortLineRatio = lines.length ? lines.filter((line) => line.split(/\s+/).length <= 2).length / lines.length : 1;
  if (lines.length > 25 && shortLineRatio > 0.65) {
    warnings.push('The extracted text is unusually fragmented.');
    score -= 2;
  }

  const normalizedLines = lines.map((line) => line.toLowerCase().replace(/\s+/g, ' '));
  const duplicateCount = normalizedLines.length - new Set(normalizedLines).size;
  if (normalizedLines.length > 10 && duplicateCount / normalizedLines.length > 0.2) {
    warnings.push('Repeated text was detected in the extraction.');
    score -= 1.5;
  }

  const invalidCharacters = [...text].filter((character) => {
    const code = character.charCodeAt(0);
    return character === '\ufffd' || (code < 32 && character !== '\n' && character !== '\t');
  }).length;
  if (invalidCharacters > Math.max(3, text.length * 0.01)) {
    warnings.push('The extraction contains an unusual number of invalid characters.');
    score -= 2;
  }

  if (!/\b(experience|employment|projects?|exp[ée]rience|projets?)\b/i.test(text)) {
    warnings.push('No experience or projects section was detected.');
    score -= 1;
  }
  if (!/\b(skills?|comp[ée]tences?|technologies?)\b/i.test(text)) {
    warnings.push('No skills section was detected.');
    score -= 0.5;
  }

  return cvExtractionResultSchema.parse({
    text,
    wordCount: words.length,
    qualityScore: Math.max(0, Math.min(10, Math.round(score * 10) / 10)),
    warnings,
    detectedSections,
    fileName: options.fileName,
    fileKind: options.fileKind ?? 'manual',
    kind: options.fileKind && options.fileKind !== 'manual' ? options.fileKind : undefined,
    extractedAt: new Date().toISOString()
  });
}

export async function extractTextFromCvFile(file: File) {
  const kind = validateCvFileMetadata(file);
  const buffer = Buffer.from(await file.arrayBuffer());
  validateContentSignature(kind, buffer);
  const rawText = await withTimeout(
    kind === 'pdf'
      ? extractPdfText(buffer)
      : kind === 'docx'
        ? extractDocxText(buffer)
        : Promise.resolve(buffer.toString('utf8'))
  );
  return assessCvExtraction(rawText, { fileName: file.name, fileKind: kind });
}
