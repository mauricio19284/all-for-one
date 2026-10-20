# All For One

A personal command center: a home page with calendar and to-dos, plus a page per section
(Today, Week, School, Learning, Finance, Gym, Projects, Habits, Stats, Review, Notes). The old Money tab lives on as Finance › Grow.

## How it is put together

- `index.html` is the whole site, plus `plans.js` (the Stats tab's yearly plans). Both are static and can be served from any static host.
- Data lives in a Supabase project, in one table: `public.docs (collection, id, data jsonb, updated_at)`.
  Each record is addressed as `collection/id`:
  `tasks/<id>`, `notes/<id>`, `gymlog/<YYYY-MM-DD>`, `daily/<YYYY-MM-DD>`, `weekly/<monday YYYY-MM-DD>`,
  `habits/log`, `meta/config`, `meta/roadmap`, `meta/investing`, `insights/<YYYY-MM-DD>`,
  `finacct/<id>`, `finsub/<id>`, `fintx/<YYYY-MM>`, `fingoal/<id>`, `finproj/<id>`, `meta/finance`, `meta/finlog`,
  `meta/stats`, `statday/<YYYY-MM-DD>`.
- Sign-in is Supabase email + password. Row-level security lets only the address listed in
  `public.app_owner` read or write (`supabase/schema.sql`).
- The capture box's auto-filing and the Review page's "read my notes" call the `ai` edge function
  (`supabase/functions/ai`), which holds the `ANTHROPIC_API_KEY` secret. The key is never in the page.

## Setup

1. Run `supabase/schema.sql` in the project's SQL editor.
2. Create the owner's login under Authentication, then add that email to `public.app_owner`.
3. Deploy `supabase/functions/ai` and set the `ANTHROPIC_API_KEY` secret.
4. `index.html` carries the project's URL and anon (publishable) key in `CFG`. Both are safe to publish;
   the data is protected by the sign-in.

## Record shapes

- task: `{folder: school|learning|money|gym|projects, kind, title, detail, due: "YYYY-MM-DD"|"", status: open|done, createdAt, doneAt?}`
- note: `{folder, title, body, mark, createdAt}`
- daily: `{date, must: {result, firstAction, block, obstacle, done}, secondary: [{label, done}], shutdown: [{label, done}],
  reflection: {resume, worked?, interfered?}, tomorrow: {result, firstAction}, suggestion?: {...}, savedAt}`
- gymlog: `{date, split, note, loggedAt}`
- habits/log: `{"YYYY-MM-DD": {morning, shutdown, lights}}`
- meta/config: `{week, schoolwork, gymTime, split, shutdown, review, flags}`
- finacct: `{name, type: bank|credit|savings|invest|cash, cur: MXN|USD|EUR, bal, asOf, hist: [{d, b}], createdAt}`
  (for a credit card, `bal` is what is owed)
- finsub: `{name, amt, cur, every: month|year|week, day, mon, since: "YYYY-MM-DD", status: active|trial|paused, cat, match, createdAt}`
  (`since` is the first charge date; `match` is comma-separated words that identify the charge on a statement)
- fintx (one record per month): `{items: {<id>: {d, m, a, t: out|in, c, cat, acct, src: manual|upload|gmail, b?}}}`
  (`a` is always positive; `cat: "transfer"` is left out of the totals)
- fingoal: `{name, target, cur, saved, acct, by, createdAt}`
- finproj: `{name, kind, status, monthly, cur, next, earned, createdAt}` (ways to make more; logged earnings also become fintx rows)
- meta/finance: `{display, fx: {USD, EUR}, fxAt, income: [...], limits: {<cat>: pesos}, sug: {at, items}}`
- meta/finlog: `{items: [{at, sec, text}]}` — the change log shown under each Finance section

## Finance tab

Nothing connects to a bank. Balances are typed. Transactions are typed, or read in the browser from a CSV or
Excel statement and saved only after the preview is approved. Each subscription adds one automatic row per
charge date unless a real transaction matching its `match` words exists within a few days. No personal
financial data belongs in this repository; it lives only in the `docs` table.
- meta/stats: `{base: {<stat>: {v, note}}, measuredAt, planStart: "YYYY-MM-DD", quests: [{id, label, stat, xp}]}` — the Stats tab's baseline (50 = world average), program day 1 of the yearly plans, and his own permanent quests
- statday (one per day): `{meters: {health, energy, rest, hunger, hydration, hygiene, mood, stress, motivation, socialbat}, done: {<questId>: true | xp}, log: [{at, text, stat, xp}], water, sleep}`
  A stat shows as baseline + earned XP / 60, minus a quarter point per idle day after two.

## Stats tab quests

Every stat owns a yearly plan in `plans.js` and sends exactly one quest a day. Gym (Strength) and the must-finish (Discipline) tick themselves.
The plan functions take the day's context — program day, program week (every 4th is easier), planning month (blocks of 31/28/31… days),
day and week inside that month, weekday — and return `{id: "pl_<stat>", label, detail, xp}`. Plan quest ids are stable, so the day record
stores the XP earned under the id. Sources: Endurance, Speed & Agility, Looks, Knowledge & Leadership and Cognitive skills from his
plan documents; Growth & Health (Height & Build), Critical thinking (Judgment), Focus, Creativity, Mindfulness (Emotional Control),
Social skills, Influence & Leadership, Money & Income (Financial) and Discipline from his Google Docs; Practical Skills written for him.
The start date is in `meta/stats.planStart` (⋯ next to the day counter), default 2026-10-20.
