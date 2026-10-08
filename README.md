# All For One

A personal command center: a home page with calendar and to-dos, plus a page per section
(Today, Week, School, Learning, Money, Gym, Projects, Habits, Review, Notes).

## How it is put together

- `index.html` is the whole site. It is static and can be served from any static host.
- Data lives in a Supabase project, in one table: `public.docs (collection, id, data jsonb, updated_at)`.
  Each record is addressed as `collection/id`:
  `tasks/<id>`, `notes/<id>`, `gymlog/<YYYY-MM-DD>`, `daily/<YYYY-MM-DD>`, `weekly/<monday YYYY-MM-DD>`,
  `habits/log`, `meta/config`, `meta/roadmap`, `meta/investing`, `insights/<YYYY-MM-DD>`.
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
