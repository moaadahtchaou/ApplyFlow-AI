import { NextResponse } from 'next/server';
import { z } from 'zod';
import { analyzeCandidateProfile } from '@/lib/ai/cv-analysis';
import { cvExtractionResultSchema } from '@/lib/ai/contracts';
import { logAiError, publicError } from '@/lib/ai/storage';
import { assessCvExtraction, CvValidationError, extractTextFromCvFile } from '@/lib/cv/extract';
import { getOrCreateSettings } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isFile(value: FormDataEntryValue | null): value is File {
  return typeof value === 'object' && value !== null && 'arrayBuffer' in value && 'name' in value;
}

const analyzeRequestSchema = z.object({
  text: z.string().trim().min(20).max(30_000),
  extraction: cvExtractionResultSchema.optional()
});

let analysisRunning = false;

export async function POST(request: Request) {
  let claimedAnalysis = false;
  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file');
      const manualText = formData.get('manualText');
      const extraction = isFile(file)
        ? await extractTextFromCvFile(file)
        : typeof manualText === 'string'
          ? assessCvExtraction(manualText, { fileKind: 'manual' })
          : null;
      if (!extraction) return NextResponse.json({ error: 'Choose a CV file or paste CV text first.' }, { status: 400 });
      return NextResponse.json({ extraction });
    }

    const input = analyzeRequestSchema.parse(await request.json());
    if (analysisRunning) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'CV analysis is already running.',
          retryable: true,
          provider: 'nvidia'
        }
      }, { status: 409 });
    }
    analysisRunning = true;
    claimedAnalysis = true;
    const extraction = assessCvExtraction(input.text, {
      fileKind: input.extraction?.fileKind ?? 'manual',
      fileName: input.extraction?.fileName
    });
    const settings = await getOrCreateSettings();
    const analysis = await analyzeCandidateProfile(extraction, {
      requestedProvider: settings.aiProvider,
      apiKey: settings.nvidiaApiKey
    });
    return NextResponse.json({
      success: true,
      extraction,
      profile: analysis.profile,
      providerMetadata: analysis.metadata,
      promptVersion: analysis.promptVersion
    });
  } catch (error) {
    if (error instanceof CvValidationError) {
      return NextResponse.json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: error.message, retryable: false }
      }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'The CV text or extraction metadata is invalid.',
          retryable: false,
          ...(process.env.NODE_ENV === 'development'
            ? {
                debug: {
                  zodIssues: error.issues.slice(0, 20).map((issue) => ({
                    path: issue.path.join('.') || '(root)',
                    message: issue.message
                  }))
                }
              }
            : {})
        }
      }, { status: 400 });
    }
    logAiError('CV analysis failed', error);
    const response = publicError(error, 'Could not analyze this CV.');
    return NextResponse.json(response.body, { status: response.status });
  } finally {
    if (claimedAnalysis) analysisRunning = false;
  }
}
