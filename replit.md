# SmarkQuant

A quantitative trading platform for strategy development, backtesting, and automated analysis.

## Architecture

- **Frontend**: Next.js 16 (React 19), Tailwind CSS 4, Recharts, Framer Motion — runs on port 5000
- **Backend**: FastAPI (Python), Jesse trading framework, Optuna — runs on port 8000
- **Communication**: Next.js rewrites proxy all `/api/*` requests to `http://localhost:8000/*`

## Project Structure

```
/
├── frontend/           # Next.js application
│   ├── src/app/        # App router pages (backtest, strategies, import, live, optimize, quant, settings)
│   ├── next.config.ts  # Contains /api/* rewrite proxy to backend port 8000
│   └── package.json    # Scripts configured for port 5000 (-p 5000 -H 0.0.0.0)
├── backend/            # FastAPI Python backend
│   ├── main.py         # API entry point with Jesse process manager
│   ├── routes.py       # Jesse trading routes config
│   ├── config.py       # Jesse system config
│   └── requirements.txt
└── .env                # Environment variables (Postgres, Redis config)
```

## Workflows

- **Start application**: `cd frontend && npm run dev` — serves the Next.js frontend on port 5000 (webview)
- **Backend API**: `cd backend && uvicorn main:app --host 0.0.0.0 --port 8000` — FastAPI backend (console)

## Key Configuration

- All frontend API calls use `/api/...` (relative path), which Next.js proxies to `http://localhost:8000/...`
- This pattern ensures the app works correctly in Replit's proxied environment
- Frontend port 5000 is required for Replit's webview output type

## Trading History

A persistent trading history database is built into `market_data.db` (the `trading_history` table).

- **Auto-saves** every completed backtest and every stopped live/paper bot session
- **Sidebar link**: Trade History (`/history`)
- **Full metrics per session**: PNL, Win Rate, Sharpe, Sortino, Calmar, Omega, Serenity, Avg Win/Loss, Streaks, Expectancy, Gross P&L, Max Drawdown, trade counts, longs/shorts breakdown, fees, equity curve
- **Filter** by backtest / live / paper
- **Expandable rows** with all three metric groups: Performance, Risk, Trade Metrics
- **Inline equity curve** SVG for backtest sessions
- **Notes** field per session (editable in-place)
- **Delete** any session
- `GET /history`, `POST /history`, `DELETE /history/{id}`, `PATCH /history/{id}/notes`
- Backend module: `backend/trade_history.py`

## Alpaca Live Trading Integration

The Live Dashboard (`/live`) supports **Alpaca Live** and **Alpaca Paper** as exchange options alongside Simulated, Binance, Bybit, and Coinbase.

### How it works
- Select **Alpaca Live** or **Alpaca Paper** from the Exchange dropdown on the Live Dashboard
- The bot connects to Alpaca's REST API to fetch real-time prices and place real market orders
- An Alpaca Dashboard panel appears showing real-time account equity, cash, buying power, open positions, and recent orders
- The panel auto-refreshes every 15 seconds and syncs with the actual Alpaca account

### Required Secrets
Add these in the Replit Secrets tab:
- `ALPACA_API_KEY` — your Alpaca API key
- `ALPACA_SECRET_KEY` — your Alpaca secret key

Get your keys from [alpaca.markets](https://alpaca.markets/) → Account → API Keys.

### New Backend Endpoints
- `GET /alpaca/account?paper=true/false` — account info (equity, cash, buying power)
- `GET /alpaca/positions?paper=true/false` — all open positions
- `GET /alpaca/orders?paper=true/false&limit=20` — recent orders

## Multi-Currency Support

All live/paper bot sessions support multiple currencies: USD, NGN, EUR, GBP, CNY, JPY, CAD, AUD, CHF, ZAR.

- `backend/currency_utils.py` holds all exchange rates and symbols
- Currency is stored per session in `trading_history` table (`currency` column)
- Portfolio page converts all session values to USD using `toUsd()` before summing
- Per-session currency badges and native currency amounts shown in trades tab

## Portfolio Dashboard

The portfolio page (`/portfolio`) is the main fund overview:

- **AUM Hero**: Shows total live/paper assets (converted to USD). Backtests are excluded from AUM because they reuse the same simulated capital — their PnL is shown separately as "Simulated PnL"
- **PnL breakdown**: Live/Paper PnL vs Simulated (Backtest) PnL vs All sessions combined
- **Compact notation**: `fmtFull()` handles K/M/B/T/Q/QQ suffixes to avoid huge raw number display
- **Alpaca integration**: Available cash, buying power, and position values use Alpaca API data when connected; falls back to estimates from equity

## Live Bot Features

Each bot card on the Live Dashboard (`/live`) has an expandable details section (chart icon button):

- **Equity curve chart**: Mini Recharts LineChart showing equity snapshots over time, colored green/red based on P&L
- **Completed trades table**: All closed trades showing entry/exit price, side, P&L, reason (SL/TP), and time
- **Equity snapshots**: Recorded every 5 ticks in memory, saved to trade history DB when bot stops
- **Completed trades**: Tracked in memory per bot session, last 50 shown in details panel

## Dependencies

Frontend uses npm (package-lock.json present).
Backend uses pip — core deps: fastapi, uvicorn, pydantic, python-multipart, alpaca-py. Heavy deps (jesse, optuna, psycopg2) may require additional setup.
