# Morgan CRM — Gmail Add-on

Adds a "Morgan CRM" panel to Gmail. When you open any email, you can:

- See if the sender is already in your CRM (and link them to a project)
- Add unknown senders with one click — fields pre-filled from the email headers
- Verify the contact's company/title via RocketReach before saving
- Link the contact to a project

## Files in this directory

- **`appsscript.json`** — Apps Script project manifest (scopes, triggers, URL whitelist)
- **`Code.gs`** — All add-on logic (auth, card rendering, Morgan API calls)

These two files are the entire add-on. They live in this repo for version control, but Apps Script projects are deployed separately via [script.google.com](https://script.google.com) — there is no automated deploy.

## Deploy walkthrough

### 1. Prerequisites on the Morgan side

Before the add-on can connect, two things must be true on Morgan's Vercel project:

1. **Migration applied.** Open Supabase → SQL Editor → paste and run `~/Documents/early-spring/supabase-addon-devices.sql`.
2. **`SUPABASE_JWT_SECRET` env var set** on Vercel:
   ```
   cd ~/Documents/early-spring
   npx vercel env add SUPABASE_JWT_SECRET production
   # paste the secret from Supabase → Project Settings → API → JWT Secret
   npx vercel --prod
   ```

### 2. Create the Apps Script project

1. Go to <https://script.google.com> and click **New project**.
2. Rename it from "Untitled project" to **Morgan CRM Add-on** (top-left).
3. Show the manifest: ⚙ **Project Settings** → enable **"Show 'appsscript.json' manifest file in editor"** → return to the editor.
4. In the file list (left rail), open `appsscript.json`. Replace its entire contents with the contents of `gmail-addon/appsscript.json` from this repo.
5. Open `Code.gs`. Replace its entire contents with the contents of `gmail-addon/Code.gs`.
6. Save (⌘S / Ctrl+S). The editor will refuse to save until both files are syntactically valid — that's fine.

### 3. Deploy as a Gmail Add-on (test deploy for personal use)

1. Click **Deploy → Test deployments** (top-right of the script editor).
2. In the dialog, click **Install** next to "Gmail Add-on".
3. Approve the OAuth scopes when prompted. The script needs:
   - `gmail.addons.execute` and `current.message.metadata` / `readonly` — to read the sender of the open message
   - `script.external_request` — to call `morgan.earlyspring.nyc`
   - `script.storage` — to persist your refresh token across sessions
   - `userinfo.email` — so the add-on knows which Google account installed it
4. Close the dialog. Reload Gmail in any open tabs.

### 4. Connect the add-on to Morgan

1. Open any email in Gmail.
2. Click the Morgan CRM icon in the right sidebar (Google's add-on rail, right edge of the Gmail window).
3. Click **Connect to Morgan**. You'll see a card with a short code (like `ABCD-1234`) and an "Open Morgan to approve" button.
4. Click that button — a new tab opens to Morgan's Settings → Integrations with an "Approve connection" prompt.
5. Click **Approve**. You'll see "Approved. You can close this tab."
6. Return to the Gmail tab and click **I approved it** in the add-on card.
7. Done. The card refreshes; from now on, opening any email shows the CRM panel.

### 5. (Optional) Share with the team

The above installs the add-on for *your* Google account only. To share:

1. **Workspace domain install** (recommended for the team): Deploy → **New deployment** → Add-on → fill in deployment name + description → Deploy. Then a Workspace admin installs it for the org via Admin Console → Apps → Google Workspace Marketplace apps.
2. **Public listing**: more work — requires verification, Marketplace listing, OAuth review. Don't do this unless you're publishing to the wider world.

## Disconnecting / revoking

- **From Gmail**: open any email, click the add-on, click "Disconnect from Morgan" on the homepage card.
- **From Morgan**: Settings → Integrations → Gmail Add-on → click **Revoke** next to the device. The add-on will lose access immediately on its next API call.

## Troubleshooting

- **"Not connected" persists after approval**: hit "I approved it" again — the polling endpoint times out after 10 minutes; if you took longer than that, restart from "Connect to Morgan".
- **"GET … → 401"**: refresh token may have been revoked. Disconnect and reconnect.
- **"GET … → 500: SUPABASE_JWT_SECRET not configured"**: env var is missing on Vercel. See step 1.2.
- **RocketReach button does nothing / says "found nothing"**: RocketReach has no profile for that email. Try a LinkedIn URL instead, or just fill the fields manually and click Add.
- **`urlFetchWhitelist` errors at install time**: confirm the manifest's `urlFetchWhitelist` matches the actual Morgan URL exactly (trailing slash matters).

## How the auth flow works (reference)

1. `Connect to Morgan` → POST `/api/addon-auth/start` → returns `device_code` + `user_code` + `verification_url`. Add-on caches the `device_code`.
2. User approves in Morgan → POST `/api/addon-auth/approve` from the settings UI (authed with the user's Supabase JWT) → row in `addon_devices` flips to `status='approved'`, refresh token minted and stored hashed; plaintext written to `refresh_token_once` for the next poll to read.
3. Add-on polls `/api/addon-auth/poll` → on approval, gets the plaintext refresh token exactly once. Stored in `UserProperties` (per-user, per-script).
4. On each API call, add-on swaps the refresh token for a 1-hour Supabase JWT via `/api/addon-auth/refresh`. JWT is cached in `CacheService` for ~55 min.
5. API calls go to `/api/addon/*` with `Authorization: Bearer <jwt>`. PostgREST + RLS enforce per-user scoping.

Revocation in Morgan settings sets `revoked_at` + `status='revoked'`; the refresh endpoint refuses to mint new JWTs, and the cached JWT expires within an hour.
