import { NextResponse } from 'next/server';
import { analyzeCvContext } from '@/lib/ai/cv-context';
import { CvValidationError, extractTextFromCvFile } from '@/lib/cv/extract';
import { getOrCreateSettings } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === 'object' &&
    value !== null &&
    'arrayBuffer' in value &&
    'name' in value &&
    'size' in value &&
    'type' in value
  );
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!isFile(file)) {
      return NextResponse.json({ error: 'Choose a PDF or text CV file first.' }, { status: 400 });
    }

    const extracted = await extractTextFromCvFile(file);
    const settings = await getOrCreateSettings();
    const analysis = await analyzeCvContext(extracted.text, {
      requestedProvider: settings.aiProvider,
      apiKey: settings.nvidiaApiKey
    });

    return NextResponse.json({
      fileName: extracted.fileName,
      fileKind: extracted.kind,
      draft: analysis.draft,
      provider: analysis.provider,
      fallbackReason: analysis.fallbackReason
    });
  } catch (error) {
    if (error instanceof CvValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('CV analysis failed', error);
    return NextResponse.json({ error: 'Could not analyze this CV. Try another PDF/TXT file.' }, { status: 500 });
  }
}
