import threading
import time
import uuid
import random
import os
from datetime import datetime
from typing import Dict, List
from strategy_engine import get_signals_streaming

ALPACA_API_KEY = os.environ.get("ALPACA_API_KEY", "")
ALPACA_SECRET_KEY = os.environ.get("ALPACA_SECRET_KEY", "")

from currency_utils import CURRENCY_SYMBOLS, CURRENCY_TO_USD, SUPPORTED_CURRENCIES


class TradingBot:
    def __init__(self, bot_id: str, symbol: str, exchange: str, amount: float, currency: str, strategy: str = "SampleStrategy", timeframe: str = "4h"):
        self.id = bot_id
        self.symbol = symbol
        self.exchange = exchange
        self.currency = currency
        self.strategy = strategy
        self.timeframe = timeframe
        self.amount_native = amount
        self.amount_usd = amount * CURRENCY_TO_USD.get(currency, 1.0)

        self.is_running = False
        self.logs: List[str] = []
        self.created_at = datetime.utcnow().isoformat()
        self.start_time = time.time()

        self.balance_usd = self.amount_usd
        self.equity_usd = self.amount_usd
        self.pnl_usd = 0.0
        self.position = None
        self.position_entry = 0.0
        self.position_size = 0.0
        self.trades_count = 0
        self.wins = 0

        self._thread: threading.Thread = None
        self._stop_event = threading.Event()

        self._price_history: List[float] = []
        self._base_price = self._seed_price(symbol)
        self._stop_price = 0.0
        self._tp_price = 0.0
        self._equity_snapshots: List[dict] = []
        self._completed_trades: List[dict] = []
        self._snapshot_interval = 5   # record equity every N ticks

    def _seed_price(self, symbol: str) -> float:
        seeds = {
            "BTC": 65000, "ETH": 3500, "BNB": 600, "SOL": 180,
            "ADA": 0.45, "XRP": 0.60, "DOGE": 0.15, "AAPL": 185,
            "TSLA": 175, "SPY": 520, "GOLD": 2350,
        }
        upper = symbol.upper().replace("-USDT", "").replace("-USD", "").replace("-PERP", "")
        return seeds.get(upper, 100.0)

    def _simulate_price(self) -> float:
        if not self._price_history:
            price = self._base_price * (1 + random.gauss(0, 0.001))
        else:
            last = self._price_history[-1]
            drift = random.gauss(0.00005, 0.002)
            price = last * (1 + drift)
        self._price_history.append(price)
        if len(self._price_history) > 300:
            self._price_history.pop(0)
        return price

    def _sma(self, period: int) -> float:
        if len(self._price_history) < period:
            return self._price_history[-1] if self._price_history else self._base_price
        return sum(self._price_history[-period:]) / period

    # ── Alpaca helpers ─────────────────────────────────────────────────────────

    @property
    def _is_alpaca(self) -> bool:
        return self.exchange.lower().startswith("alpaca")

    @property
    def _alpaca_paper(self) -> bool:
        return "paper" in self.exchange.lower()

    def _alpaca_symbol(self) -> str:
        """Convert BTC-USD → BTC/USD for Alpaca crypto; stocks stay as-is."""
        s = self.symbol.upper()
        if "-USDT" in s:
            return s.replace("-USDT", "/USDT")
        if "-USD" in s:
            return s.replace("-USD", "/USD")
        return s

    def _is_crypto_symbol(self) -> bool:
        s = self.symbol.upper()
        return "-USD" in s or "-USDT" in s or "/" in s

    def _alpaca_clients(self):
        """Return (trading_client, stock_data_client, crypto_data_client) or (None,None,None)."""
        if not ALPACA_API_KEY or not ALPACA_SECRET_KEY:
            return None, None, None
        try:
            from alpaca.trading.client import TradingClient
            from alpaca.data.historical import StockHistoricalDataClient, CryptoHistoricalDataClient
            paper = self._alpaca_paper
            tc = TradingClient(ALPACA_API_KEY, ALPACA_SECRET_KEY, paper=paper)
            sc = StockHistoricalDataClient(ALPACA_API_KEY, ALPACA_SECRET_KEY)
            cc = CryptoHistoricalDataClient(ALPACA_API_KEY, ALPACA_SECRET_KEY)
            return tc, sc, cc
        except Exception as e:
            self._log(f"[ALPACA] Client init error: {e}")
            return None, None, None

    def _alpaca_price(self, sc, cc) -> float | None:
        """Fetch the latest mid-price from Alpaca."""
        sym = self._alpaca_symbol()
        try:
            if self._is_crypto_symbol():
                from alpaca.data.requests import CryptoLatestBarRequest
                bars = cc.get_crypto_latest_bar(CryptoLatestBarRequest(symbol_or_symbols=[sym]))
                bar = bars.get(sym)
                return float(bar.close) if bar else None
            else:
                from alpaca.data.requests import StockLatestQuoteRequest
                quotes = sc.get_stock_latest_quote(StockLatestQuoteRequest(symbol_or_symbols=[sym]))
                q = quotes.get(sym)
                if q and q.ask_price and q.bid_price:
                    return float((q.ask_price + q.bid_price) / 2)
        except Exception as e:
            self._log(f"[ALPACA] Price fetch error: {e}")
        return None

    def _alpaca_place_order(self, tc, side: str, qty: float):
        """Place a market order on Alpaca and return the order or None."""
        try:
            from alpaca.trading.requests import MarketOrderRequest
            from alpaca.trading.enums import OrderSide, TimeInForce
            req = MarketOrderRequest(
                symbol=self._alpaca_symbol(),
                qty=round(qty, 6),
                side=OrderSide.BUY if side == "BUY" else OrderSide.SELL,
                time_in_force=TimeInForce.GTC,
            )
            return tc.submit_order(req)
        except Exception as e:
            self._log(f"[ALPACA] Order error ({side} {qty}): {e}")
            return None

    def _alpaca_close_position(self, tc):
        """Close the current position on Alpaca."""
        try:
            tc.close_position(self._alpaca_symbol())
        except Exception as e:
            self._log(f"[ALPACA] Close position error: {e}")

    def _alpaca_sync_account(self, tc):
        """Sync balance/equity from Alpaca account."""
        try:
            acct = tc.get_account()
            self.balance_usd = float(acct.cash)
            self.equity_usd = float(acct.equity)
            self.pnl_usd = self.equity_usd - self.amount_usd
        except Exception:
            pass

    # ──────────────────────────────────────────────────────────────────────────

    def _log(self, msg: str):
        ts = datetime.utcnow().strftime("%H:%M:%S")
        entry = f"[{ts}] {msg}"
        self.logs.append(entry)
        if len(self.logs) > 500:
            self.logs.pop(0)

    def _run_loop(self):
        sym = self.currency_symbol
        self._log(f"Bot started | Symbol: {self.symbol} | Capital: {sym}{self.amount_native:,.2f} ({self.currency})")
        self._log(f"Strategy: {self.strategy} | Timeframe: {self.timeframe} | Exchange: {self.exchange}")

        FEE_RATE = 0.001
        ATR_STOP = 2.5
        ATR_TP = 3.2
        RISK_PCT = 3.0
        warmup = 80

        # Set up Alpaca clients once if this is an Alpaca exchange
        _tc, _sc, _cc = (None, None, None)
        if self._is_alpaca:
            _tc, _sc, _cc = self._alpaca_clients()
            if not _tc:
                self._log("[ALPACA] ERROR: Could not connect — check ALPACA_API_KEY / ALPACA_SECRET_KEY")
                self.is_running = False
                return
            mode_label = "PAPER" if self._alpaca_paper else "LIVE"
            self._log(f"[ALPACA {mode_label}] Connected ✓ — real orders will be placed on Alpaca")
            self._alpaca_sync_account(_tc)
            self._log(f"[ALPACA] Account equity: ${self.equity_usd:,.2f} | Cash: ${self.balance_usd:,.2f}")

        tick_interval = 10 if self._is_alpaca else 3

        while not self._stop_event.is_set():
            if self._is_alpaca:
                price = self._alpaca_price(_sc, _cc)
                if price is None:
                    self._log("[ALPACA] Could not fetch price — retrying in 10s")
                    time.sleep(10)
                    continue
                self._price_history.append(price)
                if len(self._price_history) > 300:
                    self._price_history.pop(0)
            else:
                price = self._simulate_price()

            if len(self._price_history) < warmup:
                if self._is_alpaca:
                    self._log(f"[ALPACA] Warming up… {len(self._price_history)}/{warmup} bars collected")
                time.sleep(tick_interval)
                continue

            signals = get_signals_streaming(self.strategy, self._price_history)
            want_long = signals.get("long", False)
            want_short = signals.get("short", False)
            cur_atr = signals.get("atr", price * 0.01)
            trend = signals.get("trend", "neutral")

            if cur_atr == 0:
                cur_atr = price * 0.01

            if self.position is None and self.balance_usd > 0:
                if want_long:
                    stop = price - ATR_STOP * cur_atr
                    qty = (self.balance_usd * RISK_PCT / 100) / abs(price - stop) if abs(price - stop) > 0 else 0
                    if qty > 0:
                        order_id_str = ""
                        if self._is_alpaca:
                            order = self._alpaca_place_order(_tc, "BUY", qty)
                            if order:
                                order_id_str = f" | OrderID={str(order.id)[:8]}"
                            else:
                                time.sleep(tick_interval)
                                continue
                        else:
                            fee = qty * price * FEE_RATE
                            self.balance_usd -= fee
                        self.position = "LONG"
                        self.position_entry = price
                        self.position_size = qty
                        self._stop_price = stop
                        self._tp_price = price + ATR_TP * cur_atr
                        self._log(
                            f"LONG  {self.symbol} @ ${price:,.4f} | "
                            f"SL=${stop:,.4f} TP=${self._tp_price:,.4f} | "
                            f"Trend={trend} ADX={signals.get('adx', 0):.1f} | [{self.strategy}]{order_id_str}"
                        )

                elif want_short:
                    stop = price + ATR_STOP * cur_atr
                    qty = (self.balance_usd * RISK_PCT / 100) / abs(stop - price) if abs(stop - price) > 0 else 0
                    if qty > 0:
                        order_id_str = ""
                        if self._is_alpaca:
                            order = self._alpaca_place_order(_tc, "SELL", qty)
                            if order:
                                order_id_str = f" | OrderID={str(order.id)[:8]}"
                            else:
                                time.sleep(tick_interval)
                                continue
                        else:
                            fee = qty * price * FEE_RATE
                            self.balance_usd -= fee
                        self.position = "SHORT"
                        self.position_entry = price
                        self.position_size = qty
                        self._stop_price = stop
                        self._tp_price = price - ATR_TP * cur_atr
                        self._log(
                            f"SHORT {self.symbol} @ ${price:,.4f} | "
                            f"SL=${stop:,.4f} TP=${self._tp_price:,.4f} | "
                            f"Trend={trend} ADX={signals.get('adx', 0):.1f} | [{self.strategy}]{order_id_str}"
                        )

            elif self.position == "LONG":
                hit_stop = price <= self._stop_price
                hit_tp = price >= self._tp_price
                if hit_stop or hit_tp:
                    exit_price = self._stop_price if hit_stop else self._tp_price
                    if self._is_alpaca:
                        self._alpaca_close_position(_tc)
                    fee = self.position_size * exit_price * FEE_RATE
                    pnl = (exit_price - self.position_entry) * self.position_size - fee
                    if not self._is_alpaca:
                        self.balance_usd += self.position_entry * self.position_size + pnl
                    self.trades_count += 1
                    if pnl > 0:
                        self.wins += 1
                    reason = "STOP" if hit_stop else "TP"
                    self._log(
                        f"EXIT-{reason} LONG {self.symbol} @ ${exit_price:,.4f} | "
                        f"P&L: {'+'if pnl>=0 else ''}{pnl:.4f} USD | Trade #{self.trades_count}"
                    )
                    self._completed_trades.append({
                        "id": self.trades_count,
                        "side": "LONG",
                        "entry": round(self.position_entry, 4),
                        "exit": round(exit_price, 4),
                        "qty": round(self.position_size, 6),
                        "pnl": round(pnl, 4),
                        "reason": reason,
                        "time": datetime.utcnow().strftime("%H:%M:%S"),
                    })
                    self.position = None
                    self.position_entry = 0.0
                    self.position_size = 0.0

            elif self.position == "SHORT":
                hit_stop = price >= self._stop_price
                hit_tp = price <= self._tp_price
                if hit_stop or hit_tp:
                    exit_price = self._stop_price if hit_stop else self._tp_price
                    if self._is_alpaca:
                        self._alpaca_close_position(_tc)
                    fee = self.position_size * exit_price * FEE_RATE
                    pnl = (self.position_entry - exit_price) * self.position_size - fee
                    if not self._is_alpaca:
                        self.balance_usd += self.position_entry * self.position_size + pnl
                    self.trades_count += 1
                    if pnl > 0:
                        self.wins += 1
                    reason = "STOP" if hit_stop else "TP"
                    self._log(
                        f"EXIT-{reason} SHORT {self.symbol} @ ${exit_price:,.4f} | "
                        f"P&L: {'+'if pnl>=0 else ''}{pnl:.4f} USD | Trade #{self.trades_count}"
                    )
                    self._completed_trades.append({
                        "id": self.trades_count,
                        "side": "SHORT",
                        "entry": round(self.position_entry, 4),
                        "exit": round(exit_price, 4),
                        "qty": round(self.position_size, 6),
                        "pnl": round(pnl, 4),
                        "reason": reason,
                        "time": datetime.utcnow().strftime("%H:%M:%S"),
                    })
                    self.position = None
                    self.position_entry = 0.0
                    self.position_size = 0.0

            # Sync equity — use real Alpaca account data when on Alpaca exchange
            if self._is_alpaca:
                self._alpaca_sync_account(_tc)
            elif self.position == "LONG":
                self.equity_usd = self.balance_usd + self.position_size * price
            elif self.position == "SHORT":
                self.equity_usd = self.balance_usd + self.position_size * (2 * self.position_entry - price)
            else:
                self.equity_usd = self.balance_usd

            self.pnl_usd = self.equity_usd - self.amount_usd

            # record equity snapshot every N ticks
            _tick_count = len(self._price_history)
            if _tick_count % self._snapshot_interval == 0:
                self._equity_snapshots.append({
                    "t": _tick_count,
                    "equity": round(self.equity_usd, 2),
                    "price": round(price, 4),
                })
                # cap snapshots to avoid unbounded growth
                if len(self._equity_snapshots) > 500:
                    self._equity_snapshots = self._equity_snapshots[-500:]

            time.sleep(tick_interval)

        self._log(f"Bot stopped | Final equity: ${self.equity_usd:,.2f} | P&L: {'+'if self.pnl_usd>=0 else ''}{self.pnl_usd:.2f} USD")
        self.is_running = False
        self._save_to_history()

    def _save_to_history(self):
        if self.trades_count == 0:
            return
        try:
            from trade_history import save_session
            from datetime import datetime as _dt
            session_type = "live" if self.exchange.lower() == "alpaca live" else (
                "paper" if "paper" in self.exchange.lower() else "live"
            )
            win_rate = round(self.wins / self.trades_count, 4) if self.trades_count > 0 else 0.0
            metrics = {
                "net_profit_val": round(self.pnl_usd, 2),
                "net_profit": round((self.pnl_usd / self.amount_usd) * 100, 4) if self.amount_usd > 0 else 0.0,
                "win_rate": win_rate,
                "total_trades": self.trades_count,
                "winning_trades": self.wins,
                "losing_trades": self.trades_count - self.wins,
                "initial_capital": self.amount_usd,
                "final_equity": self.equity_usd,
                "longs_count": 0,
                "shorts_count": 0,
                "fee": 0.0,
            }
            eq_curve = [{"equity": s["equity"], "timestamp": s["t"]} for s in self._equity_snapshots]
            save_session(
                session_type=session_type,
                strategy=self.strategy,
                symbol=self.symbol,
                exchange=self.exchange,
                timeframe=self.timeframe,
                start_date=self.created_at[:10],
                end_date=_dt.utcnow().isoformat()[:10],
                metrics=metrics,
                equity_curve=eq_curve,
                notes=f"Live bot session — runtime {int(self.runtime)}s | {len(self._completed_trades)} trades tracked",
                currency=self.currency,
            )
        except Exception as e:
            self._log(f"[HISTORY] Could not save session: {e}")

    def start(self):
        self.is_running = True
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop_event.set()
        self.is_running = False

    @property
    def currency_symbol(self) -> str:
        return CURRENCY_SYMBOLS.get(self.currency, "$")

    @property
    def runtime(self) -> float:
        return round(time.time() - self.start_time, 1)

    def to_dict(self) -> dict:
        rate = 1.0 / CURRENCY_TO_USD.get(self.currency, 1.0)
        equity_native = self.equity_usd * rate
        pnl_native = self.pnl_usd * rate
        sym = self.currency_symbol
        win_rate = round(self.wins / self.trades_count, 4) if self.trades_count > 0 else 0.0
        return {
            "id": self.id,
            "symbol": self.symbol,
            "exchange": self.exchange,
            "strategy": self.strategy,
            "timeframe": self.timeframe,
            "currency": self.currency,
            "currency_symbol": sym,
            "amount_native": self.amount_native,
            "is_running": self.is_running,
            "created_at": self.created_at,
            "runtime": self.runtime,
            "balance_usd": round(self.balance_usd, 4),
            "equity_usd": round(self.equity_usd, 4),
            "equity_native": round(equity_native, 2),
            "pnl_usd": round(self.pnl_usd, 4),
            "pnl_native": round(pnl_native, 2),
            "pnl_pct": round((self.pnl_usd / self.amount_usd) * 100, 4) if self.amount_usd > 0 else 0.0,
            "position": self.position,
            "position_entry": round(self.position_entry, 4),
            "trades_count": self.trades_count,
            "win_rate": win_rate,
            "logs": self.logs[-30:],
            "equity_snapshots": self._equity_snapshots[-100:],
            "completed_trades": self._completed_trades[-50:],
        }


class BotManager:
    def __init__(self):
        self._bots: Dict[str, TradingBot] = {}
        self._lock = threading.Lock()

    def create_bot(self, symbol: str, exchange: str, amount: float, currency: str, strategy: str = "SampleStrategy", timeframe: str = "4h") -> TradingBot:
        bot_id = str(uuid.uuid4())[:8]
        bot = TradingBot(bot_id, symbol, exchange, amount, currency, strategy, timeframe)
        with self._lock:
            self._bots[bot_id] = bot
        bot.start()
        return bot

    def stop_bot(self, bot_id: str) -> bool:
        with self._lock:
            bot = self._bots.get(bot_id)
        if not bot:
            return False
        bot.stop()
        return True

    def delete_bot(self, bot_id: str) -> bool:
        with self._lock:
            bot = self._bots.pop(bot_id, None)
        if not bot:
            return False
        bot.stop()
        return True

    def get_bot(self, bot_id: str):
        with self._lock:
            return self._bots.get(bot_id)

    def list_bots(self) -> List[dict]:
        with self._lock:
            return [b.to_dict() for b in self._bots.values()]

    def update_strategy(self, bot_id: str, new_strategy: str) -> bool:
        with self._lock:
            bot = self._bots.get(bot_id)
        if not bot:
            return False
        old = bot.strategy
        bot.strategy = new_strategy
        bot._log(f"[STRATEGY SWITCH] {old} → {new_strategy} (takes effect next tick)")
        return True

    def active_count(self) -> int:
        with self._lock:
            return sum(1 for b in self._bots.values() if b.is_running)

    def total_count(self) -> int:
        with self._lock:
            return len(self._bots)


bot_manager = BotManager()
