# CLAUDE.md

This file gives Claude Code full context on the project architecture, conventions, commands, and rules. Read this before touching any file.

---

## Project Overview

Qelvi is a personal calorie tracking web app. Users register with body metrics, log meals from a 416-item Indian + international food dataset, and view calorie trends over time.

**Monorepo structure:**

```
calorie-tracker/
├── backend/      # Python + FastAPI + MongoDB
├── frontend/     # React 18 + TypeScript + Vite + Tailwind CSS
└── CLAUDE.md
```

---

## Dev Commands

### Backend

```bash
cd backend
source venv/bin/activate          # activate virtualenv
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm run dev                        # Vite dev server → http://localhost:5173
npm run build                      # Production build (runs tsc -b first)
npx tsc --noEmit                   # Type-check only, no emit
npm run lint                       # ESLint
```

### Run both simultaneously

```bash
# Terminal 1
cd backend && uvicorn main:app --reload --port 8000

# Terminal 2
cd frontend && npm run dev
```

---

## Architecture

### Backend (`backend/`)

| File                    | Purpose                                                                      |
| ----------------------- | ---------------------------------------------------------------------------- |
| `main.py`               | FastAPI app, CORS middleware, startup hooks                                  |
| `app/database.py`       | Motor async MongoDB client, `get_db()` helper                                |
| `app/models/schemas.py` | All Pydantic v2 models (User, Food, MealLog, etc.)                           |
| `app/services/auth.py`  | JWT creation/decode, bcrypt, BMR/TDEE calc                                   |
| `app/services/food.py`  | Async MongoDB queries against the `foods` collection                         |
| `app/routers/auth.py`   | `/auth/register`, `/auth/login`, `/auth/me`, `PUT /auth/me`                  |
| `app/routers/food.py`   | `/foods/`, `/foods/categories`, `/foods/cuisines`, `/foods/{id}`             |
| `app/routers/logs.py`   | `/logs/`, `/logs/date/{date}`, `/logs/summary/{date}`, `/logs/history/range` |

**Key patterns:**

- All DB calls use `await` with Motor (async MongoDB driver)
- `get_current_user` dependency in `routers/auth.py` is the auth guard — import and use it in any protected route
- Food data is loaded once at startup into `_food_data: List[dict]` in `services/food.py` — it is in-memory, not in MongoDB
- Food IDs are MD5 hashes of `item + category` — they are stable as long as the dataset doesn't change
- BMR uses Mifflin-St Jeor equation; TDEE = BMR × activity multiplier

### Frontend (`frontend/src/`)

| Path                             | Purpose                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| `lib/api.ts`                     | Axios instance + all API call helpers (`authApi`, `foodApi`, `logsApi`)            |
| `store/authStore.ts`             | Zustand store with `persist` middleware — holds `user`, `token`, `isAuthenticated` |
| `types/index.ts`                 | All shared TypeScript types + `MEAL_TYPES` constant + `CATEGORY_IMAGES` map        |
| `components/Layout.tsx`          | App shell — desktop sidebar + mobile drawer, uses `<Outlet />`                     |
| `components/CalorieRing.tsx`     | Pure SVG animated ring, takes `consumed` + `goal` props                            |
| `components/FoodSearchModal.tsx` | Full food search + serving size + logging flow in one modal                        |
| `pages/Dashboard.tsx`            | Daily view — calorie ring, stat cards, per-meal log sections                       |
| `pages/History.tsx`              | 7d/14d/30d charts (Recharts AreaChart + BarChart) + daily table                    |
| `pages/LogMeal.tsx`              | Meal type picker → opens FoodSearchModal                                           |
| `pages/Profile.tsx`              | User profile editor — metrics, activity, dietary prefs, calorie goal               |
| `pages/Login.tsx`                | Login form                                                                         |
| `pages/Register.tsx`             | 3-step registration wizard                                                         |

**Key patterns:**

- Auth is stored in Zustand with localStorage persistence. Token is automatically attached to every request via Axios request interceptor in `lib/api.ts`
- 401 responses auto-redirect to `/login` via the Axios response interceptor
- Route guards: `<PrivateRoute>` and `<PublicRoute>` wrappers in `App.tsx`
- All dates are strings in `YYYY-MM-DD` format throughout the app
- `MEAL_TYPES` in `types/index.ts` is the single source of truth for meal type labels, emojis, and colors — always reference this, never hardcode

---

## Design System

### Theme

Dark-first. Background is `#0a0a0a`. Never use lime-400 or light backgrounds.

| Token                | Value                                                | Usage |
| -------------------- | ---------------------------------------------------- | ----- |
| `bg-[#0a0a0a]`       | Page background                                      |       |
| `bg-[#111111]`       | Cards (`.card` class)                                |       |
| `bg-[#181818]`       | Elevated / inputs (`.card-elevated`, `.input` class) |       |
| `#242424`            | Borders                                              |       |
| `#a3e635` (lime-400) | Primary accent — calorie ring, CTAs, active states   |       |
| `#fb923c`            | Warning — approaching calorie limit                  |       |
| `#f87171`            | Danger — over calorie limit                          |       |
| `#38bdf8`            | Info accent                                          |       |
| `#a78bfa`            | Purple accent                                        |       |
| `#fbbf24`            | Yellow / breakfast                                   |       |

### Utility classes (defined in `index.css`)

- `.card` — dark card with border and rounded-2xl
- `.card-elevated` — slightly lighter card
- `.btn-primary` — lime-400 button, black text
- `.btn-ghost` — bordered ghost button
- `.input` — dark input field with focus ring
- `.label` — uppercase tracking label above inputs
- `.stagger` — applies staggered slide-up animation to direct children
- `.animate-slide-up`, `.animate-fade-in`, `.animate-scale-in` — one-shot animations
- `.ring-animated` — used on the CalorieRing SVG path

### Typography

- Font: `DM Sans` (loaded from Google Fonts in `index.css`)
- Monospace: `JetBrains Mono` for numbers/data where needed
- Never use Inter, Roboto, or system-ui

### Responsive breakpoints

- Mobile-first. The sidebar is hidden on `md:` and below — a top bar + drawer replaces it
- The FAB (`+` button) is visible only on mobile (`md:hidden`)
- All pages have `max-w-5xl mx-auto` and `p-4 md:p-6` padding

---

## TypeScript Rules

- `verbatimModuleSyntax` is **enabled** — always use `import type` for type-only imports:

```ts
// ✅ correct
import type { FoodItem, MealType } from "../types";
import { MEAL_TYPES } from "../types";

// ❌ wrong — will error at build
import { FoodItem, MealType, MEAL_TYPES } from "../types";
```

- No unused variables — the build (`tsc -b`) will fail. Remove or prefix with `_` if intentionally unused
- Always run `npx tsc --noEmit` before saying a change is complete

---

## API Conventions

### Dates

Always pass dates as `YYYY-MM-DD` strings. Never pass `Date` objects to the API.

```ts
const today = new Date().toISOString().split("T")[0]; // ✅
```

### Auth header

Handled automatically by the Axios interceptor in `lib/api.ts`. Never manually set `Authorization` headers.

### Error handling

API errors surface as `err.response.data.detail` (FastAPI convention). Toast errors like:

```ts
toast.error(err?.response?.data?.detail || "Something went wrong");
```

### Adding a new API route

1. Add the FastAPI route in the appropriate router file under `backend/app/routers/`
2. Add the corresponding helper function to `frontend/src/lib/api.ts`
3. Never call `axios` directly from a page — always go through `lib/api.ts`

---

## MongoDB

### Collections

| Collection  | Description                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| `users`     | User documents — includes hashed password, metrics, preferences                                          |
| `meal_logs` | One document per meal log entry — includes `user_id`, `date`, `meal_type`, `entries[]`, `total_calories` |
| `foods`     | All 416 food items — migrated from Excel via `migrate_foods.py`. `_id` = MD5 hash of item+category      |

### Patterns

- All `user_id` fields are stored as `ObjectId` in the DB and serialized to `str` in responses
- Always filter `meal_logs` by both `user_id` and `date` to scope queries correctly
- Food data lives in the `foods` MongoDB collection — queried async, not loaded into memory

---

## Food Dataset

**Collection:** `foods` in MongoDB
**Items:** 416
**Migration:** Run `python migrate_foods.py` from `backend/` to (re)load from `Final_FoodDataset.xlsx`

**Fields:** `id`, `item`, `category`, `cuisine`, `kcal_per_100g`, `scoop_g`, `bowl_g`, `restaurant_g`, `kcal_per_scoop`, `kcal_per_bowl`, `kcal_per_restaurant_serving`

To add new food items: insert directly into the `foods` collection, or edit the Excel file and re-run `migrate_foods.py` (it drops and re-inserts all items).

**Food images** are mapped by category in `frontend/src/types/index.ts` → `CATEGORY_IMAGES`. These are Unsplash URLs. To update an image, edit the map there.

---

## Adding New Features

### New page

1. Create `frontend/src/pages/MyPage.tsx`
2. Add route in `App.tsx` inside the `<Layout>` route block
3. Add nav item in `components/Layout.tsx` → `navItems` array

### New backend endpoint

1. Add route to appropriate router in `backend/app/routers/`
2. If it needs auth, add `current_user: dict = Depends(get_current_user)` parameter
3. Add corresponding function in `frontend/src/lib/api.ts`

### New meal type

Edit `MEAL_TYPES` in `frontend/src/types/index.ts` — it drives the dashboard sections, log modal tabs, and log page cards automatically.

### Changing the calorie goal logic

Located in `backend/app/services/auth.py` → `calculate_bmr()` and `calculate_tdee()`. The goal is auto-set on register if body metrics are provided, and can be manually overridden in Profile.

---

## Known Constraints & Gotchas

- **Food data is in MongoDB** — stored in the `foods` collection, migrated once via `backend/migrate_foods.py`. To add new items, insert directly into MongoDB or re-run the migration script after editing the Excel file.
- **No macro data** — the dataset only has calories. Protein/carbs/fat fields exist in the schema but are always `null` unless you extend the dataset.
- **Recharts + Tailwind** — don't try to style Recharts SVG elements with Tailwind classes; use inline `style` props or the Recharts color props directly.
- **Zustand persist** — the auth store is persisted to `localStorage` under the key `auth-storage`. Clearing this logs the user out. Don't rename the key without clearing existing sessions.
- **CORS** — `main.py` allows `localhost:5173` and `localhost:3000` only. Add your production domain to `allow_origins` before deploying.
- **JWT expiry** — tokens expire in 7 days (`ACCESS_TOKEN_EXPIRE_MINUTES=10080`). The Axios interceptor handles 401s by redirecting to `/login`.
- **Tailwind v3** — this project uses Tailwind **3.x**, not 4.x. Don't upgrade without testing — the config format changed significantly.

---

## Environment Variables

### Backend (`backend/.env`)

```
MONGODB_URL=mongodb://localhost:27017
DATABASE_NAME=calorie_tracker
SECRET_KEY=your-secret-key-min-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080
```

### Frontend (`frontend/.env`)

```
VITE_API_URL=http://localhost:8000
```

---

## Before Marking Any Task Done

- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npm run build` succeeds
- [ ] No unused imports or variables
- [ ] All type-only imports use `import type`
- [ ] New API routes are added to both the router and `lib/api.ts`
- [ ] New UI components follow the dark theme — no light backgrounds
- [ ] Dates are always `YYYY-MM-DD` strings
