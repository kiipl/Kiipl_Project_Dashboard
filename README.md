# KIIPL construction site dashboard

1. Run `supabase.sql` in the Supabase SQL Editor.
2. Keep `.env.local` locally and add the same two `NEXT_PUBLIC_*` values in Vercel.
3. Run `npm install`, then `npm run dev`.

The initial sign-ins are `User` / `kiipl` and `Admin@kiipl.com` / `adminkiipl`. Change them after setup. The User login is mapped internally to `user@kiipl.local`, since Supabase Email Auth requires an email address.

Admins can add columns, edit tables, add rows, and import CSV files with the default header labels. Photo links open in an in-sheet modal and never navigate the browser. For admin-managed password resets, add a server-only `SUPABASE_SERVICE_ROLE_KEY` in Vercel and `.env.local`; never prefix it with `NEXT_PUBLIC_`.
