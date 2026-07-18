# ApplyFlow AI

ApplyFlow AI is a local-first company and contact manager with an AI message generator. It helps you research companies, organize contacts, reuse your CV/profile context, and create personalized job application or outreach messages.

ApplyFlow does not send email, connect to Gmail, track applications, or monitor replies. You review every generated message, copy it, and send it manually through Gmail, LinkedIn, or any other platform.

## Features

- Company CRM with contact details, notes, city/category tags, and CSV export
- Contacts linked to companies
- Google Maps Lead Finder with review, deduplication, CSV import/export, and selective company import
- Evidence-based AI Message Generator with structured CV context, sourced company research, candidate-company matching, quality evaluation, and one bounded automatic rewrite
- Explainable project and professional-experience ranking with Ready, Limited, Failed, and Outdated match states
- Immutable saved-message history with snapshot detail, copy, and delete actions
- English, French, Arabic, and Darija message generation
- Professional, friendly, direct, and confident tones
- Profile/CV upload and local candidate context
- Reusable message templates
- Explicit local Mock mode that works without an API key
- Optional NVIDIA provider
- Local SQLite storage

## Local setup

Requirements:

- Node.js 20.9 or newer
- npm

```powershell
npm install
Copy-Item .env.example .env
npx prisma migrate deploy
npx prisma generate
npm run setup:scraper
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The minimum `.env` file is:

```env
DATABASE_URL="file:./dev.db"
```

AI provider settings can be configured in the app. The NVIDIA key is stored only in the local SQLite database. Environment variables remain supported as configuration defaults:

```env
NVIDIA_API_KEY=""
NVIDIA_BASE_URL="https://integrate.api.nvidia.com/v1"
NVIDIA_MODEL="qwen/qwen3.5-122b-a10b"
NVIDIA_TIMEOUT_MS="120000"
AI_PROVIDER="mock"
AI_MATCH_READY_THRESHOLD="5"
AI_MESSAGE_MAX_TECHNOLOGIES="3"
```

`AI_PROVIDER=mock` explicitly enables deterministic local output and is labeled in the interface. With
`AI_PROVIDER=nvidia`, missing keys, timeouts, provider errors, and invalid responses are returned as errors;
the application never substitutes a mock success.

`AI_MATCH_READY_THRESHOLD` controls the minimum evidence-backed score for a Ready match. Lower
scores with usable candidate and company evidence are Limited and may generate only a cautious
spontaneous application. `AI_MESSAGE_MAX_TECHNOLOGIES` controls the unique technology limit used
by message quality evaluation.

## Main routes

- `/` — dashboard
- `/companies` — company manager and CSV export
- `/contacts` — contact manager
- `/lead-finder` — Google Maps research and CSV import/export
- `/ai-generator` — generate, edit, copy, and save messages
- `/templates` — reusable templates
- `/profile` — CV upload and candidate profile
- `/settings` — AI provider and default message style

## Local data and GitHub

Keep these files out of Git:

- `.env`
- `prisma/dev.db`
- `node_modules`
- `.next`
- Playwright browser binaries
- logs and generated exports containing private lead data

Use the Companies CSV export and Lead Finder CSV tools for portable backups. The Google Maps automation is intended for small, reviewed local research runs; Google can change the interface or request browser verification.

## Verification

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```
