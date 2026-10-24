# Apps Script setup (about 10 minutes)

Do all of this on a **copy** of this [sheet](https://docs.google.com/spreadsheets/d/1JPQ0bcd06cIMozgjezE16QZMaWY2u-mnto9iTl9ioNo/edit?usp=sharing) Inspired by **Ankur Warikoo** [video](https://youtu.be/zHTjc-lszXI?si=NbK_mEvjBDBX28Vj).

## 1. Make a copy of the spreadsheet

Open your sheet → **File → Make a copy** → name it something like `Finance Tracker [Your Name]`. While you are there: **File → Settings → Time zone** should be `(GMT+05:30) India Standard Time`. The script reads and writes dates in the sheet's time zone.

## 2. Add the script next to yours

Your sheet already has its own script (`onOpen`, `onEdit`, `buildYearlyCalendar`, ...). **Leave it exactly as it is.** The API goes in a second file of the same project:

1. In the **test copy**: **Extensions → Apps Script**. You'll see your existing files `Code.gs` and `ExpenseApi.gs`. Don't change it.

Both files share one namespace. None of the names clash with yours; the API's globals start with `EXPENSE_API`.

**How it works with your script:**

- Your `onEdit` only fires for edits made by hand, never for writes from the app. So after every app add, edit or delete, the API calls your `buildYearlyCalendar()` itself, the same thing `onEdit` does for the Daily tab. If that ever fails, the entry is still saved; the error goes to the execution log.
- Your scripts read the Daily tab as columns A to G, so the optional App ID column in H (step 4) doesn't affect them.
- `onOpen` and your Monthly/Weekly Analysis triggers keep working as before.

## 3. Create the shared secret

1. In the function dropdown next to **Run**, pick `generateToken`, then press **Run**.
2. The first run asks for permission: **Review permissions** → pick your account → "Google hasn't verified this app" → **Advanced** → **Go to Expense Tracker API (unsafe)** → **Allow**. This warning appears because it's your own unpublished script. Because of `@OnlyCurrentDoc`, it only gets access to _this one spreadsheet_.
3. The **Execution log** at the bottom shows `TOKEN set. ... <40 characters>`. Copy that token somewhere safe (a password manager), then press **Clear** on the log.

Prefer to choose the token yourself? Use **Project Settings (gear icon) → Script Properties → Add script property**, with name `TOKEN` and your own long random value.

## 4. Check the sheet layout (read-only)

> **If you want test data in the copy, run your `populateTestData` now, before this step.** It clears columns A to G only. If it runs after the App ID column exists, old IDs in column H end up next to different rows. If you ever need to re-run it later, clear column H at the same time. Never run `populateTestData` on the real sheet; it wipes your entries.

Pick `diagnose` in the dropdown → **Run**. The log shows:

- the header row it found and the column of each field
- whether the **Type** column is formulas (the app then never writes it) or typed values (the app then writes Need, Want or Saving from your Setup tab)
- which row the next entry will go into
- any formulas elsewhere that use whole rows or columns beyond the table, which matters before adding an ID column
- a **Verdict** line

If the verdict says **safe to run setupAppIdColumn()**, pick `setupAppIdColumn` → **Run**. It adds one hidden column called **App ID** right after Notes. It makes edits exact and retries duplicate-proof. Your existing rows are untouched. If the verdict says to review, paste the log into our chat first. The app also works without that column, by matching date, description and amount.

## 5. Deploy as a web app

1. **Deploy → New deployment**.
2. Click the gear next to "Select type" → **Web app**.
3. Description: `v1`. **Execute as: Me**. **Who has access: Anyone**. It has to be "Anyone" (not "Anyone with a Google account") because the app calls it without Google cookies. The token is what keeps strangers out.
4. **Deploy** → copy the **Web app URL** (it ends in `/exec`).

## 6. Smoke test (Optional)

From the project folder:

```bash
node scripts/smoke-sheet.mjs "https://script.google.com/macros/s/.../exec" "<your token>"
```

It adds one row labelled `ZZ SMOKE TEST`, retries the add, edits it, deletes it, and checks every step. You want all `PASS`. Then open the test copy and confirm the Weekly, Monthly and Yearly tabs show no `#REF!` or `#N/A`.

## 7. Connect the app

App → **Settings → Google Sheet connection** → paste the URL and token → **Save connection**. The "Demo data" banner goes away and your real entries load.

## Recurring Payments tab (Bills screen)

The app's **Bills** screen keeps your monthly payments in a tab called **Recurring Payments**, which the script creates the first time you add a bill:

`Name | Amount | Category | Payment Mode | Due Day | Active | ID`

- You can add or edit rows right in the sheet too. Leave **ID** empty for new rows; the script fills it in the next time the app syncs. Category and Payment Mode must match your Setup tab exactly.
- **Active** set to FALSE pauses a bill (it stays listed but isn't counted as due).
- Logged payments go into Daily Expense Tracker with the App ID `bill-<ID>-<YYYY-MM>` and the note "Recurring payment". That ID is how the app knows a bill is paid that month, so it needs the App ID column (`setupAppIdColumn`).
- Deleting a bill never deletes payments already logged.

## Changing the script later

**Deploy → Manage deployments → pencil icon → Version: New version → Deploy.** The URL stays the same. (**New deployment** would give you a _new_ URL, and you'd have to paste it into the app again.)

## Error codes the app may show

| Code                                   | Meaning                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `UNAUTHORIZED`                         | Token in the app doesn't match Script Properties `TOKEN`                                 |
| `TOKEN_NOT_SET`                        | Step 3 not done in this copy                                                             |
| `HEADER_NOT_FOUND` / `SHEET_NOT_FOUND` | Tab renamed or the Date/Description header row is missing                                |
| `BAD_CATEGORY` / `BAD_PAYMENT_MODE`    | Value not in the Setup lists (refresh Setup lists in the app)                            |
| `STALE`                                | The row was edited in the sheet since the app last synced; pull to refresh and try again |
| `LOCK_TIMEOUT`                         | Two writes at the same moment; the app retries                                           |
