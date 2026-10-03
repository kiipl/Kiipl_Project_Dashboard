# KIIPL Projects

A live dashboard for tracking construction site progress. Admins import site data from CSV / Excel files, upload site photos to Supabase Storage, and manage columns and screens. Viewers and admins can filter, search, and visualise the data as a data table or dynamic charts.

Built with **Next.js 15**, **React 19**, **Supabase**, and **Recharts**.

## Features

- **Role-based access** — Admin can edit and import; Viewer has read-only access.
- **Multi-screen sheets** — data is grouped into named screens (e.g. "Phase 1", "Phase 2").
- **CSV / XLSX import** — bulk-upload spreadsheets. Existing columns are matched by key **or** label, brand-new columns are auto-created with type detection (`number`, `date`, `url`, `text`), and column order follows your sheet's header order.
- **Photo handling** — external image URLs in `url` columns are fetched, validated, and uploaded into the `site-images` Storage bucket automatically (before the row is inserted), so viewership never depends on the external host. Local image files can also be uploaded. Photos preview on hover and open in a lightbox on click.
- **Full table CRUD** — add rows, edit rows, delete rows, bulk-select and bulk-delete; add, reorder, and delete columns.
- **Dynamic charts** — the X and Y axes are auto-detected (text column for X, numeric for Y); every column's data type is shown in the dropdowns. Bar and line charts render with tooltips.
- **Search & view toggle** — instant search across the current screen, switch between table and chart views.

## Tech stack

- Next.js 15 (App Router) + React 19 + TypeScript
- Supabase (auth, Postgres, Storage)
- Recharts (charts), `xlsx` (spreadsheet parsing)
- Vanilla CSS design system (`DM Mono` + `Manrope`)

## Database setup (Supabase)

Run the SQL files in the **SQL Editor** of your Supabase project, in this order:

| File | When to run |
| --- | --- |
| `supabase.sql` | Always. Required base schema, RLS policies, storage bucket, and seed data. |
| `supabase-screens.sql` | Only if you already had a database from the prototype that lacks the `dashboard_screens` table. |
| `supabase-auth-repair.sql` | Only if login breaks because the User mapping role is missing. |
| `supabase-leads.sql` | To enable the Lead engine (`/leads`). Adds `leads`, `lead_events`, `lead_appointments`, `lead_calls` with admin-only RLS. |

These create:

- `profiles` — one row per auth user, with an `is_admin` flag.
- `site_columns` — the column definitions (key, label, data type, position) shared across screens.
- `sites` — the data rows; each row's `values` is a JSONB map of `column_key -> value` and belongs to one `dashboard_screens` row.
- `dashboard_screens` — the named sheets.
- Policies: `public_read`, `admin_all`, and bucket policies so only admins can write files/rows.
- The seeded demo users and seed columns (`S.No`, `Project Name`, `State`, `District`, `Area / Site Name`, `Current Status`, `Physical Progress (%)`, `Remarks`, `Site Photo (Link)`, `Last Updated`).

## Local development

1. Clone the repo and install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` with your Supabase anon keys (never share these values publicly):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
   ```

3. Run the SQL files from the Database setup above.

4. Start the app:

   ```bash
   npm run dev
   ```

## Demo accounts

| Role | Login | Password |
| --- | --- | --- |
| Admin | `Admin@kiipl.com` | `adminkiipl` |
| User | `User` | `kiipl` |

The "User" login is mapped internally to `user@kiipl.local` because Supabase Email Auth requires an email address. **Change the passwords after setup.**

## Using the dashboard

### Viewer
- Pick a screen from the dropdown to view that sheet.
- Use the search box to filter rows across every column (numbers and text).
- Toggle between **Table** and **Chart** views. In chart view, choose which columns to plot on X and Y.
- Hover a thumbnail in the table to preview the photo; click to open it full-size.

### Admin
Everything a Viewer can do, plus:
- **Upload** (`⇪` icon) — select a CSV/Excel file, then choose "New screen" or an existing screen.
- **Add column** — define a new column with a label and data type.
- **Add / edit rows** — modal editor; `url` fields include a local image upload button.
- **Delete rows** — use the checkboxes for bulk removal, or the per-row trash icon.
- **Remove empty rows** — one click to drop blank records from the current screen.
- **Manage screen** (`⋮` icon next to the screen dropdown) — rename or delete a screen.
- **Delete column** — the `×` on a column header removes it from all screens.

### Column matching on import
When importing, each spreadsheet header is matched to an existing column by its **key** first and then by **case/space-insensitive label**. So a CSV with headers like `S.No`, `Area / Site Name`, and `Site Photo (Link)` merges into the seeded `serial_no`, `site_name`, and `site_photo` columns — no duplicates. Headers that match nothing create new columns automatically, and all columns are re-ordered to follow the spreadsheet.

## Lead engine (`/leads`)

An admin-only pipeline that takes leads from social media to a qualified row in Google Sheets:

```
 Social media ─┬─ Facebook / Instagram Lead Ads (webhook, real time)
               ├─ LinkedIn forms, website forms, Zapier / Make / n8n / PhantomBuster (ingest webhook)
               ├─ Apify scrapers: Instagram, LinkedIn, X, Facebook groups, Google Maps (dataset import)
               └─ Pasted posts / comments / DMs → Claude extracts leads
                         │  dedupe by email / phone / source id
                         ▼
               Personalised email sequence in the lead's language (Claude + SMTP)
                         │  signed "Book a time" link + one-click unsubscribe
                         ▼
               Booking page → free slots from Google Calendar → event + Meet link
                         │
                         ▼
               Multilingual AI calling agent (Twilio voice + Claude): qualifies and can book live
                         │
                         ▼
               BANT qualification by Claude → score ≥ QUALIFY_MIN_SCORE → Google Sheets
```

### Setup

1. Run `supabase-leads.sql` in the Supabase SQL Editor (after `supabase.sql`).
2. Copy `.env.example` to `.env.local` (and the Vercel project settings) and fill in the sections you need. Every integration is optional: the Leads page shows which are configured, and the automation skips the ones that aren't.
3. Sign in as an admin and click **Lead engine** in the header.

| Integration | What to set up |
| --- | --- |
| **Claude** | `ANTHROPIC_API_KEY`. Used for AI extraction, multilingual emails, the calling agent and qualification. Defaults to `claude-opus-5-5`; requests enable server-side refusal fallbacks (`fallbacks: "default"`). |
| **Email** | Any SMTP account (`SMTP_*`, `EMAIL_FROM`) plus `PUBLIC_BASE_URL` and `LEADS_SIGNING_SECRET` for the booking and unsubscribe links. Set up SPF/DKIM for your sending domain. |
| **Google Calendar + Sheets** | Create a Google Cloud service account, enable the Calendar and Sheets APIs, and put its email and private key in `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY`. Share the calendar ("Make changes to events") and the spreadsheet (Editor) with the service-account email. Calendar invites and Meet links need Google Workspace domain-wide delegation plus `GOOGLE_IMPERSONATE_USER`. Without it, events are still created on the calendar. The `Qualified Leads` tab and header row are created automatically. |
| **Calling agent** | Twilio account with a voice-capable number (`TWILIO_*`). `PUBLIC_BASE_URL` must be reachable by Twilio; for local testing use a tunnel such as ngrok. Webhooks are signature-verified. |
| **Meta Lead Ads** | In your Meta app, add the **Webhooks** product, subscribe the Page to `leadgen` with callback `https://<PUBLIC_BASE_URL>/api/leads/webhooks/meta` and verify token `META_VERIFY_TOKEN`. Set `META_APP_SECRET` and a long-lived Page token with `leads_retrieval` in `META_PAGE_ACCESS_TOKEN`. Covers both Facebook and Instagram lead forms. |
| **Ingest webhook** | `POST /api/leads/ingest` with header `x-leads-secret: $LEADS_INGEST_SECRET` and JSON (one lead, an array, or `{ "source": "linkedin", "leads": [...] }`). Field names like `name`/`fullName`, `email`, `phone`, `company`, `title`, `profileUrl` are mapped automatically. Use this for LinkedIn Lead Gen Forms through Zapier or Make, website forms, n8n and PhantomBuster. |
| **Apify** | `APIFY_TOKEN`. Run any actor, then paste its dataset ID under **Import scraper data**. |
| **Automation** | `vercel.json` schedules `/api/cron/leads` daily at 09:00 IST (Vercel Hobby allows only daily crons; on Pro you can change it to hourly). Set `CRON_SECRET`. **Run automation** on the Leads page runs the same loop on demand. |

### What the automation loop does

1. **Email**: sends the next email in the sequence to `new`/`contacted` leads with an email address (`OUTREACH_MAX_EMAILS`, spaced `OUTREACH_FOLLOW_UP_DAYS` apart). Claude writes each email in the lead's language. If Claude isn't configured, an English template is used.
2. **Call** (when `AUTO_CALL_AFTER_EMAIL=true`): calls leads that have a phone number and haven't booked `AUTO_CALL_AFTER_DAYS` after the email, or that have no email address. Each lead gets at most `MAX_CALL_ATTEMPTS` calls.
3. **Qualify**: scores booked leads. Called leads are scored automatically when the call ends.
4. **Sync**: appends every newly qualified lead to the Google Sheet (each lead is synced once).

You can also trigger each step per lead from the table (email ✉, call ☎, qualify ★) or from the lead drawer (book a slot, mark do-not-contact, view transcripts and the timeline).

### The calling agent

- Twilio dials the lead. Each turn, Twilio's speech recognition transcribes the lead in their language and posts it to `/api/voice/turn`. Claude replies with the next line, and Twilio speaks it with a voice in that language.
- Supported languages: English (IN/US), Hindi, Marathi, Gujarati, Tamil, Telugu, Kannada, Malayalam, Bengali, Punjabi, Arabic, Spanish, French and German (see `utils/leads/languages.ts`). The call starts in the lead's language (set per lead in the table). The agent switches language if the lead does.
- The agent introduces itself as an AI assistant, says the call may be recorded, works through BANT questions, and can book one of the next free calendar slots during the call. It honours "don't call me" by marking the lead do-not-contact. Voicemail is detected and hung up on.
- When the call ends, the transcript is scored, and a qualified lead is pushed to Google Sheets right away.

### Compliance

You are responsible for having a lawful basis to contact each lead.

- Prefer the official sources: Lead Ads and opt-in forms.
- Scraping is governed by each platform's terms. Only import public business contact data you're allowed to use.
- Respect DND/TCPA/TRAI calling rules and local calling hours.
- Every email includes a one-click unsubscribe link. Opted-out leads are never emailed or called again.
- The agent discloses that it is an AI and that the call may be recorded. Check the recording-consent rules for your region.

## Project structure

```
app/
  page.tsx                 # landing page -> <ProductDashboard />
  styles.css               # design system + components CSS
  layout.tsx
middleware.ts              # session refresh for Supabase auth
components/
  dashboard.tsx            # the entire dashboard (auth, screens, table, charts, upload)
  product-chart.tsx        # dynamic chart renderer
utils/supabase/client.ts   # browser Supabase client
data/sample-sites.csv      # sample data for testing the import flow
supabase.sql               # base schema + policies + seed (run first)
supabase-screens.sql       # add-on for pre-existing databases
supabase-auth-repair.sql   # auth repair (only if login breaks)
supabase-leads.sql         # lead engine tables + RLS
app/leads/page.tsx         # Lead engine UI  -> components/leads-dashboard.tsx
app/book/[token]/page.tsx  # public booking page -> components/booking-page.tsx
app/api/leads/*            # capture (ingest, Meta webhook, extract, import), per-lead actions, sync, unsubscribe
app/api/voice/*            # Twilio calling agent (turn + status callbacks)
app/api/cron/leads         # scheduled automation loop (vercel.json)
utils/leads/*              # pipeline, Claude, email, Google Calendar/Sheets, Twilio, booking, sources
```

## Image pipeline

1. While rows are imported, each `url` cell pointing at an external image is fetched server-side by the browser at upload time.
2. The response `Content-Type` must be an `image/*`; otherwise the URL is kept as-is.
3. The image is uploaded to the `site-images` Storage bucket and the public bucket URL replaces the external link in the row's `values`. URLs already pointing at the bucket are reused as-is.
4. Photos then preview on hover and open in a lightbox, including in the table view — they never navigate the browser away.

## Deployment (Vercel)

- Add the two `NEXT_PUBLIC_*` environment variables in the Vercel project settings.
- For admin-managed password resets, add a server-only `SUPABASE_SERVICE_ROLE_KEY` in Vercel (and `.env.local`). Never prefix it with `NEXT_PUBLIC_` — it must stay secret.
- Build with `npm run build`. If you ever see transient "Cannot find module for page" errors, clear the local `.next` cache (`Remove-Item -Recurse -Force .next` on Windows) and rebuild.

## Troubleshooting

- **Login fails** after a fresh SQL run → run `supabase.sql` again (it is idempotent), then `supabase-auth-repair.sql` if needed.
- **Upload creates duplicate columns** → this was fixed; headers are now matched by label. Remove any leftover duplicate columns with the `×` button on the column header.
- **Photos don't show** → check the `Site Photo (Link)` column has data type `url`, and that the `site-images` bucket exists.