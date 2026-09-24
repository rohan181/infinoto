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

### Choose what to learn next

**What should I learn next?** appears above every learning map. Set the time available (5–480 minutes) to see an unfinished topic whose prerequisites are complete, plus up to two alternatives. Recommendations favor topics that fit the session, continue completed work, and unlock other topics. If a topic needs more time, the planner suggests a starting session around its first concept and shows the full topic estimate separately. Suggested times are planning estimates, not measured progress. Open a recommendation to reveal its topic details and resources; mark the whole topic complete when ready. Completion, undo, and newly generated branches update recommendations immediately. The planner runs locally without an AI request, and your time preference is remembered in this browser.

### Quick quizzes per node

Use the quiz icon on any map node, **Quick quiz** in topic details, or the quiz button above the content library. Claude generates three multiple-choice questions matched to the topic’s concepts and difficulty. Check each answer to reveal its explanation, then review the score and concepts to revisit. The latest quiz and submitted answers are saved locally per path and topic, so reopening resumes an unfinished attempt or shows its results. **Retake quiz** reuses the questions; **Generate new questions** replaces them only after successful generation. Updated topic content invalidates an older quiz. Results never mark a topic complete automatically; completion remains an explicit choice. These are AI-generated self-checks, not certification of mastery. Generation uses the existing Anthropic server configuration and request limits.

### Grow any section

Select a topic, expand **Your selected topic** beneath the map, and open **Go deeper**. Choose Beginner, Intermediate, or Advanced, optionally add a focus, and generate 3–5 additional subtopics. Select a new subtopic to expand it again. Existing IDs, bookmarks, completion records, and resources remain intact. Each map supports up to 120 topics, including its root. Generation is disabled when fewer than three slots remain.

The outline follows each topic's first prerequisite; the graph and prerequisite panel retain all dependency edges. Layout is recalculated after expansion, including for older paths when browser storage is loaded.

### Discover actual sources

The recommendation engine sits beside the learning map on desktop. Open **Content library** for a full-width collection, or change the selected topic using its dropdown. Separate **Videos**, **Channels**, **Playlists**, **Blogs**, **Books**, **Papers**, and **Courses** views support difficulty, title search, and creator filters. **All sources** mixes formats, prioritizing topic matches over explicitly labeled broader-path matches. Selecting any node automatically searches for its topic in the current format. **All sources** is the initial view and searches videos and blogs together, showing each as it arrives; either search can succeed independently. Other formats are searched when their tab is selected. Format and difficulty selections stay in place when changing topics or switching between the map and library. Queries are debounced by 450 ms; successful nonempty results are cached per topic/format/provider/level for 10 minutes in this tab, and cancelled on navigation. Late results cannot be attached to another node. Broader-path sources are hidden unless enabled in Search settings.

**Best for this node** is the default recommendation order. It ranks collected sources by selected-topic and concept matches, the node’s difficulty (or an explicit difficulty filter), and teaching signals in titles and retrieved excerpts. It favors focused videos/articles over generic channels, reduces repeated publishers and formats near the top, and keeps broader-path material after direct matches. Discovery date and search provider do not earn a quality bonus. **Recently found** remains available. Cards explain their topic/level fit; a directly matching first result at the selected level is labeled **Start here**. These are metadata-based suitability estimates, not claims of having watched or fact-checked a source. Generated recommendation reasons are not used as independent concept evidence. Web search prioritizes the node’s stage instead of forcing two resources at each difficulty, and All levels continues to permit unknown or other levels. Exa highlights and YouTube descriptions are retained as bounded source excerpts for ranking. Specialized nodes must match more than a shared language/path word; concrete concepts support broader nodes such as Mathematics.

Cards include direct links, suggested starting knowledge, source attribution, and bookmarks. Video thumbnails use the actual YouTube video ID; channel initials, playlist graphics, and book artwork are illustrative UI elements. Books include author information and any supported publisher, year, or ISBN details; absent metadata is not fabricated. **Show more picks** paginates the local collection without an API call. **Find new…** performs live discovery for the selected format and difficulty.

**Search settings** remembers separate providers for video formats (YouTube when configured) and blogs/books/papers/web (Exa when configured). Switching to Blogs or Web therefore works immediately after browsing videos. Choose Claude explicitly if desired; its API key and web-search access must be valid. The library checks server configuration on load, skips missing or placeholder keys, and selects an available provider (including Claude) if a saved engine is unavailable. Explicit requests never silently switch providers after an API failure. Search settings disables engines with missing keys. API clients that omit `provider` retain the previous Claude behavior. A refinement field changes the live query; the collection filter only searches collected titles and creators. **Find more sources** excludes the current format's collected links; All sources maintains separate exclusions for videos and blogs. Temporary network and 502/504 failures retry once; credential and quota errors do not. One malformed result no longer discards other validated cards.

Topic queries use the selected node rather than appending the whole roadmap to every search. Generic labels such as Mathematics retain the path for disambiguation.

**YouTube** uses the official Data API (`search.list`, then `videos.list`, `channels.list`, or `playlists.list`) to retrieve real titles, channel names, dates, durations, and playlist counts. Videos are ranked by topic overlap, explicit teaching signals, and available chapters, with at most two results per creator and a minimum one-minute duration. This is a metadata-based heuristic, not a guarantee of lesson quality. Difficulty is an estimate from explicit beginner/intermediate/advanced labels in the title; mixed or unlabeled titles are **Not assessed** and appear only under **All levels**. API metadata is cached in server memory for 10 minutes (up to 100 entries) to reduce repeated calls. A query examines up to 20 candidates and adds up to six new matching sources. Empty video searches get one simpler follow-up query with the selected topic and filters preserved. Empty responses are not cached. Quota, restricted-key, unavailable-video, and connection errors are shown without losing the library.

**Exa** uses `POST https://api.exa.ai/search` with `type: auto`, content highlights, and a compact output schema for URL, difficulty, author, and suitability. It retrieves and evaluates sources without calling Claude. Generated selections must match a direct URL and title present in Exa's results or grounding citations; unsupported URLs, duplicates, excluded sources, wrong YouTube formats, and wrong difficulty levels are omitted. Book authors are included when supported; this integration does not invent or extract chapter numbers, ISBNs, publishers, or publication years. If evaluation output is missing or malformed, All levels can still show directly retrieved, topic-matching pages labeled Not assessed. A specific difficulty instead shows an actionable message to choose All levels; it is never guessed. Course landing pages do not appear in Blogs. Publisher diversity limits repeated sources. Empty searches get one alternative query when available; blog retries use a shorter article/tutorial query and generic roadmap labels use a concrete concept. Topic relevance is evaluated separately from path context so path-only matches do not qualify as direct topic results.

**Claude** uses Anthropic's `web_search_20250305` server tool. Web search must be enabled for your Anthropic organization. It uses up to three searches per search turn (with one continuation if the server pauses), followed by a separate structured ranking request. This separation preserves Anthropic's mandatory search citations. Both providers consume their respective API credits.

For Claude, only URLs actually returned in web-search result blocks can become live recommendations. Its ranker selects source IDs and cannot supply destination URLs. YouTube videos, channels, and playlists are validated separately for both providers, so a channel request cannot return videos. Search pages, unsafe URL schemes, duplicate URLs, and previously collected sources are excluded. Results must match the selected difficulty. If no suitable new sources are found, the UI says so. Live web search establishes that a source was retrieved; it does not guarantee factual quality, full-text access, or future availability. Difficulty is an estimate, and some sources may require payment.

The curated library covers Python, mathematics, machine learning, neural networks, data analysis, and web development, with source pages reviewed on 21–22 September 2026. These cards are labeled **Curated pick** and work without API access. Matching uses explicit topic tags and path context; it is not live AI ranking. Uncovered topics show an empty state with discovery and clearly labeled external-search options. Authentication or search failures leave existing recommendations available. Search-result pages never appear as recommendation cards; old user bookmarks are retained. The application never silently substitutes a template or fabricated source when Claude fails.

The interface uses an animated SVG infinity background, charcoal surfaces with violet and mint accents, a responsive sidebar, and a chat composer with loading, stop, retry, and provider error states. Reduced-motion preferences are respected for CSS animation.

### Social content for each topic

Choose **Social** in the content library to discover public posts, discussions, communities, and creators on **Reddit, X, LinkedIn, Instagram, and TikTok**. Use **All platforms** or a single-platform filter; both Exa and Claude searches enforce that selection. Cards identify the platform, link directly to the original content, and support bookmarks. Social resources also appear in cross-content analysis and its graph. For unavailable post text, paste an excerpt into the analysis dialog. Search covers indexed public pages, not authenticated feeds; platform access and indexing can limit results. No social account connection is required by Infinity.

### Compare videos from different creators

On a video card, choose **Compare with another creator**. Infinity searches using its title, excludes the starting channel, and lets you refine the query or paste a specific video URL. Select a candidate to see both creators, durations, chapter counts, and a topic-by-topic evidence table. Clickable coverage summary cards and **Shared**, **Only listed in A**, and **Only listed in B** filters highlight overlaps and potential extra material. Search within the comparison to find a topic. Mobile uses stacked evidence cards; desktop uses a table. The dialog has a persistent close button and restores keyboard focus. Chapter evidence links directly to the timestamp; source descriptions are available below the table.

Comparison uses conservative text matching on creator-written chapter headings and exact topic mentions in descriptions. It does not download captions or analyze audio. **Not listed** means no matching metadata evidence, not that a topic is absent from the lesson. Different chapter names may not match, and videos with sparse descriptions may not provide enough evidence. The feature works without an LLM key.

## Storage and privacy

Paths, generated branches, discovered resources, bookmarks, progress, and the current conversation are saved in this browser's localStorage. Existing `rooted-v1` data is migrated into `infinity-v1` without deleting the original data. Provider preferences are stored separately under `infinity-video-provider` and `infinity-web-provider`. Chat sends conversation messages to Anthropic; branch generation sends topic context; discovery sends the selected topic and filters to the selected provider (Exa and Claude also receive excluded source URLs). YouTube comparison sends video IDs and a title or topic search query to Google. Descriptions and chapter markers are compared locally on the server. There is no login, database, or cross-device synchronization.

All API endpoints share same-origin checks, input validation, timeouts, and conservative process-local limits (30 generation/comparison actions and 120 discovery actions per hour, two concurrent actions across both buckets), including across discovery providers. This is a single-user local prototype. Before public deployment, add authentication and shared per-user rate limiting; process-local limits do not protect a multi-instance deployment. Keys stay in server-side environment variables. Navigation or Stop cancels pending branch/discovery requests, and an error leaves existing data intact. Raw provider error bodies and credentials are never returned to the browser.

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
- `components/use-topic-discovery.ts`: Debounced, cancellable topic discovery with a bounded browser-session cache.
- `lib/topic-search.ts`: Topic query focus, metadata relevance, and source diversity.
- `app/library-refresh.css`: Topic library and responsive comparison redesign.
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

## Vercel configuration

Local `.env.local` values are not uploaded to Vercel. In the existing **infinoto** project's Settings → Environment Variables, set `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `YOUTUBE_API_KEY`, and `EXA_API_KEY` for Production (and Preview if desired), then redeploy. Keep all keys server-only, without a `NEXT_PUBLIC_` prefix. `GET /api/resources` reports only configuration booleans and never validates or reveals keys; successful search requests verify provider access. A configured key can still fail due to quota, permissions, or billing.

## Cross-content analysis and Whisper

Open a learning topic and choose **Cross-content analysis** above the format tabs. Select 2–6 resources across the current learning path and saved collection, or add direct HTTPS links. Selection is independent of the current Videos/Blogs/Web tab. Click **Analyze selected sources** to compare concept coverage and see a suggested learning order with source excerpts.

- Claude analyzes the selected topic against supplied evidence. Every concept/learning-order citation must resolve to a source-owned evidence ID. Links, quotes, and timestamps come from that evidence, not model-generated URLs. Coverage judgments and learning-order reasons remain AI estimates; valid citations do not guarantee the inference is correct.
- Exa's `/contents` endpoint retrieves article, documentation, paper, and landing-page text. Extraction failures leave clearly labeled title-only evidence. Retrieved pages are labeled as potentially partial; a book/course landing page does not represent the full work. Up to 18,000 characters per source and 100 evidence segments are analyzed.
- YouTube's official API supplies video descriptions and chapter markers. Those remain **Metadata only**, with coverage capped at **mention**. The app does not download arbitrary YouTube audio or claim it has retrieved transcripts. Paste a transcript or import TXT, SRT, VTT, or Markdown to analyze spoken content. Caption timestamps are preserved; article text is untimed.
- **Transcribe with Whisper** accepts MP3, MP4, MPEG, MPGA, M4A, WAV, or WebM files and calls OpenAI's `whisper-1` with segment timestamps. Set server-only `OPENAI_API_KEY` in `.env.local` and the Vercel environment; restart/redeploy afterward. Missing credentials disable audio uploads with a visible explanation. Claude text analysis works independently of this key. The 4 MB per-file limit leaves room for multipart overhead on the Vercel deployment; use shorter/compressed clips or import transcripts for long recordings. For video excerpts, enter the clip's start time in the original video before uploading. Review transcription errors before analysis.

Audio is sent to OpenAI; source text is sent to Anthropic; web URLs are sent to Exa. Uploaded text and comparison results are held in dialog memory, not localStorage or a database, and cleared when the dialog closes. No application-level transcript cache or background queue is used in this initial on-demand implementation. Provider retention policies apply. Close/Stop cancels pending analysis or transcription. Limits and sanitized error handling are shared with existing generation endpoints. New endpoints are `/api/content-analysis` and `/api/transcribe`.

Tests cover SRT/VTT timestamps, clip offsets, resource deduplication, bounded uploads without Content-Length, credential isolation, provider failures, retrieval provenance, and rejection of nonexistent/cross-source evidence citations. Whisper network calls are mocked when no OpenAI key is configured; this does not verify account billing or live transcription quality.

If an unrelated shell tool exports `ANTHROPIC_API_KEY`, Next.js preserves that shell value ahead of `.env.local`. Set `INFINOTO_ANTHROPIC_API_KEY` for this project to take precedence; all Claude features and configuration checks support it, with `ANTHROPIC_API_KEY` as the fallback. Do not expose either variable to the client.
