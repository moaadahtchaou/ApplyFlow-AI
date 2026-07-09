export const companyStatuses = ['new', 'priority', 'archived'] as const;
export const tones = ['professional', 'friendly', 'direct', 'confident'] as const;
export const messageLanguages = ['English', 'French', 'Arabic', 'Darija'] as const;
export const templateTypes = ['job_application', 'general_outreach', 'linkedin_message', 'introduction', 'custom'] as const;

export type CompanyStatus = (typeof companyStatuses)[number];
export type Tone = (typeof tones)[number];
export type MessageLanguage = (typeof messageLanguages)[number];
export type TemplateType = (typeof templateTypes)[number];
