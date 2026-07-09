export const MAX_CV_FILE_SIZE = 5 * 1024 * 1024;
export const MIN_CV_TEXT_LENGTH = 20;
export const MAX_CV_TEXT_LENGTH = 30_000;

export type CvFileKind = 'pdf' | 'text';

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

export function normalizeCvText(text: string, maxLength = MAX_CV_TEXT_LENGTH) {
  const normalized = text
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  return normalized.length > maxLength ? normalized.slice(0, maxLength).trimEnd() : normalized;
}

export function validateExtractedCvText(text: string) {
  const normalized = normalizeCvText(text);
  if (normalized.length < MIN_CV_TEXT_LENGTH) {
    throw new CvValidationError('The CV text is empty or too short to analyze.');
  }
  return normalized;
}

export function detectCvFileKind(file: CvFileMetadata): CvFileKind {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    return 'pdf';
  }

  if (
    type.startsWith('text/') ||
    type === 'application/octet-stream' && (name.endsWith('.txt') || name.endsWith('.md')) ||
    name.endsWith('.txt') ||
    name.endsWith('.text') ||
    name.endsWith('.md')
  ) {
    return 'text';
  }

  throw new CvValidationError('Unsupported CV file type. Upload a PDF or plain text file.');
}

export function validateCvFileMetadata(file: CvFileMetadata): CvFileKind {
  if (!file.name) {
    throw new CvValidationError('Choose a CV file first.');
  }

  if (file.size <= 0) {
    throw new CvValidationError('The selected CV file is empty.');
  }

  if (file.size > MAX_CV_FILE_SIZE) {
    throw new CvValidationError('The CV file is too large. Maximum size is 5 MB.');
  }

  return detectCvFileKind(file);
}

async function extractPdfText(file: File) {
  const { PDFParse } = await import('pdf-parse');
  const buffer = Buffer.from(await file.arrayBuffer());
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText({ pageJoiner: '\n' });
    return result.text;
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

export async function extractTextFromCvFile(file: File) {
  const kind = validateCvFileMetadata(file);
  const rawText = kind === 'pdf' ? await extractPdfText(file) : await file.text();

  return {
    kind,
    fileName: file.name,
    text: validateExtractedCvText(rawText)
  };
}
