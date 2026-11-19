# MedCert Online — Setup (about 20 minutes, one time)

You will make **two free accounts** (use the new ones for this project, separate from your other projects):

- **Supabase** — keeps the data (certificates, patients, doctors) and handles the staff login.
- **GitHub** — hosts the website (GitHub Pages).

Nothing in these files is tied to any account until you paste your own details in step A5.

---

## A. Supabase (database + login)

1. Go to **supabase.com**, sign up with the new account, then **New project**.
   - Name: `medcert`. Region: **Southeast Asia (Singapore)** (closest to you).
   - Set a database password and save it somewhere safe.
   - Wait about 2 minutes until the project is ready.
2. Open **SQL Editor → New query**.
   - Open `schema.sql` in Notepad and **change `your-email@example.com`** in the last lines to the **Admin's e-mail** (just one). Paste the whole file into the editor and click **Run**. It should say *Success*.
3. Open **Authentication → Users → Add user → Create new user**.
   - Use the **same e-mail** as the Admin in step 2, choose a password, and tick **Auto Confirm User**. Only the Admin is created here; everyone else is added later inside MedCert (Users tab).
4. Open **Authentication → Sign In / Providers** (or *Settings*) → **Email**, and turn **OFF "Allow new users to sign up"**. This stops strangers from creating accounts.
5. Open **Project Settings → API** (or **API Keys**). Copy:
   - **Project URL** (looks like `https://abcdxyz.supabase.co`)
   - the **anon / public** key (the long text; do **not** use the `service_role` key)

   Open `config.js` in Notepad and paste them in place of `YOUR-PROJECT-ID...` and `YOUR-ANON-PUBLIC-KEY`. Save.

6. **Turn on the Users tab** (lets the Admin add staff inside MedCert): open **Edge Functions → Deploy a new function → Via Editor**, name it exactly `manage-users`, delete the sample code, paste everything from `edge-function/manage-users.ts`, and click **Deploy**. Nothing else to configure.

> The anon key is meant to be visible in a website. Your data is protected by the rules in `schema.sql`
> (staff-only access), not by hiding that key.

## B. GitHub (hosting)

1. Go to **github.com**, sign up with the new account, then **New repository**.
   - Name: `medcert`. Choose **Public** (free GitHub Pages needs this; your patient data is *not* in the repository — it lives in Supabase).
2. Click **uploading an existing file** and drag in **everything from this folder** (all files **and** the `vendor` folder, including your edited `config.js`). Click **Commit changes**.
3. Open **Settings → Pages**. Under *Build and deployment*, set **Source: Deploy from a branch**, **Branch: main**, folder **/ (root)**, then **Save**.
4. After 1–2 minutes the page shows your address: `https://YOUR-USERNAME.github.io/medcert/`. Open it and log in.

## C. First use

1. **Settings**: choose Logo 1 / Logo 2, check the header and footer text, keep **QR code** ticked, then **Save Settings**.
2. **Settings → Physicians**: add each doctor (name exactly as it should print, title, License No.).
3. **New Certificate**: fill in, press **Save & Print**. The browser's print window opens:
   - pick your printer, **or** choose **Save as PDF** to get a PDF file;
   - paper **Letter**, scale **100%**, margins **None**.
4. Scan the QR with your phone — it should open a green **GENUINE** page. That is what employers will see.

## How employers verify

- **They scan the QR** on the printed certificate → live page: **GENUINE** / **CANCELLED** / **NOT FOUND**, with the patient name, dates and doctor. The page never shows age, address, diagnosis or remarks.
- **They call the center** → staff open **Verify**, type the patient's name, and read back the real record.
- **Issued by mistake?** Use **Cancel** in History. The QR page then says CANCELLED and any reprint is stamped CANCELLED. (**Reinstate** undoes it.) Certificates are cancelled, not deleted, so there is always a record.

The Certificate No. (e.g. `IGACOS-BABAK-2026-000001`) is **not printed** on the paper. It is shown in History, in Verify, and on the QR page. The database assigns it, so numbers cannot be skipped, reused or backdated.

## Good to know

- **Free Supabase projects pause after about 1 week with no use.** If that happens, open the Supabase dashboard and click **Restore**. Regular daily use prevents it.
- **Backups:** in Supabase, **Table Editor → certificates → Export** to CSV now and then.
- **Printing differs from the desktop app:** websites can't pick a save folder or print silently. You choose the printer / "Save as PDF" in the print window each time.
- **Not included online:** the "use my own uploaded template image" mode. The built-in design is used.
- **Records from the desktop app** are not copied over automatically. Ask if you want them imported.
- Everyone logs in with their own account. The Admin adds, removes and resets staff in the **Users** tab (only the Admin sees it). Staff can change their own password with **Change password** at the bottom left.
- Only the Admin e-mail is typed into `schema.sql`; the Admin cannot be removed from the Users tab.
