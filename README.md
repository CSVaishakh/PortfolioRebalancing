# PortfolioIQ

A privacy-preserving portfolio rebalancing platform powered by federated learning. Users upload their holdings and receive AI-driven rebalance/hold recommendations — all model training happens in the browser. Only aggregated weight updates ever leave the device.

---

## How It Works

1. **Upload** your portfolio (CSV or Excel) using the provided template
2. **Feature extraction** computes 12 signals from your holdings and live NIFTY 100 market data
3. **Local training** runs a logistic regression model in your browser on your single portfolio snapshot
4. **Prediction** — Rebalance or Hold, with confidence score and condition breakdown
5. **Federated contribution** — your model weights are uploaded and averaged with other users via FedAvg, improving the global model for everyone

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Browser (Next.js + TensorFlow.js)                      │
│  Portfolio upload → Feature engineering → Local fit     │
│  → Predict → Upload weights                             │
└────────────────────┬────────────────────────────────────┘
                     │ REST (JWT)
┌────────────────────▼────────────────────────────────────┐
│  Platform Service (Express + Node.js :5000)             │
│  Auth · User weight storage · FedAvg aggregation        │
│  globalModelHistory · userModelHistory (Postgres)       │
└────────────────────┬────────────────────────────────────┘
                     │ REST (internal)
┌────────────────────▼────────────────────────────────────┐
│  Model Service (FastAPI + scikit-learn :8000)           │
│  /train/dataset · /weights (get/set)                    │
└─────────────────────────────────────────────────────────┘
```

### Federated Learning Flow

```
Client loads global weights (warm-start)
  → trains on 1 sample locally
  → uploads weights to platform-service
    → FedAvg: uniform average of all latest user weights
      → aggregated weights pushed to model-service
        → saved to globalModelHistory
          → next client warm-starts from improved model
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| In-browser ML | TensorFlow.js 4.22 (logistic regression) |
| File parsing | PapaParse (CSV), XLSX (Excel) |
| Backend | Express 5, Node.js, TypeScript |
| ORM | Drizzle ORM + Drizzle Kit |
| Database | PostgreSQL 17 (Docker) |
| ML service | FastAPI, scikit-learn, pandas, NumPy |
| ML server | Uvicorn |
| Monorepo | Turborepo + npm workspaces |
| Auth | JWT (jsonwebtoken) + bcryptjs |

---

## Project Structure

```
.
├── apps/
│   ├── react-client/               # Next.js frontend
│   │   ├── app/
│   │   │   ├── page.tsx            # Landing page
│   │   │   ├── auth/               # Sign in / Sign up
│   │   │   ├── interact/           # Portfolio upload & prediction
│   │   │   └── train/              # Admin: seed model & run FedAvg
│   │   ├── lib/
│   │   │   ├── featureEngineering.ts   # 12-feature vector + labeling function
│   │   │   ├── portfolioParser.ts      # CSV / Excel parser
│   │   │   └── marketData.ts           # NIFTY 100 parsing + market features
│   │   ├── ts-model/
│   │   │   └── logisticRegression.ts   # TF.js logistic regression (sklearn API)
│   │   └── public/dataset/
│   │       └── NIFTY 100-01-03-2025-to-01-03-2026.csv
│   │
│   ├── platform-service/           # Express backend
│   │   └── src/
│   │       ├── routes/
│   │       │   ├── auth.router.ts      # /auth/signup, /auth/signin
│   │       │   ├── client.router.ts    # Model weight endpoints
│   │       │   └── model.route.ts      # FedAvg, seed, train
│   │       ├── queries/
│   │       │   ├── auth.queries.ts
│   │       │   └── client.queries.ts
│   │       └── middleware/
│   │           └── auth.middleware.ts
│   │
│   └── model-service/              # FastAPI ML service
│       ├── app/
│       │   ├── main.py             # Endpoints
│       │   └── model.py            # GlobalModel (sklearn wrapper)
│       └── dataset.csv             # Training data (5000 rows)
│
└── packages/
    └── database/                   # Shared Drizzle schema + Docker Compose
        └── src/
            └── schema.ts
```

---

## Feature Engineering

Each prediction is built from a **12-dimensional feature vector**:

| # | Feature | Description |
|---|---------|-------------|
| 0 | `num_stocks` | Number of holdings |
| 1 | `max_stock_weight` | Largest single holding weight |
| 2 | `top3_concentration` | Sum of 3 largest weights |
| 3 | `total_weight_drift` | Σ \|Wᵢ − 1/N\| |
| 4 | `portfolio_return` | Σ Wᵢ × Rᵢ |
| 5 | `portfolio_volatility` | Σ Wᵢ × (Rᵢ − Rₚ)² |
| 6 | `sector_concentration` | Max sector weight sum |
| 7 | `days_since_last_rebalance` | User-provided |
| 8 | `market_return_30d` | NIFTY 100 30-day return |
| 9 | `market_volatility_30d` | NIFTY 100 30-day volatility |
| 10 | `market_drawdown_90d` | NIFTY 100 90-day drawdown |
| 11 | `market_trend` | MA20 > MA50 → 1 (bullish), else 0 |

### Labeling Function

A probabilistic scoring heuristic — no ground-truth labels required:

```
t_score = bracket(days_since_last_rebalance)
  ≤14d → -5.0 | ≤30d → -2.5 | ≤45d → -0.5
  ≤60d → +0.5 | ≤90d → +2.5 | >90d → +5.0

delta = adjustments from drift, concentration,
        sector exposure, market drawdown, trend,
        volatility (clamped to [-2.5, +2.5])

score = t_score + delta
prob  = sigmoid(score)
label = 1 (Rebalance) if prob ≥ 0.5, else 0 (Hold)
```

---

## Database Schema

```
users
  userid · username · email · password

usermodelhistory
  serialno · userid (FK) · coeff (jsonb) · intercept (jsonb) · timestamp

globalmodelhistory
  serialno · coeff (jsonb) · intercept (jsonb) · timestamp
```

---

## API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/signup` | Register |
| POST | `/auth/signin` | Login → returns JWT |

### Client (requires `token` header)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/client/model/global` | Latest global model weights |
| POST | `/client/model/weights` | Upload locally trained weights |
| GET | `/client/model/weights` | User's last uploaded weights |
| GET | `/client/model/history` | Paginated weight history |

### Admin (requires `x-admin-secret` header)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/model/seed` | Train global model on `dataset.csv` |
| POST | `/model/train` | Run FedAvg over all user weights |

### Model Service (internal, port 8000)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/train/dataset` | Train on bundled dataset |
| GET | `/weights` | Get current weights |
| POST | `/weights` | Set weights |

---

## Getting Started

### Prerequisites

- Node.js 18+, npm 11.8.0
- Python 3.11 + virtualenv
- Docker & Docker Compose

### 1. Clone & install

```bash
git clone https://github.com/CSVaishakh/PortfolioRebalancing
cd PortfolioRebalancing
npm install
```

### 2. Environment variables

**`apps/platform-service/.env`**
```env
PORT=5000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/portfolio_rebalancing
JWT_SECRET=your-secret-here
JWT_EXPIRES_IN=7d
MODEL_SERVICE_URL=http://localhost:8000
ADMIN_SECRET=your-admin-secret
```

**`apps/react-client/.env`**
```env
PORT=3000
NEXT_PUBLIC_API_URL=http://localhost:5000
```

**`apps/model-service/.env`**
```env
PORT=8000
```

### 3. Set up Python environment

```bash
cd apps/model-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 4. Start everything

```bash
npm run dev
```

This starts the database, platform service (:5000), React client (:3000), and model service (:8000) concurrently.

### 5. Seed the global model

Navigate to `/train` in the browser, enter your `ADMIN_SECRET`, and click **Seed from dataset.csv**. This trains the initial global model on the bundled 5000-row dataset.

---

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start all services + database |
| `npm run build` | Build all packages via Turbo |
| `npm run db:start` | Start PostgreSQL container |
| `npm run db:stop` | Stop PostgreSQL container |
| `npm run db:push` | Push Drizzle schema to database |
| `npm run db:studio` | Open Drizzle Studio (DB GUI) |
| `npm run db:shell` | Open psql shell |
| `npm run db:clear` | Truncate all tables, reset sequences |
| `npm run db:clear:weights` | Truncate model tables only (keep users) |
| `npm run db:reset` | Destroy volume, recreate and push schema |

---

## Portfolio Template

Download the template from the `/interact` page. Required columns:

| Column | Description |
|--------|-------------|
| Symbol | Stock ticker (e.g. RELIANCE) |
| ISIN | ISIN code |
| Sector | Sector name |
| Quantity | Number of shares held |
| Average Buy Price | Your average purchase price |
| Current Price | Current market price |

---

## Privacy Model

- Raw portfolio data **never leaves the browser**
- Only model weights (gradient updates) are uploaded
- Weights alone cannot reconstruct individual holdings
- The global model improves with each user contribution via FedAvg
