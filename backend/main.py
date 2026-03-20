from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import subprocess
import json
import shutil
import threading
import time
from bot_manager import bot_manager
from db_config import DB_PATH
from trade_history import (
    init_history_table, save_session, list_sessions,
    get_session, delete_session, update_notes
)
from transactions import (
    init_transactions_table, create_transaction,
    verify_otp, list_transactions, get_transaction_summary
)

app = FastAPI(title="Quant Trading Platform API")

# Process Management for Jesse
class JesseProcessManager:
    def __init__(self):
        self.process = None
        self.logs = []
        self.is_running = False
        self.last_command = ""
        self.start_time = 0
        self.finish_time = 0

    def run_command(self, command, cwd):
        if self.is_running:
            return False, "A process is already running"
        
        self.is_running = True
        self.logs = []
        self.last_command = command
        self.start_time = time.time()
        self.finish_time = 0

        def runner():
            try:
                self.process = subprocess.Popen(
                    command,
                    cwd=cwd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    shell=True
                )
                for line in self.process.stdout:
                    self.logs.append(line)
                    if len(self.logs) > 2000:
                        self.logs.pop(0)
                
                self.process.wait()
            except Exception as e:
                self.logs.append(f"CRITICAL ERROR: {str(e)}")
            finally:
                self.is_running = False
                self.finish_time = time.time()
        
        thread = threading.Thread(target=runner)
        thread.daemon = True
        thread.start()
        return True, "Started"

    def get_status(self):
        return {
            "is_running": self.is_running,
            "logs": self.logs[-50:], # Return last 50 logs for polling
            "last_command": self.last_command,
            "runtime": round(time.time() - self.start_time, 2) if self.is_running else round(self.finish_time - self.start_time, 2)
        }

    def stop_process(self):
        if self.process and self.is_running:
            self.process.terminate()
            self.is_running = False
            self.finish_time = time.time()
            self.logs.append("--- PROCESS TERMINATED BY USER ---")
            return True, "Stopped"
        return False, "No process running"

jesse_mgr = JesseProcessManager()

# Allow all CORS for dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STRATEGIES_DIR = "strategies"

class StrategyUpdate(BaseModel):
    code: str

class StrategyCreate(BaseModel):
    name: str

class CandleImportRequest(BaseModel):
    exchange: str
    symbol: str
    start_date: str
    timeframe: str = "1Day"
    source: str = "yfinance"

class BacktestRequest(BaseModel):
    start_date: str
    finish_date: str
    strategy_name: str = ""
    symbol: str = ""
    exchange: str = ""

class OptimizeRequest(BaseModel):
    start_date: str
    finish_date: str
    optimal_total: int = 10
    cpu_cores: int = 2

class LiveRequest(BaseModel):
    exchange: str
    symbol: str

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Quant Platform API is running"}

@app.get("/backtest/results")
def get_backtest_results():
    # Jesse saves JSON reports in /storage/json/
    json_dir = os.path.join("storage", "json")
    if not os.path.exists(json_dir):
        return {"results": None, "error": "No results found in storage/json"}
    
    # Get the latest JSON file
    files = [os.path.join(json_dir, f) for f in os.listdir(json_dir) if f.endswith(".json")]
    if not files:
        return {"results": None}
    
    latest_file = max(files, key=os.path.getmtime)
    with open(latest_file, "r") as f:
        data = json.load(f)
    
    return {"results": data, "filename": os.path.basename(latest_file)}

# ---------------------------------------------------------------------------
# Trading History Endpoints
# ---------------------------------------------------------------------------

init_history_table()
init_transactions_table()

class HistorySaveRequest(BaseModel):
    session_type: str = "backtest"
    strategy: str = ""
    symbol: str = ""
    exchange: str = ""
    timeframe: str = ""
    start_date: str = ""
    end_date: str = ""
    notes: str = ""
    metrics: dict = {}
    equity_curve: list = []
    currency: str = "USD"

class HistoryNotesRequest(BaseModel):
    notes: str

@app.get("/history")
def get_history(session_type: str = Query(default=""), limit: int = Query(default=200)):
    sessions = list_sessions(session_type=session_type or None, limit=limit)
    return {"sessions": sessions, "total": len(sessions)}

@app.get("/history/{session_id}")
def get_history_session(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@app.post("/history")
def create_history_session(req: HistorySaveRequest):
    session_id = save_session(
        session_type=req.session_type,
        strategy=req.strategy,
        symbol=req.symbol,
        exchange=req.exchange,
        timeframe=req.timeframe,
        start_date=req.start_date,
        end_date=req.end_date,
        metrics=req.metrics,
        equity_curve=req.equity_curve,
        notes=req.notes,
        currency=req.currency,
    )
    return {"status": "saved", "id": session_id}

@app.patch("/history/{session_id}/notes")
def patch_history_notes(session_id: str, req: HistoryNotesRequest):
    ok = update_notes(session_id, req.notes)
    if not ok:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "updated"}

@app.delete("/history/{session_id}")
def delete_history_session(session_id: str):
    ok = delete_session(session_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "deleted"}

# ---------------------------------------------------------------------------

@app.get("/strategies")
def list_strategies():
    if not os.path.exists(STRATEGIES_DIR):
        return {"strategies": []}
    
    strategies = [d for d in os.listdir(STRATEGIES_DIR) if os.path.isdir(os.path.join(STRATEGIES_DIR, d)) and not d.startswith("__")]
    return {"strategies": strategies}

@app.get("/strategies/{name}")
def get_strategy(name: str):
    strategy_path = os.path.join(STRATEGIES_DIR, name, "__init__.py")
    if not os.path.exists(strategy_path):
        raise HTTPException(status_code=404, detail="Strategy not found")
    
    with open(strategy_path, "r") as f:
        code = f.read()
    
    return {"name": name, "code": code}

@app.post("/strategies")
def create_strategy(strategy: StrategyCreate):
    name = strategy.name
    strategy_dir = os.path.join(STRATEGIES_DIR, name)
    
    if os.path.exists(strategy_dir):
        raise HTTPException(status_code=400, detail="Strategy already exists")
    
    os.makedirs(strategy_dir)
    
    template = f"""from jesse.strategies import Strategy, Cached
import jesse.indicators as ta
from jesse import utils

class {name}(Strategy):
    def should_long(self) -> bool:
        return False

    def should_short(self) -> bool:
        return False

    def go_long(self):
        pass

    def go_short(self):
        pass

    def should_cancel_entry(self) -> bool:
        return True

    def filters(self):
        return []
"""
    with open(os.path.join(strategy_dir, "__init__.py"), "w") as f:
        f.write(template)
    
    return {"status": "created", "name": name}

@app.put("/strategies/{name}")
def update_strategy(name: str, update: StrategyUpdate):
    strategy_path = os.path.join(STRATEGIES_DIR, name, "__init__.py")
    if not os.path.exists(strategy_path):
        raise HTTPException(status_code=404, detail="Strategy not found")
    
    with open(strategy_path, "w") as f:
        f.write(update.code)
    
    return {"status": "updated"}

@app.delete("/strategies/{name}")
def delete_strategy(name: str):
    strategy_dir = os.path.join(STRATEGIES_DIR, name)
    if not os.path.exists(strategy_dir):
        raise HTTPException(status_code=404, detail="Strategy not found")
    
    shutil.rmtree(strategy_dir)
    return {"status": "deleted"}

@app.get("/configs/{filename}")
def get_config(filename: str):
    if filename not in ["config.py", "routes.py"]:
        raise HTTPException(status_code=400, detail="Invalid config file")
    
    file_path = filename
    if not os.path.exists(file_path):
        # Return empty if doesn't exist yet
        return {"filename": filename, "code": ""}
    
    with open(file_path, "r") as f:
        code = f.read()
    
    return {"filename": filename, "code": code}

@app.put("/configs/{filename}")
def update_config(filename: str, update: StrategyUpdate):
    if filename not in ["config.py", "routes.py"]:
        raise HTTPException(status_code=400, detail="Invalid config file")
    
    file_path = filename
    with open(file_path, "w") as f:
        f.write(update.code)
    
    return {"status": "updated"}

@app.get("/jesse/status")
def get_jesse_status():
    return jesse_mgr.get_status()

@app.post("/candles/import")
def import_candles(req: CandleImportRequest):
    source = req.source.lower()
    tf = req.timeframe or "1Day"

    if source == "alpaca":
        # Determine stock vs crypto by checking symbol format (BTC-USD, ETH-USD etc)
        crypto_bases = {"BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "AVAX", "DOT",
                        "LINK", "LTC", "ATOM", "UNI", "DOGE", "SHIB", "MATIC"}
        base = req.symbol.split("-")[0].upper()
        asset_type = "crypto" if base in crypto_bases else "stock"
        command = (
            f"python alpaca_importer.py {req.symbol} {req.start_date} "
            f"{tf} alpaca {asset_type}"
        )
    elif req.exchange.lower() == "yfinance":
        command = f"python yfinance_importer.py {req.symbol} {req.start_date}"
    else:
        command = f"python yfinance_importer.py {req.symbol} {req.start_date} {req.exchange}"

    success, message = jesse_mgr.run_command(command, os.getcwd())
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"status": "started", "message": message}

@app.get("/alpaca/quote/{symbol}")
def get_alpaca_quote(symbol: str):
    """Return latest trade price for a symbol from Alpaca."""
    import os as _os
    api_key = _os.environ.get("ALPACA_API_KEY", "")
    secret_key = _os.environ.get("ALPACA_SECRET_KEY", "")
    if not api_key or not secret_key:
        raise HTTPException(status_code=503, detail="Alpaca API keys not configured")
    try:
        from alpaca.data.historical import StockHistoricalDataClient, CryptoHistoricalDataClient
        from alpaca.data.requests import StockLatestTradeRequest, CryptoLatestTradeRequest

        crypto_bases = {"BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "AVAX", "DOT",
                        "LINK", "LTC", "ATOM", "UNI", "DOGE", "SHIB", "MATIC"}
        base = symbol.split("-")[0].upper()
        is_crypto = base in crypto_bases

        if is_crypto:
            alpaca_sym = symbol.replace("-", "/")
            client = CryptoHistoricalDataClient(api_key, secret_key)
            req = CryptoLatestTradeRequest(symbol_or_symbols=alpaca_sym)
            trade = client.get_crypto_latest_trade(req)
            price = float(trade[alpaca_sym].price)
        else:
            client = StockHistoricalDataClient(api_key, secret_key)
            req = StockLatestTradeRequest(symbol_or_symbols=symbol)
            trade = client.get_stock_latest_trade(req)
            price = float(trade[symbol].price)

        return {"symbol": symbol, "price": price, "source": "alpaca"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _get_alpaca_trading_client(paper: bool = False):
    """Helper: return an Alpaca TradingClient or raise 503."""
    api_key = os.environ.get("ALPACA_API_KEY", "")
    secret_key = os.environ.get("ALPACA_SECRET_KEY", "")
    if not api_key or not secret_key:
        raise HTTPException(status_code=503, detail="Alpaca API keys not configured. Add ALPACA_API_KEY and ALPACA_SECRET_KEY in Secrets.")
    try:
        from alpaca.trading.client import TradingClient
        return TradingClient(api_key, secret_key, paper=paper)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Alpaca client error: {e}")


@app.get("/alpaca/account")
def get_alpaca_account(paper: bool = False):
    """Return Alpaca account details (equity, cash, buying power, etc.)."""
    tc = _get_alpaca_trading_client(paper=paper)
    try:
        acct = tc.get_account()
        return {
            "id": str(acct.id),
            "status": str(acct.status).replace("AccountStatus.", ""),
            "currency": str(acct.currency),
            "cash": float(acct.cash),
            "equity": float(acct.equity),
            "buying_power": float(acct.buying_power),
            "portfolio_value": float(acct.portfolio_value),
            "long_market_value": float(acct.long_market_value),
            "short_market_value": float(acct.short_market_value),
            "daytrade_count": int(acct.daytrade_count) if acct.daytrade_count else 0,
            "pattern_day_trader": bool(acct.pattern_day_trader),
            "trading_blocked": bool(acct.trading_blocked),
            "account_blocked": bool(acct.account_blocked),
            "paper": paper,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/alpaca/positions")
def get_alpaca_positions(paper: bool = False):
    """Return all open Alpaca positions."""
    tc = _get_alpaca_trading_client(paper=paper)
    try:
        positions = tc.get_all_positions()
        result = []
        for p in positions:
            result.append({
                "symbol": str(p.symbol),
                "qty": float(p.qty),
                "side": str(p.side).replace("PositionSide.", ""),
                "avg_entry_price": float(p.avg_entry_price),
                "current_price": float(p.current_price) if p.current_price else None,
                "market_value": float(p.market_value) if p.market_value else None,
                "unrealized_pl": float(p.unrealized_pl) if p.unrealized_pl else None,
                "unrealized_plpc": float(p.unrealized_plpc) if p.unrealized_plpc else None,
                "cost_basis": float(p.cost_basis) if p.cost_basis else None,
            })
        return {"positions": result, "paper": paper}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/alpaca/orders")
def get_alpaca_orders(paper: bool = False, limit: int = 20):
    """Return recent Alpaca orders."""
    tc = _get_alpaca_trading_client(paper=paper)
    try:
        from alpaca.trading.requests import GetOrdersRequest
        from alpaca.trading.enums import QueryOrderStatus
        req = GetOrdersRequest(status=QueryOrderStatus.ALL, limit=limit)
        orders = tc.get_orders(filter=req)
        result = []
        for o in orders:
            result.append({
                "id": str(o.id),
                "symbol": str(o.symbol),
                "qty": float(o.qty) if o.qty else None,
                "filled_qty": float(o.filled_qty) if o.filled_qty else 0,
                "side": str(o.side).replace("OrderSide.", ""),
                "type": str(o.order_type).replace("OrderType.", ""),
                "status": str(o.status).replace("OrderStatus.", ""),
                "submitted_at": o.submitted_at.isoformat() if o.submitted_at else None,
                "filled_at": o.filled_at.isoformat() if o.filled_at else None,
                "filled_avg_price": float(o.filled_avg_price) if o.filled_avg_price else None,
                "time_in_force": str(o.time_in_force),
            })
        return {"orders": result, "paper": paper}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/backtest")
async def run_backtest(req: BacktestRequest):
    parts = ["python", "backtest_engine.py", req.start_date, req.finish_date,
             req.strategy_name or "SMAcrossover",
             req.symbol or "",
             req.exchange or ""]
    command = " ".join(parts)
    success, message = jesse_mgr.run_command(command, os.getcwd())
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"status": "started", "message": message}

@app.get("/candles/symbols")
def get_candle_symbols():
    try:
        import sqlite3
        db_path = DB_PATH
        if not os.path.exists(db_path):
            return {"symbols": []}
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT symbol, exchange, COUNT(*) as cnt FROM candle GROUP BY symbol, exchange ORDER BY cnt DESC")
        rows = cursor.fetchall()
        conn.close()
        return {"symbols": [{"symbol": r[0], "exchange": r[1], "count": r[2]} for r in rows]}
    except Exception as e:
        return {"symbols": [], "error": str(e)}

@app.post("/optimize")
async def run_optimize(req: OptimizeRequest):
    command = f"python optimize_engine.py {req.start_date} {req.finish_date} {req.optimal_total}"
    success, message = jesse_mgr.run_command(command, os.getcwd())
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"status": "started", "message": message}

@app.post("/live/start")
def start_live(req: LiveRequest):
    # In a real scenario, this would be 'jesse live <exchange> <symbol>'
    # For now, we simulate with a command that outputs periodic logs
    command = f"echo Starting live trading for {req.symbol} on {req.exchange}... && python -c \"import time; [print(f'Signal: BUY {req.symbol} at {100+i}') or time.sleep(2) for i in range(50)]\""
    success, message = jesse_mgr.run_command(command, os.getcwd())
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"status": "started", "message": message}

@app.post("/live/stop")
def stop_live():
    success, message = jesse_mgr.stop_process()
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"status": "stopped", "message": message}

@app.get("/live/metrics")
def get_live_metrics():
    # Mock live metrics
    return {
        "balance": 10250.45,
        "equity": 10285.12,
        "pnl": 34.67,
        "active_positions": [
            {"symbol": "BTC-USDT", "type": "LONG", "entry": 42500, "current": 42650, "pnl": 150.00}
        ]
    }

@app.get("/quant/correlation")
def get_correlation_matrix():
    # Mock correlation data for demonstration
    # In a real app, this would calculate Pearson correlation of returns
    strategies = ["TrendFollowing", "MeanReversion", "HODL", "DCA"]
    matrix = [
        [1.0, -0.2, 0.85, 0.5],
        [-0.2, 1.0, -0.4, 0.1],
        [0.85, -0.4, 1.0, 0.6],
        [0.5, 0.1, 0.6, 1.0]
    ]
    return {"strategies": strategies, "matrix": matrix}

@app.get("/quant/benchmark")
def get_benchmark_data():
    # Mock benchmark comparison vs BTC
    import random
    data = []
    base_price = 10000
    btc_price = 30000
    
    for i in range(30):
        base_price *= (1 + random.uniform(-0.02, 0.03))
        btc_price *= (1 + random.uniform(-0.03, 0.04))
        data.append({
            "date": f"2023-01-{i+1:02d}",
            "strategy": round(base_price, 2),
            "benchmark": round(btc_price, 2)
        })
    return {"data": data}


class BotCreateRequest(BaseModel):
    symbol: str
    exchange: str
    amount: float
    currency: str = "USD"
    strategy: str = "SampleStrategy"
    timeframe: str = "4h"

@app.post("/bots")
def create_bot(req: BotCreateRequest):
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")
    from currency_utils import SUPPORTED_CURRENCIES
    if req.currency not in SUPPORTED_CURRENCIES:
        raise HTTPException(status_code=400, detail=f"Currency must be one of: {', '.join(SUPPORTED_CURRENCIES)}")
    bot = bot_manager.create_bot(req.symbol, req.exchange, req.amount, req.currency, req.strategy, req.timeframe)
    return {"status": "created", "bot": bot.to_dict()}

@app.get("/bots")
def list_bots():
    return {"bots": bot_manager.list_bots(), "active_count": bot_manager.active_count(), "total_count": bot_manager.total_count()}

@app.get("/bots/count")
def bot_count():
    return {"active": bot_manager.active_count(), "total": bot_manager.total_count()}

@app.delete("/bots/{bot_id}")
def delete_bot(bot_id: str):
    success = bot_manager.delete_bot(bot_id)
    if not success:
        raise HTTPException(status_code=404, detail="Bot not found")
    return {"status": "deleted"}

@app.post("/bots/{bot_id}/stop")
def stop_bot(bot_id: str):
    success = bot_manager.stop_bot(bot_id)
    if not success:
        raise HTTPException(status_code=404, detail="Bot not found")
    return {"status": "stopped"}

class BotStrategyUpdate(BaseModel):
    strategy: str

@app.patch("/bots/{bot_id}/strategy")
def update_bot_strategy(bot_id: str, req: BotStrategyUpdate):
    if not req.strategy:
        raise HTTPException(status_code=400, detail="Strategy name required")
    success = bot_manager.update_strategy(bot_id, req.strategy)
    if not success:
        raise HTTPException(status_code=404, detail="Bot not found")
    return {"status": "updated", "bot_id": bot_id, "strategy": req.strategy}

@app.get("/bots/{bot_id}")
def get_bot(bot_id: str):
    bot = bot_manager.get_bot(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    return bot.to_dict()

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.get("/currencies")
def get_currencies():
    from currency_utils import SUPPORTED_CURRENCIES, CURRENCY_SYMBOLS, CURRENCY_TO_USD
    return {
        "currencies": SUPPORTED_CURRENCIES,
        "symbols": CURRENCY_SYMBOLS,
        "rates_to_usd": CURRENCY_TO_USD,
    }

@app.get("/routes")
def get_active_routes():
    try:
        import re
        with open("routes.py", "r") as f:
            content = f.read()
        pattern = r"\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)"
        matches = re.findall(pattern, content)
        routes = [{"exchange": m[0], "pair": m[1], "timeframe": m[2], "strategy": m[3]} for m in matches]
        return {"routes": routes}
    except Exception as e:
        return {"routes": [], "error": str(e)}

@app.get("/candles/stats")
def get_candle_stats():
    try:
        import sqlite3
        db_path = DB_PATH
        if not os.path.exists(db_path):
            return {"count": 0, "estimated": True}
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        total = 0
        for table in tables:
            try:
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                total += cursor.fetchone()[0]
            except Exception:
                pass
        conn.close()
        return {"count": total, "estimated": False}
    except Exception as e:
        return {"count": 0, "estimated": True, "error": str(e)}

@app.get("/dashboard/summary")
def get_dashboard_summary():
    strategies = []
    if os.path.exists(STRATEGIES_DIR):
        strategies = [d for d in os.listdir(STRATEGIES_DIR) if os.path.isdir(os.path.join(STRATEGIES_DIR, d)) and not d.startswith("__")]
    
    try:
        import re
        with open("routes.py", "r") as f:
            content = f.read()
        pattern = r"\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)"
        matches = re.findall(pattern, content)
        routes = [{"exchange": m[0], "pair": m[1], "timeframe": m[2], "strategy": m[3]} for m in matches]
    except Exception:
        routes = []

    logs = jesse_mgr.logs[-30:]
    
    return {
        "strategies": strategies,
        "routes": routes,
        "logs": logs,
        "jesse_running": jesse_mgr.is_running,
    }


# ---------------------------------------------------------------------------
# Fund Transaction Endpoints (Deposit / Withdraw)
# ---------------------------------------------------------------------------

class TransactionRequest(BaseModel):
    type: str
    amount: float
    currency: str = "USD"
    bank_name: str
    account_number: str
    account_name: str
    notes: str = ""

class OTPVerifyRequest(BaseModel):
    transaction_id: str
    otp: str

@app.get("/transactions")
def get_transactions():
    txs = list_transactions(limit=200)
    summary = get_transaction_summary()
    return {"transactions": txs, "summary": summary}

@app.post("/transactions/deposit")
def make_deposit(req: TransactionRequest):
    if req.amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    if not req.bank_name.strip():
        raise HTTPException(400, "Bank name is required")
    if not req.account_number.strip():
        raise HTTPException(400, "Account number is required")
    if not req.account_name.strip():
        raise HTTPException(400, "Account name is required")
    tx = create_transaction(
        tx_type="deposit",
        amount=req.amount,
        currency=req.currency,
        bank_name=req.bank_name,
        account_number=req.account_number,
        account_name=req.account_name,
        notes=req.notes,
    )
    return tx

@app.post("/transactions/withdraw")
def make_withdraw(req: TransactionRequest):
    if req.amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    if not req.bank_name.strip():
        raise HTTPException(400, "Bank name is required")
    if not req.account_number.strip():
        raise HTTPException(400, "Account number is required")
    if not req.account_name.strip():
        raise HTTPException(400, "Account name is required")
    tx = create_transaction(
        tx_type="withdraw",
        amount=req.amount,
        currency=req.currency,
        bank_name=req.bank_name,
        account_number=req.account_number,
        account_name=req.account_name,
        notes=req.notes,
    )
    return tx

@app.post("/transactions/verify-otp")
def confirm_otp(req: OTPVerifyRequest):
    result = verify_otp(req.transaction_id, req.otp)
    if not result["ok"]:
        raise HTTPException(400, result["error"])
    return result
