# Accounts and cloud sync (Supabase)

Luka is local-first: without Supabase it runs entirely in the browser. With Supabase configured, people can sign in, keep their household on every device, and invite the people they live with to share one plan and shopping list.

## What's in the database

`supabase/migrations/20261126000000_households.sql` creates:

| Table | Holds | Who can see it |
| --- | --- | --- |
| `profiles` | one row per user, `is_admin` flag | the user only; nobody can make themselves admin |
| `households` | name, owner | members |
| `household_members` | who belongs to which household, owner/member role | members |
| `household_state` | the household's whole plan, recipes and settings (JSON), versioned | members |
| `household_invites` | 7-day invite codes | members |

Every table has row-level security switched on, and anyone signed out is denied. Creating households, making invites and joining go through `SECURITY DEFINER` functions that check membership. Saves use optimistic concurrency: a write must name the version it read, so two phones can't silently overwrite each other. `supabase/tests/policies.test.sql` checks these rules against a real Postgres.

## One-time setup

1. **Create the project.** Either add Supabase to the Vercel project (Vercel → Storage / Marketplace → Supabase, or `vercel integration add supabase`), which also adds the environment variables, or create a free project at supabase.com and add the variables yourself.
2. **Run the migration.** In Supabase → SQL Editor, paste the contents of `supabase/migrations/20261126000000_households.sql` and run it once. With the Supabase CLI you can run `supabase link` then `supabase db push` instead.
3. **Environment variables** (Vercel → Project → Settings → Environment Variables):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)

   Both are public by design; row-level security protects the data. Never put the service-role key in a `NEXT_PUBLIC_` variable.
4. **Auth URLs** (Supabase → Authentication → URL Configuration):
   - Site URL: `https://luka-delta.vercel.app`
   - Redirect URLs: `https://luka-delta.vercel.app/**` and `http://localhost:3000/**`
5. **Email.** Supabase's built-in email sender only sends to your own team's addresses and is heavily rate-limited. Before inviting real users, either:
   - add a free SMTP provider (e.g. Resend or Brevo) under Authentication → Emails → SMTP Settings, or
   - for a closed beta, turn off "Confirm email" under Authentication → Sign In / Providers → Email, so email + password works without sending mail. Magic links still need SMTP.
6. **Google sign-in (optional).** Create an OAuth client in Google Cloud Console, add its ID and secret under Authentication → Sign In / Providers → Google, then set `NEXT_PUBLIC_AUTH_GOOGLE=true` in Vercel and redeploy. Apple sign-in is needed later for the iOS app if Google is offered there.
7. Redeploy on Vercel so the new variables are built in.

## Making yourself an admin

After you've signed in once, run this in the SQL Editor:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'you@example.com');
```

The `/admin` area (next milestone) checks this flag.
