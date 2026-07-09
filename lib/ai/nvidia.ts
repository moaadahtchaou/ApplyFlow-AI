import { aiEmailResponseSchema, type AiEmailGenerationContext, type AiEmailResponse } from '@/lib/validations/ai';

const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';

type NvidiaMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type NvidiaChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

function buildPrompt(input: AiEmailGenerationContext) {
  return `Create a personalized, natural, non-spammy job outreach message.

Return ONLY valid JSON with these keys:
{
  "subject": "string",
  "body": "string"
}

Rules:
- Write all returned messages in ${input.language}.
- Do not sound like a mass email.
- Keep the message specific, concise, and professional.
- Do not invent achievements.
- Use only the supplied candidate profile.
- If no contact name exists, use a neutral greeting.

Context:
Company: ${input.companyName}
Company website: ${input.companyWebsite ?? 'Not provided'}
Industry: ${input.companyIndustry ?? 'Not provided'}
Contact name: ${input.contactName ?? 'Not provided'}
Contact title: ${input.contactTitle ?? 'Not provided'}
Message purpose or target role: ${input.purpose}
Tone: ${input.tone}
Language: ${input.language}
Candidate profile: ${input.candidateProfile}
Signature: ${input.signature ?? 'Not provided'}`;
}

function parseJsonContent(content: string): AiEmailResponse {
  const cleaned = content
    .trim()
    .replace(/^```json/i, '')
    .replace(/^```/i, '')
    .replace(/```$/i, '')
    .trim();

  const parsed: unknown = JSON.parse(cleaned);
  return aiEmailResponseSchema.parse(parsed);
}

export async function generateWithNvidia(input: AiEmailGenerationContext, storedApiKey?: string): Promise<AiEmailResponse> {
  const apiKey = storedApiKey?.trim() || process.env.NVIDIA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('NVIDIA_API_KEY is not configured.');
  }

  const model = process.env.NVIDIA_MODEL?.trim() || 'qwen/qwen3.5-122b-a10b';

  const messages: NvidiaMessage[] = [
    {
      role: 'system',
      content:
        'You are an expert career outreach writer. Create one personalized message using only supplied facts. Return valid JSON only.'
    },
    {
      role: 'user',
      content: buildPrompt(input)
    }
  ];

  const response = await fetch(NVIDIA_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.45,
      top_p: 0.9,
      max_tokens: 900
    }),
    cache: 'no-store'
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NVIDIA request failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as NvidiaChatResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('NVIDIA response did not include message content.');
  }

  return parseJsonContent(content);
}
