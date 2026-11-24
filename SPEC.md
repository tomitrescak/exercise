# Exercise Routine Coach — Specification

## 1. Purpose

A personal web app for building, refining and running whole-body exercise routines with an AI coach.

- An **expert coach agent** (OpenAI API) designs routines and researches them online. Every exercise comes with a verified YouTube technique video.
- I can **chat with a routine** to change it. The agent edits a live draft, and I can **save the draft as a new routine** without changing the original.
- I can **start a routine** and follow a guided player that shows the current exercise, set and rep. It runs rest timers, tracks the total time and **records the workout** to history.

The default focus is **balanced whole-body training**. A prompt can shift it to any other goal, for example "bigger chest", "legs only", "15-minute mobility" or "no floor work".

### 1.1 Origin (seed context from the referenced ChatGPT conversation)

The conversation reviewed a 30-minute, 3-round circuit done 3–4×/week:
KB 12 kg overhead rotations, swings, halos and simulated throws, plus 30 wide push-ups, 10 close push-ups, 20 sit-ups, 12 leg raises, weighted single-leg crunches and 24 kg barbell curls.

Key findings that the agent must be able to reproduce:

| Finding | Implication for the app |
|---|---|
| Rated 7/10 general fitness, 6/10 balance | The agent should **rate** existing routines and explain its ratings |
| No knee-dominant leg work, too much push vs pull, too much core | The agent checks **movement-pattern balance** (squat, hinge, lunge, push, pull, carry/core) |
| Goal = hypertrophy → 6–15 (up to 30) reps, 2–3 RIR, progressive overload | The agent asks for the **goal** and sets rep ranges and RIR from it |
| User: 81 kg, push-up max ~30, KB 12 kg, barbell max 24 kg, ~30–40 min cap | A **user profile** (body data, equipment, time cap) feeds every prompt |
| Medical history (brain surgery, glioblastoma treatment, past vertigo) → avoid breath-holding, explosive/unstable/overhead loaded moves, training to failure; seek clearance | The profile holds **health constraints**. The agent must respect them and flag risky exercises |
| Chest priority → standard, feet-elevated and close-grip push-ups, ~12 sets/week | Goals can **re-weight volume** toward a muscle group |
| The agent asks clarifying questions (goal, weight, max reps, equipment) | The agent **asks before assuming** when key data is missing |

**Seed data:** the app ships with a seed script that creates this profile (body data, equipment, goal, benchmarks; **`healthConstraints` left empty**, so I enter them myself on the profile page) and two routines:
1. "Original circuit (as reviewed)"
2. "Full-body hypertrophy (12 kg KB / 24 kg BB)", from the conversation's recommended plan: goblet squat, push-ups, bent-over row, reverse lunge, Romanian deadlift, barbell curl and dead bug, 2–3 rounds.

## 2. Tech stack

| Concern | Choice |
|---|---|
| Framework | Next.js (latest stable, App Router, Server Components, Route Handlers, Server Actions) |
| Language | TypeScript, `strict: true` |
| Package manager | pnpm (`packageManager` pinned in package.json) |
| Database | PostgreSQL 16+ (local via `docker compose`) |
| ORM | Prisma 8 (`prisma migrate`, typed client, seed script) |
| Client data | TanStack Query (server state, mutations, optimistic updates) |
| Forms | TanStack Form + Zod (profile and manual routine edits) |
| Validation | Zod schemas shared by the API, the agent tool schemas and the forms |
| AI | Official `openai` Node SDK, **Responses API**, streaming, function tools + hosted `web_search` tool, Structured Outputs |
| Video | YouTube Data API v3 (search + `videos.list` verification); `youtube-nocookie.com` embeds |
| UI | Tailwind CSS + shadcn/ui; mobile-first (the player is used on a phone) |
| Testing | Vitest (units: schemas, timer math, draft diff), Playwright (E2E happy paths) |

Environment variables: `DATABASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL` (default: a current reasoning-capable model, configurable), `YOUTUBE_API_KEY`, `APP_PASSWORD` (required; see §8 Security), `SESSION_SECRET`.

## 3. Domain model (Prisma)

```prisma
model UserProfile {            // single row (single-user app)
  id               String   @id @default(cuid())
  displayName      String?
  ageYears         Int?
  sex              String?
  weightKg         Float?
  heightCm         Float?
  experienceLevel  String   // beginner | intermediate | advanced
  primaryGoal      String   // e.g. hypertrophy, strength, general_health, fat_loss, mobility
  focusNotes       String?  // e.g. "large chest priority"
  equipment        Json     // [{ name: "Kettlebell", loadsKg: [12] }, { name: "Barbell", maxKg: 24, adjustable: true }]
  sessionMaxMinutes Int     @default(30)
  sessionsPerWeek  Int      @default(3)
  healthConstraints String? // free text; ALWAYS injected into agent context
  benchmarks       Json?    // e.g. { pushUpMax: 30 }
  updatedAt        DateTime @updatedAt
}

model Routine {
  id                 String   @id @default(cuid())
  name               String
  description        String?
  goal               String
  format             RoutineFormat // CIRCUIT (rounds through all exercises) | STRAIGHT_SETS
  rounds             Int      @default(1)     // CIRCUIT only
  restBetweenRoundsSec Int    @default(90)
  estimatedMinutes   Int
  coachNotes         String?  // rationale, progression rules, safety notes
  rating             Json?    // optional agent rating { overall, balance, comments }
  parentId           String?  // lineage: "saved as new" from this routine
  parent             Routine? @relation("Lineage", fields: [parentId], references: [id])
  children           Routine[] @relation("Lineage")
  archived           Boolean  @default(false)
  exercises          RoutineExercise[]
  conversations      Conversation[]
  sessions           WorkoutSession[]
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}

model RoutineExercise {
  id             String  @id @default(cuid())
  routineId      String
  routine        Routine @relation(fields: [routineId], references: [id], onDelete: Cascade)
  position       Int
  name           String           // "Goblet squat"
  movementPattern String          // squat | hinge | lunge | push_horizontal | push_vertical | pull_horizontal | pull_vertical | core | carry | mobility | conditioning
  primaryMuscles String[]
  equipment      String?          // "Kettlebell 12 kg"
  loadKg         Float?
  sets           Int              // STRAIGHT_SETS: sets; CIRCUIT: sets per round (usually 1)
  repsMin        Int?
  repsMax        Int?
  durationSec    Int?             // timed exercises (plank); mutually exclusive with reps
  perSide        Boolean @default(false)
  tempo          String?          // "3-1-1"
  restSec        Int     @default(60)
  targetRir      Int?             // reps in reserve
  cues           String[]         // 2–4 short coaching cues
  safetyNotes    String?
  youtubeVideoId String           // REQUIRED
  youtubeTitle   String
  youtubeChannel String
  videoDurationSec Int?
  videoVerifiedAt DateTime
  @@unique([routineId, position])
}

model Conversation {
  id         String   @id @default(cuid())
  routineId  String?  // null = creating from scratch; set = refining this routine
  routine    Routine? @relation(fields: [routineId], references: [id])
  draft      Json?    // current RoutineDraft (Zod-validated), the "working copy"
  draftVersion Int    @default(0)
  savedRoutineId String? // routine created from this conversation, if any
  messages   Message[]
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}

model Message {
  id             String   @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  role           String   // user | assistant | tool
  content        String
  toolCalls      Json?    // tool name, args, result summary (for transparency UI)
  sources        Json?    // web citations [{ title, url }]
  draftVersion   Int?     // draft version produced by this turn
  createdAt      DateTime @default(now())
}

model WorkoutSession {
  id              String   @id @default(cuid())
  routineId       String
  routine         Routine  @relation(fields: [routineId], references: [id])
  routineSnapshot Json     // frozen copy so history survives routine edits
  status          SessionStatus // IN_PROGRESS | COMPLETED | ABANDONED
  startedAt       DateTime
  endedAt         DateTime?
  pausedAt        DateTime?      // non-null while paused
  pausedTotalSec  Int      @default(0)
  activeDurationSec Int?         // endedAt - startedAt - pausedTotalSec
  cursor          Json           // { round, exerciseIndex, setIndex, phase: "work" | "rest" }
  perceivedExertion Int?         // RPE 1–10 at the end
  notes           String?
  sets            SetLog[]
}

model SetLog {
  id           String @id @default(cuid())
  sessionId    String
  session      WorkoutSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  exerciseId   String        // RoutineExercise.id (from the snapshot)
  exerciseName String
  round        Int
  setIndex     Int
  side         String?       // left | right | null
  targetReps   Int?
  actualReps   Int?
  loadKg       Float?
  durationSec  Int?          // time spent on the set
  skipped      Boolean @default(false)
  completedAt  DateTime
  @@unique([sessionId, exerciseId, round, setIndex, side])
}
```

`RoutineDraft` is a Zod schema that mirrors `Routine` + `RoutineExercise[]`, without ids. It is the **single source of truth** for:
- the agent's `update_routine_draft` tool parameters (via `zod-to-json-schema`, strict mode)
- draft validation
- the manual edit form

## 4. Features and acceptance criteria

### F1. Profile
- A page to edit every profile field with TanStack Form. The seed data comes from §1.1.
- **AC:** profile changes are picked up by the next agent turn without a restart.

### F2. Routine library
- A list of routines with name, goal, format, rounds, estimated minutes, exercise count, last-performed date and lineage badge ("from: X").
- Actions: open, start, refine with coach, duplicate, archive.
- Routine detail shows each exercise with its prescription, cues, safety notes and an **embedded YouTube video** (lazy-loaded, click to play).
- **AC:** archived routines are hidden by default but keep their history.

### F3. Create a routine with the coach
- Split view: **chat** (left, or bottom on mobile) and **live draft panel** (right, or a tab on mobile).
- I describe what I want, e.g. "30-min whole-body, 12 kg KB and 24 kg barbell, build muscle".
- The agent may ask 1–3 clarifying questions first if critical data is missing. It then researches and calls `update_routine_draft`.
- Responses stream token by token. Tool activity shows as compact status chips: "Searching web…", "Finding video for Goblet squat…", "Verifying video…".
- Web sources the agent used are shown as citations under the message.
- **AC:** every exercise in a draft has a verified, embeddable YouTube video, or the draft cannot be saved and the panel highlights the missing video.

### F4. Talk to a routine (refine)
- From any routine, "Refine with coach" opens a conversation with `routineId` set. The draft starts as a copy of that routine.
- Example requests: "swap sit-ups for something easier on the back", "make it chest-focused", "fit it in 20 minutes", "I hurt my wrist".
- After each agent edit, the draft panel shows a **diff** against the original: added, removed and changed exercises, and changed prescriptions.
- I can also edit the draft manually (reorder, change reps/sets/rest, delete). Manual edits bump `draftVersion`, and the agent sees the current draft on the next turn.
- Undo to any previous draft version in the conversation.
- **AC:** the original routine is never changed by a conversation.

### F5. Save as new routine
- "Save as new routine" prompts for a name (the agent suggests one) and creates a new `Routine` with `parentId` set to the source routine, if any.
- After saving, the conversation stays open and can keep producing further routines.
- **AC:** saving runs inside a DB transaction and re-validates the draft with Zod plus video verification less than 7 days old.

### F6. Workout player ("Start routine")
- Creates a `WorkoutSession` with a frozen `routineSnapshot`.
- Full-screen, mobile-first player:
  - **Header:** total elapsed active time (live), round `2 / 3`, overall progress bar, pause/resume, end.
  - **Current exercise card:** name, prescription ("12–15 reps · 12 kg", "8 each side", "30 s"), cues and the video (collapsed by default, one tap to expand).
  - **Rep counter:** large `−` / count / `+` buttons, pre-filled with the target. Timed exercises show a countdown instead.
  - **Per-side exercises** run left, then right.
  - **"Set done"** logs a `SetLog` with actual reps, load (editable) and set duration, then starts the **rest timer** (exercise `restSec`; `restBetweenRoundsSec` at the end of a round). Rest can be skipped or extended by 15 s.
  - **Up next** preview during rest.
  - **Skip exercise** logs it as skipped.
- **Timing:** timers are computed from timestamps (`startedAt`, `pausedAt`, `pausedTotalSec`), not from accumulated intervals. They stay accurate after tab sleep or reload.
- **Persistence:** every set completion and pause/resume is persisted, and the cursor is saved. Reloading the page or reopening the app resumes the in-progress session.
- An audio beep and vibration play at rest end and in the last 3 s of timed sets. The Screen Wake Lock API keeps the phone awake.
- At the end: a summary (total active time, sets completed vs planned, total reps, skipped exercises), an optional RPE (1–10) and notes, then save.
- **AC:** the active duration recorded equals wall time minus paused time, within ±1 s.

### F7. History and progress
- A history table (plain sortable table, server-paginated via TanStack Query): date, routine, active duration, sets completed, RPE. It can be filtered by routine.
- Weekly totals: sessions and minutes exercised per week, for the last 12 weeks.
- Per-exercise trend: reps and load over time.
- The agent can read recent history (tool `get_workout_history`) to suggest progressive overload, e.g. "you hit 15 goblet squats 3 sessions running — increase the challenge".

## 5. Agent design

### 5.1 Runtime
- Route Handler `POST /api/conversations/:id/messages` streams Server-Sent Events.
- It uses the OpenAI **Responses API** with `stream: true` and a server-side tool loop: call model → run tools → feed results back. The loop is capped at 12 tool iterations per turn.
- Context sent each turn: system prompt (§6.1), profile JSON, health constraints, current draft JSON (if any), the source routine (if refining), a summary of the last 5 sessions, and the conversation messages. Long conversations are trimmed oldest-first, but the system prompt, profile and draft are always kept.
- All tool arguments are Zod-validated on the server. If validation fails, the error goes back to the model so it can correct itself.

### 5.2 Tools

| Tool | Type | Purpose |
|---|---|---|
| `web_search` | OpenAI hosted | Research exercise science, technique, regressions/progressions, contraindications |
| `get_user_profile` | function | Returns the profile (also pre-injected; the tool lets the agent re-check after updates) |
| `get_workout_history` | function | `{ routineId?, limit }` → recent sessions and per-exercise performance |
| `search_youtube_videos` | function | `{ query, maxResults≤8 }` → YouTube Data API search (`type=video`, `videoEmbeddable=true`, `safeSearch=strict`, `relevanceLanguage=en`) enriched via `videos.list` (title, channel, duration, view count, embeddable) |
| `verify_youtube_video` | function | `{ videoId }` → confirms it exists, is public and embeddable, and returns metadata. Required for every exercise |
| `update_routine_draft` | function (strict schema) | Replaces the full draft with a `RoutineDraft`. The server rejects it if any `youtubeVideoId` has not been verified in this conversation |
| `propose_profile_update` | function | Suggests profile changes (e.g. new benchmark "push-up max 30"). They are applied **only after I confirm** in the UI |

**Why the video tools exist:** LLMs invent plausible-looking YouTube IDs. Video IDs can only come from `search_youtube_videos` results and must pass `verify_youtube_video`. The server enforces this by tracking verified IDs per conversation.

### 5.3 Video selection rules (enforced in the prompt, checked by the server where possible)
- It shows the **exact variation** prescribed (goblet squat ≠ back squat; reverse lunge ≠ forward lunge).
- Prefer reputable instructional sources: certified coaches, physiotherapists, established fitness education channels, university or health-organization channels.
- Duration is 30 s – 10 min (server-checked). Prefer short demos.
- Embeddable and public (server-checked).
- Avoid prank, compilation, "challenge" and clickbait content, and Shorts with no technique explanation.

## 6. Prompts

### 6.1 System prompt — Expert coach

```
You are "Coach", an expert strength & conditioning coach and exercise physiologist.
Your expertise covers resistance training for hypertrophy, strength and health; exercise programming for
older adults and people with medical conditions; kettlebell, barbell and bodyweight training; and
injury-aware exercise selection. Explain like an experienced coach: direct, practical, and honest.

## Your job
Design, rate and refine exercise routines for ONE user whose profile, health constraints, current draft,
and recent workout history are provided below. You write routines by calling `update_routine_draft`.
Never describe a full routine only in prose. If you change the routine, call the tool.

## Defaults (unless the user asks otherwise)
- Whole-body, balanced routine covering the major movement patterns: squat, hinge, lunge/single-leg,
  horizontal push, horizontal pull, vertical push or pull where equipment allows, and core (anti-extension /
  anti-rotation preferred over repeated spinal flexion).
- Fit within the user's `sessionMaxMinutes`, including warm-up and rest. Estimate duration realistically:
  sum of (sets × (reps × ~3–4 s or durationSec)) + rest + ~1 min transitions + 3–5 min warm-up.
- Use ONLY equipment listed in the profile, within its load limits.
- Prescriptions follow the goal:
  • hypertrophy: 6–15 reps (up to ~30 is valid if close to failure), 2–3 reps in reserve, 10–20 hard sets per
    muscle group per week across sessions, 60–120 s rest;
  • strength: 3–6 reps, 2–3 RIR, 2–3 min rest; • general health: 8–15 reps, moderate effort;
  • mobility/conditioning: time-based work.
- Always include a progression rule in `coachNotes` (e.g., double progression: add reps to the top of the range,
  then increase load, slow the tempo, or progress the variation if the load is capped).
- When the load is capped by the equipment (e.g., a 24 kg barbell), progress with unilateral variations, tempo,
  pauses, range of motion, or harder variations instead of more load.

## The user can override defaults
If the user asks for a specific focus (e.g., "big chest", "legs only", "no jumping", "15 minutes", "mobility"),
follow it. Rebalance volume toward that focus and keep minimal maintenance work for the rest of the body
unless told otherwise. State briefly what you traded off.

## Safety is a hard constraint
- Read `healthConstraints` carefully. Any exercise conflicting with them must be removed or substituted, and
  you must say why. If constraints mention neurological history, balance or vertigo, cancer treatment,
  cardiovascular, or joint issues: avoid breath-holding/Valsalva, avoid training to failure, prefer stable
  and controlled movements over explosive, unstable, or loaded overhead/rotational ones, and allow ≥48 h
  between hard sessions for the same muscles.
- Put specific `safetyNotes` on exercises that need them (technique faults, stop signals).
- Where relevant, remind the user once per conversation to confirm the intensity with their care team.
  Do not repeat this disclaimer in every message, and do not refuse reasonable requests.
- Stop signals to mention when relevant: dizziness, chest pain, unusual headache, visual or neurological
  symptoms, sharp joint pain.

## Research
- Use `web_search` when choosing or substituting exercises, checking contraindications, or when the user
  asks "why". Prefer evidence-based sources (peer-reviewed reviews, ACSM/NSCA position stands, physio and
  clinical sources, reputable coaching sites). Cite them briefly. Do not overstate the certainty of findings.
- Don't search for things you know well. Be efficient (typically ≤3 searches per turn).

## Videos (mandatory for every exercise)
- For each exercise, call `search_youtube_videos` with a precise query (e.g., "kettlebell goblet squat
  technique tutorial"). Pick the video that shows the EXACT variation, comes from a reputable instructional
  channel, is 30 s–10 min long, and explains technique. Then call `verify_youtube_video`.
- Never invent or guess a video ID. Only use IDs returned by the tools in this conversation.
- When editing a draft, keep the existing verified video for an unchanged exercise. Only search for new or
  changed exercises.

## Rating routines
When asked to rate a routine (or when the user pastes one), give:
overall score /10, balance score /10, a table of exercise | score | comment, the top 3 problems, and the
top 3 fixes. Then offer to produce an improved version.

## Conversation behavior
- If critical info is missing (goal, equipment/loads, time cap, relevant limitations) AND not in the
  profile, ask up to 3 concise questions before drafting. Otherwise, draft first and ask afterward.
- If the user gives new personal data (weight, max reps, new equipment, injury), call
  `propose_profile_update`.
- After each draft change, reply in ≤150 words: what changed, why, and one optional follow-up suggestion.
  The UI shows the routine itself, so don't repeat it in full.
- Use metric units unless the profile says otherwise.
```

Injected after the system prompt each turn (developer message):

```
## User profile
{profile JSON}
## Health constraints (hard constraints)
{healthConstraints or "None reported"}
## Mode
{"CREATE: no draft yet" | "REFINE: user is modifying routine '{name}' (original below); edits go to the draft, never the original"}
## Original routine
{routine JSON or "n/a"}
## Current draft (version {n})
{draft JSON or "none"}
## Recent workouts (last 5)
{compact summary: date, routine, duration, per-exercise reps/load, RPE}
```

### 6.2 Name-suggestion prompt (Save as new)
```
Suggest a concise routine name (≤40 chars) that reflects its focus, format and equipment,
e.g. "Chest-Priority Full Body · KB+BB · 35 min". Return only the name.
```

### 6.3 Example interactions the prompts must handle (used as eval cases)
1. "Rate my routine: [the original circuit from §1.1]" → ~7/10. It flags the missing knee-dominant legs, the push/pull imbalance and the excess core work. It cautions on overhead rotations and throws given the health constraints.
2. "Build muscle, 30 min, 12 kg KB + 24 kg BB" → a draft with goblet squat, push-up, bent-over row, reverse lunge, RDL, curl and dead bug, plus verified videos for each.
3. "I want a big chest" (refining #2) → push-up variations moved first, with feet-elevated and close-grip added and ~12 chest sets per week. Legs and back are reduced but kept.
4. "Make it 15 minutes" → fewer exercises or rounds, supersets, realistic time estimate.
5. "I feel dizzy with lunges" → swaps to stable alternatives (split squat with support, box squat), adds a safety note and suggests checking with the care team.

## 7. Pages and routes

| Route | Description |
|---|---|
| `/` | Dashboard: in-progress session banner (resume), quick start for recent routines, this week's minutes |
| `/routines` | Library (F2) |
| `/routines/[id]` | Detail with videos, lineage, history for this routine; buttons Start / Refine / Duplicate |
| `/coach` | New conversation (F3) |
| `/coach/[conversationId]` | Chat + draft panel (F3/F4/F5) |
| `/workout/[sessionId]` | Player (F6) |
| `/history` | History + charts (F7) |
| `/profile` | Profile (F1) |
| `/login` | Shared-password login |

API (Route Handlers, all inputs validated with Zod):
- `GET/POST /api/routines`, `GET/DELETE /api/routines/:id` (archive), `PATCH /api/routines/:id` (name/description/archived only), `POST /api/routines/:id/duplicate`
- `POST /api/conversations` (`{ routineId? }`), `GET /api/conversations/:id`, `POST /api/conversations/:id/messages` (SSE)
- `PATCH /api/conversations/:id/draft` (manual edit), `POST /api/conversations/:id/draft/revert` (`{ version }`), `POST /api/conversations/:id/save` (`{ name }`)
- `POST /api/sessions` (`{ routineId }`), `GET /api/sessions/:id`, `POST /api/sessions/:id/sets`, `POST /api/sessions/:id/pause|resume|finish|abandon`
- `GET /api/history?weeks=12`, `GET/PUT /api/profile`
- `POST /api/auth/login`, `POST /api/auth/logout`

## 8. Non-functional requirements
- **Single user.** One profile row. No multi-tenant logic.
- **Mobile-first player.** Large tap targets (≥48 px). Works in portrait. Dark mode.
- **Resilience.** OpenAI or YouTube failures show a retry option and never corrupt the draft: draft writes are atomic per tool call. If the YouTube quota is exhausted, the agent says so and the draft stays unsaveable until videos are verified.
- **Cost control.** Tool-loop cap. Verified-video cache table `(videoId → metadata, verifiedAt)` to avoid repeat API calls. The model is configurable.
- **Security.** A single shared password protects the whole app: a `/login` page checks against `APP_PASSWORD` (constant-time compare) and sets a signed, HttpOnly, SameSite=Lax cookie (`SESSION_SECRET`, 30-day expiry). Middleware redirects unauthenticated requests to `/login` and returns 401 from `/api/*`. Logout button in the nav. Login is rate-limited (5 attempts/min). API keys are server-only. No client-side OpenAI calls. YouTube embeds use `youtube-nocookie.com`. CSP allows only YouTube frames.
- **Privacy.** Health data stays in the local database and goes only to OpenAI as part of the prompt context. This is documented in the README.
- **Disclaimer.** A one-line footer: "Not medical advice; consult your care team."

## 9. Out of scope (v1)
- Multiple users or social features
- Native mobile app
- Wearable sync
- Nutrition tracking. The agent may give general guidance only.
- Voice control
- Authentication beyond the single shared password (no user accounts, OAuth or roles)
- Updating a routine in place from a conversation. Refinements are always saved as a new routine; routines can be edited manually only through the draft flow.

## 10. Delivery plan
1. Scaffold: Next.js + TS + Tailwind + shadcn, Prisma 8 + Postgres (docker compose), TanStack Query provider, Zod schemas, seed script, password login + middleware.
2. Routine library, detail and profile (F1, F2).
3. Agent runtime and tools, coach UI with streaming and draft panel, save as new (F3–F5).
4. Workout player and session persistence (F6).
5. History and charts (F7).
6. Tests: Vitest (schemas, timer math, draft diff, video-ID enforcement) and Playwright (create → save → start → finish).
7. README: setup, env vars, API key acquisition, cost notes.
