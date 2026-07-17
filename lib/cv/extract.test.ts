import { describe, expect, it } from 'vitest';
import {
  MAX_CV_FILE_SIZE,
  detectCvFileKind,
  extractTextFromCvFile,
  normalizeCvText,
  validateCvFileMetadata
} from './extract';

describe('CV extraction utilities', () => {
  it('extracts and normalizes plain text CV files', async () => {
    const file = new File([
      '  Full-Stack Developer\r\n\r\nSkills: React, TypeScript, Next.js\r\n  Casablanca  '
    ], 'cv.txt', { type: 'text/plain' });

    const extracted = await extractTextFromCvFile(file);

    expect(extracted.kind).toBe('text');
    expect(extracted.text).toContain('Full-Stack Developer');
    expect(extracted.text).toContain('Skills: React, TypeScript, Next.js');
  });

  it('keeps quoted and comma-separated text safe during cleanup', () => {
    expect(normalizeCvText('Skills: "React, Next.js", TypeScript\n\n\n\nProjects')).toBe(
      'Skills: "React, Next.js", TypeScript\n\n\nProjects'
    );
  });

  it('detects PDF and plain text files by mime type or extension', () => {
    expect(detectCvFileKind({ name: 'resume.pdf', type: '', size: 100 })).toBe('pdf');
    expect(detectCvFileKind({ name: 'resume.md', type: 'application/octet-stream', size: 100 })).toBe('text');
  });

  it('rejects unsupported, empty, and too-large files', () => {
    expect(validateCvFileMetadata({ name: 'cv.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 100 }))
      .toBe('docx');
    expect(() => validateCvFileMetadata({ name: 'cv.txt', type: 'text/plain', size: 0 }))
      .toThrow('empty');
    expect(() => validateCvFileMetadata({ name: 'cv.txt', type: 'text/plain', size: MAX_CV_FILE_SIZE + 1 }))
      .toThrow('too large');
  });

  it('rejects text files with no useful CV text', async () => {
    const file = new File(['      '], 'cv.txt', { type: 'text/plain' });

    await expect(extractTextFromCvFile(file)).rejects.toThrow('too short');
  });
});
