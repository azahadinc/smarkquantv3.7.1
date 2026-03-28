# SmarkQuant

SmarkQuant is a sophisticated quantitative trading platform designed for strategy development, backtesting, and automated analysis. It features a modern web-based frontend and a high-performance Python backend.

## 🚀 Features

- **Backtesting**: Evaluate trading strategies against historical data.
- **Strategy Optimization**: Use Optuna for automated hyperparameter tuning.
- **Visual Analytics**: Interactive charts powered by Recharts.
- **Modern UI**: Dark-mode optimized dashboard built with Next.js and Tailwind CSS.
- **Quant Framework**: Integrated with the [Jesse](https://jesse.ai/) trading framework.

## 🏗️ Tech Stack

- **Frontend**: [Next.js](https://nextjs.org/) (React), Tailwind CSS, Lucide React, Recharts, Framer Motion.
- **Backend**: [FastAPI](https://fastapi.tiangolo.com/), Python, Jesse, Pandas, Optuna.
- **Infrastructure**: Docker, PostgreSQL, Redis.

---

## 🛠️ Getting Started

### Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose (recommended)
- **OR** Node.js 18+ and Python 3.10+

### Option 1: Quick Start with Docker (Recommended)

1. **Clone the repository** (if you haven't already).
2. **Start the services**:
   ```bash
   docker-compose up --build
   ```
3. **Access the platform**:
   - Frontend: [http://localhost:3000](http://localhost:3000)
   - Backend API: [http://localhost:8000](http://localhost:8000)
   - API Docs (Swagger): [http://localhost:8000/docs](http://localhost:8000/docs)

### Option 2: Manual Setup (Development)

#### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   # Windows:
   .\venv\Scripts\activate
   # Linux/macOS:
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install "uvicorn[standard]>=0.29.0" pip install "pydantic>=2.0.0" pip install "python-multipart>=0.0.9" pip install "pandas>=2.0.0" pip install "numpy>=1.26.0" pip install "yfinance>=0.2.40" pip install "alpaca-py>=0.20.0" pip install "optuna>=3.6.0" pip install "jesse>=0.47.0" pip install "psycopg2-binary>=2.9.9" pip install "redis>=5.0.0"
   ###
  

   ```
4. Start the backend:
   ```bash
   uvicorn main:app --reload
   ```

#### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Optional Jesse extension endpoints
- `GET /api/jesse/version` : get installed Jesse version (or error if missing)
- `POST /api/jesse/update` : upgrade Jesse (`{ "version": "0.47.0" }` optional)
- `POST /api/jesse/backtest` : run native Jesse backtest CLI in project (if installed)

---

## 📁 Project Structure

```text
SmarkQuant/
├── backend/            # FastAPI & Quant logic
│   ├── strategies/     # Trading strategy implementations
│   ├── main.py        # API Entry point
│   └── requirements.txt
├── frontend/           # Next.js Application
│   ├── src/app        # App router and pages
│   └── package.json
├── docker-compose.yml  # Infrastructure orchestration
└── .env                # Environment variables
```

## 📝 License

[MIT](LICENSE)
