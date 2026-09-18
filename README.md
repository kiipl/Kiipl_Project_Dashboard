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