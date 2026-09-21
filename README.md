# Infinity

A Next.js learning companion powered by Anthropic Claude. Start with a conversation, describe your experience and goal, and explore a dynamically generated learning map.

## Run locally

```sh
npm install
test -f .env.local || cp .env.example .env.local
```

Set `ANTHROPIC_API_KEY` in `.env.local` to a valid Anthropic API key, then run:

```sh
npm run dev
```

Open http://localhost:3000. The model defaults to `claude-sonnet-4-6`; change `ANTHROPIC_MODEL` to another structured-output-compatible model available to your account if needed. Restart the development server after changing environment variables if they are not picked up automatically.

Never put the key in a `NEXT_PUBLIC_` variable, browser storage, or client-side code. `.env.local` is ignored by Git. Replace any key that has been shared in a conversation or exposed publicly.

## How it works

1. Infinity asks what you want to learn.
2. Claude asks a short question about your experience and goal when more context is needed.
3. Claude generates specific topics, prerequisites, difficulty levels, estimated study time, concepts, and resource-search suggestions.
4. The server validates both the response schema and prerequisite graph, then computes the layout. Duplicate topics, cycles, forward/dangling prerequisites, and missing resource categories are rejected.
5. Open the generated map, collapse branches, use map/list views, filter by difficulty, visit prerequisites, bookmark resources, and track completion.
6. Continue the conversation to ask for changes and generate a revised path.

YouTube, blog, paper, and other resource links open searches based on Claude's suggestions. They are not verified search results or live-retrieved citations. The included example path also has selected direct resources. The application never silently substitutes a template when Claude fails.

The interface uses an animated SVG infinity background, charcoal and violet colors, a responsive sidebar, and a chat composer with loading, stop, retry, and provider error states. Reduced-motion preferences are respected for CSS animation.

## Storage and privacy

Paths, bookmarks, progress, and the current conversation are saved in this browser's localStorage. Existing `rooted-v1` data is migrated into `infinity-v1` without deleting the original data. Chat requests send the latest conversation messages to Anthropic. There is no login, database, or cross-device synchronization.

The endpoint has same-origin checks, request-size validation, a timeout, and conservative process-local limits (30 requests per hour, two concurrent requests). This is a single-user local prototype. Before public deployment, add authentication and shared per-user rate limiting; process-local limits do not protect a multi-instance deployment. The key stays in server-side environment variables.

## Validation

```sh
npm test
npm run typecheck
npm run build
```

Tests cover graph layout, malformed graphs, URL encoding, input validation, same-origin handling, and mocked Anthropic question/path/error responses. Provider-mocked tests do not validate your actual API key or billing account.

If the app reports an authentication error, replace the key. A billing error means the Anthropic API account needs credits. A model-not-found error requires an available model in `ANTHROPIC_MODEL`. Error responses never include the provider's headers or credentials.

## Files

- `app/page.tsx`: Chat interface, navigation, persistence, collections.
- `components/learning-map.tsx`: Interactive graph and topic/resource explorer.
- `app/api/chat/route.ts`: Server-only Claude integration and error handling.
- `lib/learning.ts`: Schemas, graph validation, layout, safe discovery URLs.
- `app/data.ts`: Shared types and legacy example resources.
- `app/globals.css`: Dark theme, responsive layout, and animations.
- `tests/learning.test.ts`: Data and API integration tests with a mocked provider.

Production: run `npm run build` followed by `npm start`.
