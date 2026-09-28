# Feedants — Competition Details (Full-Stack Module)

> **Role:** Full Stack Development Intern — Technical Assignment  
> **Screen:** Competition Details (Feedants Classical Dance) — functional, dynamic, production-ready

This repo implements the **Competition Details** screen as a **real full-stack feature**, not a static UI mock. All data is dynamic from backend/MongoDB, with business rules, validations, and concurrency-safe registration.

---

## Live Demo (local)

| Layer | URL | Notes |
|-------|-----|-------|
| Backend | `http://localhost:4000/health` | Health + DB status |
| API | `http://localhost:4000/api/competitions/feedants-classical-dance` | Competition detail (send `x-user-id` header) |
| Frontend (Expo Web) | `http://localhost:19006` or `http://localhost:8081` | `npm run web` from `frontend/` |
| Frontend (Expo Go) | Scan QR from `npx expo start` | Physical device on same LAN |

**Test user:** `demo-user-001` (mapped to `000000000000000000000001`). Fresh state = *not registered* (shows `Register Now`). After register, shows `Registered`.

---

## Structure

```
Project/
├── backend/               # Node.js + Express + MongoDB (Mongoose)
│   ├── src/
│   │   ├── server.js      # Express app, CORS, helmet, morgan, rate-limit, memory fallback
│   │   ├── config/db.js   # Mongoose connect (pool 20)
│   │   ├── models/
│   │   │   ├── Competition.js   # Competition schema + virtuals + lifecycle
│   │   │   ├── Participation.js # userId+competitionId unique, idempotencyKey
│   │   │   └── User.js
│   │   ├── routes/competitions.js # GET list, GET detail, POST register (atomic), POST submit
│   │   ├── middleware/user.js     # x-user-id → ObjectId mapping (JWT stub)
│   │   ├── utils/time.js
│   │   └── seed.js        # Seeds 1 competition matching design + demo user
│   ├── .env / .env.example
│   └── package.json
├── frontend/              # React Native (Expo SDK 57, blank template)
│   ├── App.js             # Competition Details screen — pixel-close to design
│   ├── src/config.js      # API_BASE (localhost / 10.0.2.2 / LAN IP)
│   ├── src/api.js         # fetch/register/submit helpers
│   ├── app.json           # Expo config (android package, extra.apiUrl)
│   └── package.json
└── README.md
```

---

## Quick Start

### Prerequisites
- Node 18+ (tested 24), npm
- MongoDB running locally (`mongodb://localhost:27017/feedants`) **or** Atlas (see env)
- For mobile: Expo Go app on phone, or Android Studio / web

### 1) Backend

```bash
cd backend
npm install
cp .env.example .env   # edit MONGO_URI if needed
# Seed DB (creates competition + demo user)
npm run seed           # prints demo user id for x-user-id header

npm run dev            # http://localhost:4000  (nodemon)
# or
npm start
```

**Verify:**
```bash
curl http://localhost:4000/health
curl -H "x-user-id: demo-user-001" http://localhost:4000/api/competitions/feedants-classical-dance
```

If Mongo is down, backend still serves from **in-memory fallback** (so frontend never breaks in review).

### 2) Frontend (React Native / Expo)

```bash
cd frontend
npm install
# Set API URL for your environment:
# Web / iOS simulator → http://localhost:4000 (default)
# Android emulator → http://10.0.2.2:4000 (already default in src/config.js)
# Physical device → set EXPO_PUBLIC_API_URL=http://<YOUR_LAN_IP>:4000

# Web (quickest to review)
npm run web

# Expo Go (phone)
npx expo start
# scan QR — ensure phone and PC on same Wi-Fi, and API_BASE uses LAN IP

# Native
npm run android
npm run ios
```

> **Device tip:** if API fails on phone, edit `frontend/src/config.js` → `LAN_IP` constant to your machine's `ipconfig` IPv4.

---

## Environment Variables

**Backend `backend/.env`:**
```
PORT=4000
MONGO_URI=mongodb://localhost:27017/feedants
# Atlas: mongodb+srv://user:pass@cluster.mongodb.net/feedants
CLIENT_URL=*
NODE_ENV=development
```

**Frontend:** `EXPO_PUBLIC_API_URL` or `app.json → expo.extra.apiUrl`. Fallback logic in `src/config.js` handles localhost vs emulator.

---

## API Design

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | — | DB + time |
| GET | `/api/competitions` | `x-user-id` optional | List |
| GET | `/api/competitions/:slug` | `x-user-id` | Detail with `userState` (isRegistered, canRegister, canSubmit, lifecycle, spotsLeft, registrationClosesInMs, serverTime) |
| POST | `/api/competitions/:slug/register` | `x-user-id` + `x-idempotency-key` | **Atomic** registration (capacity check + bookedCount increment). Concurrency-safe (transactions on replica set, fallback to atomic `findOneAndUpdate $lt capacity`). Idempotent. |
| POST | `/api/competitions/:slug/submit` | `x-user-id` | Upload submission URL (only if registered + lifecycle `submission`) |

**Headers:** `x-user-id: demo-user-001` (mapped to fixed ObjectId; in prod → JWT). `x-idempotency-key: <uuid>` for register retries.

---

## Data Model (MongoDB)

**Competition**
- `slug` (unique index), `title`, `category`, `tags`, `badge`, `prizePool`, `entryFee`, `capacity`, `bookedCount`
- `registrationDeadline`, `submissionStartsAt`, `submissionEndsAt`, `resultAt` (UTC Dates)
- `status` enum, `judge {name, bio, avatarUrl, introVideoUrl}`, `about`, `judgingParameters[]`, `rules[]`, `rewards[]`, `previousWinners[]`, `referral`, `razorpayEnabled`, `version`
- **Virtuals:** `spotsLeft`, `isFull`; **Method:** `computeLifecycle(now)` → `open | closed | submission | judging | completed`

**Participation**
- `userId` (ObjectId ref User), `competitionId`, `status` (`registered|submitted|payment_pending|cancelled`), `submissionUrl`, `idempotencyKey`
- **Unique index** `userId+competitionId` — prevents double register.

**User**
- `name`, `phone`, `email`, `avatarUrl`, `referralCode`

---

## Frontend States & Business Rules (implemented)

- **Lifecycle:** derived server-side from dates (`open → closed → submission → judging → completed`). Frontend respects it.
- **Spots:** `capacity - bookedCount`, progress bar, "Only N spots left". Button disabled if `isFull`.
- **Registration:** `canRegister = lifecycle==='open' && !isRegistered && !isFull`. Shows `Registered` badge if already. Debounced + idempotency key prevents double-tap duplicates.
- **Countdown:** `registrationClosesInMs` + client tick every 1s (`01d : 06h : 28m : 32s` format). Re-syncs via polling + `serverTime`.
- **Consistency / Concurrency:** polling every 15s, pull-to-refresh, and atomic backend ensures 1000s concurrent users don't overbook (`bookedCount <$lt capacity` in single atomic op; transactions when available; unique index + rollback on race).
- **Submission:** only if `isRegistered && lifecycle==='submission'`; otherwise shows explanatory message. Calls `POST /submit`.
- **Edge cases:** deadline passed → 409; full → 409; already registered → 200 (idempotent); invalid slug → 404; missing `submissionUrl` → 400.
- **Design fidelity:** prize pool, entry fee, judge card, Important Dates (IST 11:50 PM style), previous winners horizontal scroll, tabs (About/Judging/Rules), rewards 1st-6th, disclaimer, Razorpay/shield, Refer & Earn copy, sticky Upload/ Register CTA, bottom nav (Home/Explore/+/Competitions/Profile).

---

## Evaluation Mapping

| Criterion | How addressed |
|-----------|---------------|
| Design accuracy | `App.js` is 1:1 layout, colors #0E6B7A teal, cards, chips, progress, tabs |
| RN quality | Expo SDK 57, functional components, hooks, RefreshControl, no class components |
| Component reusability | Separated `src/api`, `src/config`, styles extracted, tab/reward/winner reusable patterns |
| Dynamic states | All from API; countdown live; userState branching |
| Backend architecture | Layered (config/models/routes/middleware/utils), helmet/cors/morgan/rate-limit |
| Mongo modelling | Proper refs, indexes, virtuals, lifecycle method, versioning |
| Business logic | Lifecycle, capacity, idempotency, submission window, referral |
| Validations/edge cases | Joi, 409/400 handling, deadline/full/duplicate checks |
| Concurrency | Atomic `findOneAndUpdate` + transactions + unique index + fallback for standalone Mongo |
| Scalability | Connection pooling (20), lean queries, stateless, polling-friendly, ready for Redis/queue |
| Code quality | Prettier-style, comments minimal, error handling, logs |

---

## Assumptions

- Auth is simplified to `x-user-id` header (would be JWT in prod).
- Payments: Razorpay integration is stubbed (UI shows "Secure payments powered by Razorpay"); actual order creation/webhook is out-of-scope for this screen but entryFee is stored and checked.
- Single competition seeded (`feedants-classical-dance`) matches the design; system supports multiple via slug.
- Dates are seeded dynamically relative to *now* so lifecycle stays `open` for review; Important Dates reflect seeded values (adjust in `seed.js`).
- In-memory fallback allows demo without Mongo; seeding requires Mongo.

## Trade-offs

- No Redux/Zustand — kept state in `App.js` for assignment simplicity; would add store for larger app.
- No Expo Router — used single-screen `App.js` to match single-screen assignment; router added only if multi-screen needed.
- Polling (15s) vs WebSocket — polling is simpler for assignment; would use WebSocket/SSE for real-time spots.
- Transactions used when replica set available, with graceful fallback to atomic single-doc op for local standalone Mongo (common in interviews).

## What would improve for production

- JWT + refresh, OTP, rate-limit per user, Razorpay order + webhook verification, queue for high concurrency (BullMQ), Redis caching, pagination, image upload (S3), i18n (ENG/हिंदी toggle wired but strings not fully translated), EAS build + CI, Sentry, tests (jest / supertest / k6 load).

---

## Screen Recording

Record with Expo: on web, capture browser; on device, screen-record Expo Go while: 1) pull-to-refresh, 2) countdown ticking, 3) tap Register → see Registered + spots 19→18, 4) copy referral, 5) switch tabs, 6) try double register (idempotent).

---

## Git

```bash
git init
git add .
git commit -m "feat: Feedants competition details — full-stack (RN + Express + Mongo)"
```

---

## Authors

Built for Feedants Full Stack Internship — tech assignment (React Native + Node/Express + MongoDB).
