import type { AiEmailGenerationContext, AiEmailResponse } from '@/lib/validations/ai';

function firstName(name?: string | null) {
  return name?.trim().split(/\s+/)[0];
}

function englishTone(tone: string) {
  if (tone === 'friendly') return 'I enjoyed learning about your team and wanted to reach out personally.';
  if (tone === 'direct') return 'I am contacting you directly because my background may fit what your team needs.';
  if (tone === 'confident') return 'I am confident that my background could bring practical value to your team.';
  return 'I am reaching out to introduce my profile and express my interest.';
}

export function generateMockEmail(input: AiEmailGenerationContext): AiEmailResponse {
  const company = input.companyName || 'your company';
  const contact = firstName(input.contactName);
  const signature = input.signature?.trim() || 'Best regards';

  if (input.language === 'French') {
    return {
      subject: `${input.purpose} — ${company}`,
      body: `Bonjour${contact ? ` ${contact}` : ''},\n\nJe vous contacte au sujet de ${input.purpose} chez ${company}. Mon profil comprend : ${input.candidateProfile}\n\nJe serais ravi d’échanger avec vous pour voir comment je pourrais contribuer à votre équipe.\n\n${signature}`
    };
  }

  if (input.language === 'Arabic') {
    return {
      subject: `${input.purpose} — ${company}`,
      body: `مرحباً${contact ? ` ${contact}` : ''}،\n\nأتواصل معكم بخصوص ${input.purpose} لدى ${company}. نبذة عن ملفي: ${input.candidateProfile}\n\nيسعدني التحدث معكم حول الطريقة التي يمكنني بها المساهمة مع فريقكم.\n\n${signature}`
    };
  }

  if (input.language === 'Darija') {
    return {
      subject: `${input.purpose} — ${company}`,
      body: `Salam${contact ? ` ${contact}` : ''},\n\nKantwasel m3ak bkhossous ${input.purpose} f ${company}. Had نبذة 3la profil dyali: ${input.candidateProfile}\n\nYserni ntwaslo bach nchof kifach n9der nzid قيمة l team dyalkom.\n\n${signature}`
    };
  }

  return {
    subject: `${input.purpose} — ${company}`,
    body: `Hello${contact ? ` ${contact}` : ''},\n\n${englishTone(input.tone)} I am contacting you about ${input.purpose} at ${company}${input.companyIndustry ? ` in the ${input.companyIndustry} space` : ''}.\n\nMy background: ${input.candidateProfile}\n\nI would be glad to discuss how I could contribute to your team. Thank you for your time.\n\n${signature}`
  };
}
