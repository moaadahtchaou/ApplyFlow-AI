const TECHNOLOGY_ALIASES: Record<string, string[]> = {
  'Node.js': ['node.js', 'nodejs', 'node js'],
  'PostgreSQL': ['postgresql', 'postgres'],
  'Next.js': ['next.js', 'nextjs', 'next js'],
  JavaScript: ['javascript'],
  TypeScript: ['typescript'],
  Shopify: ['shopify'],
  Liquid: ['liquid'],
  React: ['react'],
  Python: ['python'],
  MongoDB: ['mongodb', 'mongo db'],
  Docker: ['docker'],
  Prisma: ['prisma'],
  Java: ['java']
};

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
}

function containsTechnology(text: string, aliases: string[]) {
  return aliases.some((alias) => new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escapeRegex(alias)}(?=$|[^\\p{L}\\p{N}])`,
    'iu'
  ).test(text));
}

export function normalizeTechnology(value: string) {
  const normalized = value.toLocaleLowerCase().replace(/[\s.-]+/g, '');
  const match = Object.entries(TECHNOLOGY_ALIASES).find(([, aliases]) =>
    aliases.some((alias) => alias.toLocaleLowerCase().replace(/[\s.-]+/g, '') === normalized)
  );
  return match?.[0] ?? value.trim();
}

export function extractTechnologies(
  subject: string,
  body: string,
  candidateTechnologies: string[] = []
) {
  const text = `${subject}\n${body}`;
  const aliases = new Map<string, string[]>(
    Object.entries(TECHNOLOGY_ALIASES)
  );
  for (const technology of candidateTechnologies) {
    const canonical = normalizeTechnology(technology);
    const current = aliases.get(canonical) ?? [];
    aliases.set(canonical, [...current, technology]);
  }
  return [...aliases.entries()]
    .filter(([, values]) => containsTechnology(text, values))
    .map(([canonical]) => canonical);
}

export function configuredTechnologyLimit() {
  const value = Number(process.env.AI_MESSAGE_MAX_TECHNOLOGIES);
  return Number.isInteger(value) && value > 0 && value <= 20 ? value : 3;
}
