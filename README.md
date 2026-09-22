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

For YouTube discovery and video comparisons, set `YOUTUBE_API_KEY` in `.env.local` and enable YouTube Data API v3 for its Google Cloud project. The key stays on the server; a service account is not needed for public videos, channels, or playlists. YouTube discovery and comparison work independently of Claude and Exa.

For Exa discovery, also set `EXA_API_KEY` in `.env.local`. Exa works independently of Claude for content recommendations. Chat and map/branch generation still require `ANTHROPIC_API_KEY`.

## How it works

1. Infinity asks what you want to learn.
2. Claude asks a short question about your experience and goal when more context is needed.
3. Claude generates specific topics, prerequisites, difficulty levels, estimated study time, and concepts.
4. The server validates the response schema and prerequisite graph, then computes the layout. Duplicate topics, cycles, and forward/dangling prerequisites are rejected.
5. Open the map or recursive outline, collapse branches, filter by difficulty, visit prerequisites, bookmark resources, and track completion.
6. Continue the conversation to ask for changes and generate a revised path.

### Grow any section

Select a topic, expand **Your selected topic** beneath the map, and open **Go deeper**. Choose Beginner, Intermediate, or Advanced, optionally add a focus, and generate 3–5 additional subtopics. Select a new subtopic to expand it again. Existing IDs, bookmarks, completion records, and resources remain intact. Each map supports up to 120 topics, including its root. Generation is disabled when fewer than three slots remain.

The outline follows each topic's first prerequisite; the graph and prerequisite panel retain all dependency edges. Layout is recalculated after expansion, including for older paths when browser storage is loaded.

### Discover actual sources

The recommendation engine sits beside the learning map on desktop. Open **Content library** for a full-width collection, or change the selected topic using its dropdown. Separate **Videos**, **Channels**, **Playlists**, **Blogs**, **Books**, **Papers**, and **Courses** views support difficulty, title search, and creator filters. **For you** mixes formats, prioritizing topic matches over explicitly labeled broader-path matches. Format and difficulty selections stay in place when changing topics or switching between the map and library.

Cards include direct links, suggested starting knowledge, source attribution, and bookmarks. Video thumbnails use the actual YouTube video ID; channel initials, playlist graphics, and book artwork are illustrative UI elements. Books include author information and any supported publisher, year, or ISBN details; absent metadata is not fabricated. **Show more picks** paginates the local collection without an API call. **Find new…** performs live discovery for the selected format and difficulty.

Choose **YouTube**, **Exa**, or **Claude** under **Search with**. The selection is remembered in this browser; new browsers start with YouTube. YouTube supports Videos, Channels, and Playlists. For other formats, explicitly select Exa or Claude. Switching providers cancels any pending search and clears its error. Already collected cards remain available and new cards identify which provider discovered them. There is no automatic fallback that silently charges a different provider. API clients that omit `provider` retain the previous Claude behavior.

**YouTube** uses the official Data API (`search.list`, then `videos.list`, `channels.list`, or `playlists.list`) to retrieve real titles, channel names, dates, durations, and playlist counts. Results follow YouTube relevance ordering. Difficulty is an estimate from explicit beginner/intermediate/advanced labels in the title; mixed or unlabeled titles are **Not assessed** and appear only under **All levels**. API metadata is cached in server memory for 10 minutes (up to 100 entries) to reduce repeated calls. A search examines up to 20 candidates and adds up to six new matching sources; it may find no new results once that set is collected. Quota, restricted-key, unavailable-video, and connection errors are shown without losing the library.

**Exa** uses `POST https://api.exa.ai/search` with `type: auto`, content highlights, and a compact output schema for URL, difficulty, author, and suitability. It retrieves and evaluates sources without calling Claude. Generated selections must match a direct URL and title present in Exa's results or grounding citations; unsupported URLs, duplicates, excluded sources, wrong YouTube formats, and wrong difficulty levels are omitted. Book authors are included when supported; this integration does not invent or extract chapter numbers, ISBNs, publishers, or publication years. Missing evaluation output produces an actionable error rather than guessed difficulty labels.

**Claude** uses Anthropic's `web_search_20250305` server tool. Web search must be enabled for your Anthropic organization. It uses up to three searches per search turn (with one continuation if the server pauses), followed by a separate structured ranking request. This separation preserves Anthropic's mandatory search citations. Both providers consume their respective API credits.

For Claude, only URLs actually returned in web-search result blocks can become live recommendations. Its ranker selects source IDs and cannot supply destination URLs. YouTube videos, channels, and playlists are validated separately for both providers, so a channel request cannot return videos. Search pages, unsafe URL schemes, duplicate URLs, and previously collected sources are excluded. Results must match the selected difficulty. If no suitable new sources are found, the UI says so. Live web search establishes that a source was retrieved; it does not guarantee factual quality, full-text access, or future availability. Difficulty is an estimate, and some sources may require payment.

The curated library covers Python, mathematics, machine learning, neural networks, data analysis, and web development, with source pages reviewed on 21–22 September 2026. These cards are labeled **Curated pick** and work without API access. Matching uses explicit topic tags and path context; it is not live AI ranking. Uncovered topics show an empty state with discovery and clearly labeled external-search options. Authentication or search failures leave existing recommendations available. Search-result pages never appear as recommendation cards; old user bookmarks are retained. The application never silently substitutes a template or fabricated source when Claude fails.

The interface uses an animated SVG infinity background, charcoal surfaces with violet and mint accents, a responsive sidebar, and a chat composer with loading, stop, retry, and provider error states. Reduced-motion preferences are respected for CSS animation.

### Compare videos from different creators

On a video card, choose **Compare with another creator**. Infinity searches using its title, excludes the starting channel, and lets you refine the query or paste a specific video URL. Select a candidate to see both creators, durations, chapter counts, and a topic-by-topic evidence table. **Shared**, **Only listed in A**, and **Only listed in B** filters highlight overlaps and potential extra material. Chapter evidence links directly to the timestamp; source descriptions are available below the table.

Comparison uses conservative text matching on creator-written chapter headings and exact topic mentions in descriptions. It does not download captions or analyze audio. **Not listed** means no matching metadata evidence, not that a topic is absent from the lesson. Different chapter names may not match, and videos with sparse descriptions may not provide enough evidence. The feature works without an LLM key.

## Storage and privacy

Paths, generated branches, discovered resources, bookmarks, progress, and the current conversation are saved in this browser's localStorage. Existing `rooted-v1` data is migrated into `infinity-v1` without deleting the original data. The discovery provider preference is stored separately under `infinity-discovery-provider`. Chat sends conversation messages to Anthropic; branch generation sends topic context; discovery sends the selected topic and filters to the selected provider (Exa and Claude also receive excluded source URLs). YouTube comparison sends video IDs and a title or topic search query to Google. Descriptions and chapter markers are compared locally on the server. There is no login, database, or cross-device synchronization.

All API endpoints share same-origin checks, input validation, timeouts, and conservative process-local limits (30 actions per hour, two concurrent actions), including across discovery providers. This is a single-user local prototype. Before public deployment, add authentication and shared per-user rate limiting; process-local limits do not protect a multi-instance deployment. Keys stay in server-side environment variables. Navigation or Stop cancels pending branch/discovery requests, and an error leaves existing data intact. Raw provider error bodies and credentials are never returned to the browser.

## Validation

```sh
npm test
npm run typecheck
npm run build
```

Tests cover recursive expansion, large-map layout, preserving existing resources, malformed graphs, direct URL validation, source provenance, difficulty matching, book metadata, deduplication, same-origin handling, and mocked Anthropic chat/expansion/search/error responses. Search tests verify separate discovery/ranking calls and unchanged encrypted evidence across a paused search. YouTube tests also cover chapter parsing, cross-creator selection, unavailable videos, source evidence, title-based difficulty, caching, quota errors, and server-only credential handling. Provider-mocked tests do not validate your actual API key, web-search entitlement, or billing account.

If the app reports an authentication error, replace the key. A billing error means the Anthropic API account needs credits. A model-not-found error requires an available model in `ANTHROPIC_MODEL`. Error responses never include the provider's headers or credentials.

## Files

- `app/page.tsx`: Chat interface, navigation, persistence, collections.
- `components/learning-map.tsx`: Interactive graph and topic/resource explorer.
- `components/topic-expansion.tsx`: Branch generation controls and recursive outline.
- `components/topic-resources.tsx`: Recommendation engine, format and creator filters, source cards, discovery, and book references.
- `app/api/{chat,expand,resources,youtube}/route.ts`: Server-only generation, discovery, and comparison endpoints.
- `components/video-comparison.tsx`, `app/youtube.css`: Accessible video comparison dialog and responsive styles.
- `lib/youtube.ts`, `lib/server/youtube.ts`: Chapter parsing, evidence comparison, YouTube API metadata, caching, and sanitized errors.
- `lib/learning.ts`, `lib/branches.ts`: Schemas, graph validation, layout, and expansion.
- `lib/resources.ts`, `lib/server/discovery.ts`: Source validation, discovery, and ranking.
- `lib/server/exa.ts`: Independent Exa retrieval, structured evaluation, evidence validation, and sanitized errors.
- `lib/curated-resources.ts`: Reviewed starter sources.
- `lib/recommendations.ts`: Format classification, filters, mixed-format ordering, and bookmark identity.
- `app/data.ts`: Shared types and example path.
- `app/globals.css`, `app/recommendations.css`: Dark theme, learning studio, responsive layout, and animations.
- `tests/*.test.ts`: Data and API integration tests with a mocked provider.

Production: run `npm run build` followed by `npm start`.
