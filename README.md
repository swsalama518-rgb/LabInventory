# LabInventory

A full-stack lab supply tracker built for **shared, multi-user lab access**.
Every user belongs to a lab; everyone in that lab sees and manages the same
inventory of research supplies — reagents, chemicals, consumables, and
equipment — organized by category with low-stock indicators. Lab members can
flag items that need restocking, and a lab admin approves or rejects those
requests.

Access is scoped by **lab**, not by individual user: protected API routes
only ever return and modify records belonging to the current user's lab.

## Stack

- **Backend:** Flask, Flask-SQLAlchemy, Flask-JWT-Extended, SQLite
- **Frontend:** React, React Router, Axios
- **External API:** [PubChem PUG REST](https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest) — chemical lookup enrichment

## Data model

```
Lab --< User
Lab --< Supply >-- Category
Lab --< SupplyRequest >-- Supply
```

- `Lab` — a shared organization; everything below belongs to exactly one lab
- `User` — email + hashed password; belongs to a `Lab`; `role` is `admin` or `tech`
- `Category` — shared/global across all labs (Reagents, Consumables, Equipment, Chemicals, ...)
- `Supply` — name, quantity, unit, location, expiration date, notes,
  low-stock threshold; belongs to a `Lab` (shared by every member) and
  optionally a `Category`; tracks which user created it
- `SupplyRequest` — a restock ask: item, quantity, notes, status
  (`pending`/`approved`/`rejected`), who requested it, who reviewed it

**Roles:** chosen directly on the signup form (`admin` or `tech`) — typing a
new lab name creates that lab, typing an existing one joins it, and the role
picker applies either way. Both roles have full CRUD on the lab's supplies —
the distinction only matters for restock requests: any lab member can submit
one, but only an `admin` can approve or reject it. There's no gatekeeping on
who can pick `admin`, including for an existing lab — see
[Known issues](#known-issues--placeholders-mvp-status).

## Running locally

### Backend (port 5050)

```bash
cd server
python3 -m venv venv          # first time only
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then edit .env with your own random secrets
python app.py
```

`.env` holds `SECRET_KEY` and `JWT_SECRET_KEY` — it's git-ignored and never
committed. The app refuses to start without both set (see `server/app.py`);
generate real values however you like, e.g.:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Tables and default categories are created automatically on first run. To
re-seed default categories manually:

```bash
python seed.py
```

### Frontend (port 5173)

```bash
cd client
npm install
npm run dev
```

Open http://localhost:5173. The frontend expects the API at
`http://localhost:5050/api` (see `client/src/api.js`).

## Frontend pages

| Route          | Page              | Purpose                                              |
|----------------|-------------------|-------------------------------------------------------|
| `/login`       | Login             | Authenticate                                          |
| `/signup`      | Signup            | Create an account: lab name (create-or-join) + role picker |
| `/`            | Dashboard         | Stats: total supplies, low-stock count, pending requests, low-stock list, recently updated |
| `/inventory`   | Inventory         | Search, filter, sort, add/edit/delete supplies, request restock |
| `/categories`  | Categories        | List, add, rename, delete categories                  |
| `/requests`    | Requests          | Submit restock requests; admins approve/reject         |

A nav bar (visible once logged in) links between Dashboard, Inventory,
Categories, and Requests, and shows the lab name, an ADMIN/TECH role badge,
the logged-in user's email, and a logout button.

## API

| Method | Route                    | Auth        | Description                          |
|--------|--------------------------|-------------|----------------------------------------|
| POST   | /api/register            | No          | `{email, password, lab_name, role}` — join or create a lab with a chosen role (`admin`/`tech`), returns JWT |
| POST   | /api/login               | No          | Log in, returns JWT                   |
| GET    | /api/categories          | Yes         | List all categories                   |
| POST   | /api/categories          | Yes         | Create a category                     |
| PATCH  | /api/categories/:id      | Yes         | Rename a category                     |
| DELETE | /api/categories/:id      | Yes         | Delete a category (its supplies become uncategorized, not deleted) |
| GET    | /api/supplies            | Yes         | List the current user's **lab's** supplies (supports `search`, `category_id`, `low_stock`, `sort=name\|category\|quantity`) |
| POST   | /api/supplies            | Yes         | Create a supply in the lab            |
| GET    | /api/supplies/:id        | Yes         | Get one supply (must be in the same lab) |
| PATCH  | /api/supplies/:id        | Yes         | Update a supply (must be in the same lab) |
| DELETE | /api/supplies/:id        | Yes         | Delete a supply (must be in the same lab) |
| GET    | /api/supplies/:id/lookup | Yes         | Look up the supply's name on PubChem: molecular formula, molecular weight, IUPAC name, CAS number |
| GET    | /api/requests            | Yes         | List the lab's restock requests (optional `status` filter) |
| POST   | /api/requests            | Yes         | Submit a restock request (existing `supply_id` or free-text `item_name`) |
| PATCH  | /api/requests/:id        | Admin only  | `{status: "approved"\|"rejected"}` |
| DELETE | /api/requests/:id        | Requester or admin | Cancel a still-pending request |
| GET    | /api/dashboard           | Yes         | Totals, low-stock items, pending request count, recent updates |

Protected routes require `Authorization: Bearer <token>`. All lab-scoped
routes filter by the requesting user's `lab_id` — there is no user-level
supply ownership anymore, only lab-level.

## PubChem chemical lookup (stretch feature)

On the Inventory page, each supply row has a **"Look up"** action that queries
[PubChem's PUG REST API](https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest) by
the supply's name and shows molecular formula, molecular weight, IUPAC name,
and CAS number in a modal (with a link to the full PubChem record).

- Called server-side (`server/app.py`, `pubchem_lookup()`), not from the
  browser — PubChem doesn't send CORS headers for direct client calls, and
  routing through Flask keeps the lookup rate-limited to one request per
  click rather than the frontend hammering PubChem directly.
- Best-effort, on-demand, **not persisted** — nothing is written to the
  `Supply` row. A failed or no-match lookup (common for anything that isn't
  a real chemical name — consumables, equipment, trade names) shows an
  inline error in the modal and never blocks add/edit/delete.
- No API key required; PubChem's public endpoint is free to use.

## Restock request workflow

Any lab member can flag a supply as needing restock — from the Inventory
page's **"Request"** action (pre-fills the shortfall between current quantity
and the low-stock threshold) or from a blank form on the Requests page (for
something not tracked as a supply yet). Every lab member can see the request
queue; only the lab's **admin** can approve or reject a pending request. The
original requester (or an admin) can cancel a request while it's still
pending.

## Notes

- `SECRET_KEY` and `JWT_SECRET_KEY` are loaded from `server/.env` (see
  `server/.env.example`) via `python-dotenv` — never hardcoded, never
  committed. The app raises a clear error on startup if either is missing.
- Categories are shared across all labs; supplies and restock requests are
  scoped to a single lab.

## Known issues / placeholders (MVP status)

- **Not deployed yet.** Runs locally only (Flask on :5050, Vite on :5173);
  no Render/hosted link yet.
- **No password reset / email verification.** Register + login only.
- **JWTs never expire via refresh.** Access tokens use Flask-JWT-Extended's
  default expiry with no refresh-token flow; once expired, user must log in
  again (no silent refresh).
- **Categories are global across all labs**, not scoped per lab like
  supplies are. Any lab member can add, rename, or delete a category and it
  affects every other lab in the system, not just their own — a bigger
  concern now that labs are meant to be separate tenants. Deleting a
  category un-categorizes its supplies rather than deleting them.
- **No lab management UI.** There's no way to see who else is in your lab,
  change someone's role after signup, or remove a member — role is set once,
  at signup.
- **Role is self-selected with no gatekeeping.** The signup form's Admin/Lab
  Tech picker is honored as-is — anyone who knows (or guesses) an existing
  lab's name can join it and pick "Admin" for themselves, no approval or
  invite code required. Fine for a trusted classroom/demo context; a real
  product would need the creator to approve new members or issue invites,
  not let joiners self-declare their role.
- **The lab/role migration is a lightweight, hand-rolled one-time script**
  in `app.py` (raw `ALTER TABLE` + backfill), not a real migration tool like
  Alembic. It runs once at startup and is safe to leave in — it no-ops once
  the columns exist — but isn't how you'd want to manage schema changes
  long-term.
- **No automated test suite.** Verified manually via scripted browser flows
  (signup → CRUD → logout/login, and a two-user admin/tech approval flow)
  during development; no unit/integration tests committed.
- **No pagination.** `/api/supplies` returns the full result set; fine for
  a single lab's inventory, would need pagination at larger scale.
- **Minimal client-side validation.** Most validation (required fields,
  numeric quantity, email format) happens server-side; the frontend mostly
  just surfaces the API's error messages.
- **PubChem lookup is name-matching only.** It looks up the exact supply
  name as typed — trade names, abbreviations, or non-chemical supplies
  (glassware, equipment) won't resolve. No caching, so repeated look-ups
  for the same supply hit PubChem again each time.
