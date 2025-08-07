# Ingredibud

Ingredibud is a playful, AI‑powered recipe generator built with Next.js. Give it a cuisine, diet, ingredients to include/exclude—or nothing at all—and it will fetch grounded results via Google Search and synthesize a concise, beginner‑friendly recipe with Gemini. The UI is responsive with a collapsible navbar on mobile and consistent, animated buttons throughout.

Live Site

- Check it out: https://ingredibud.vercel.app/
- Repository: https://github.com/michniks2001/ingredibud

Key Features

- Recipe Generator (/recipes) using Gemini + Google Search
- Responsive, collapsible navbar (mobile hamburger)
- Consistent, animated buttons and polished UX
- Markdown-to-HTML rendering with sanitization
- Robust source URL cleanup:
  - Unwraps Vertex AI grounding redirect URLs
  - Follows HTTP redirects and honors canonical/og:url
  - 404/slug correction and domain-aware fallback search (Food.com, WordPress)

Routes

- `/` — Landing page with CTA
- `/recipes` — Recipe generator UI
- `/about` — About the project
- `/faq` — Frequently asked questions

Tech Stack

- Next.js (App Router), TypeScript, Tailwind CSS
- Google Generative AI (Gemini) with the googleSearch tool
- Fetch with timeouts and safe URL normalization

## Getting Started

First, set your environment variable:

1. Create a `.env.local` at the project root with:

```
GEMINI_API_KEY=your_api_key_here
```

2. Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing by modifying files in `app/` (e.g., `app/page.tsx`, `app/recipes/page.tsx`). The dev server auto‑updates as you edit.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load fonts (e.g., Jost).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new). Be sure to set the `GEMINI_API_KEY` environment variable in your hosting provider.

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
