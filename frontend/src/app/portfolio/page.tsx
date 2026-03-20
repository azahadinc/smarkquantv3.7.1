"use client";

import { useState, useEffect, useRef } from "react";
import {
  TrendingUp, TrendingDown, DollarSign, BarChart2, Activity,
  Shield, Briefcase, ArrowUpRight, ArrowDownRight,
  Clock, Zap, Globe, Award, PieChart, Database, RefreshCw,
  Wallet, ArrowDownToLine, ArrowUpFromLine, X, CheckCircle2,
  Building2, CreditCard, User, Hash, AlertCircle, Copy, Check
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RePieChart, Pie, Cell, Legend, LineChart, Line
} from "recharts";

// ── constants ──────────────────────────────────────────────────────────────
const BASE_EQUITY = 0;
const ALLOCATION_COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#ef4444", "#06b6d4"];

// ── currency conversion (mirrors backend/currency_utils.py) ────────────────
const CURRENCY_TO_USD: Record<string, number> = {
  USD: 1.0, NGN: 0.000645, EUR: 1.09, GBP: 1.27, CNY: 0.138,
  JPY: 0.0066, CAD: 0.74, AUD: 0.65, CHF: 1.13, ZAR: 0.054,
};
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", NGN: "₦", EUR: "€", GBP: "£", CNY: "¥",
  JPY: "¥", CAD: "C$", AUD: "A$", CHF: "Fr", ZAR: "R",
};
function toUsd(amount: number, currency?: string): number {
  const rate = CURRENCY_TO_USD[(currency ?? "USD").toUpperCase()] ?? 1.0;
  return amount * rate;
}
function currSym(currency?: string): string {
  return CURRENCY_SYMBOLS[(currency ?? "USD").toUpperCase()] ?? "$";
}
function fmtNative(amount: number, currency?: string): string {
  const sym = currSym(currency);
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return sym + fmt(abs / 1_000_000, 2) + "M";
  if (abs >= 1_000) return sym + fmt(abs / 1_000, 2) + "K";
  return sym + fmt(abs, 2);
}

// ── helpers ────────────────────────────────────────────────────────────────
function fmt(n: number, d = 2) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
}
function fmtC(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-$" : "$";
  if (abs >= 1e15) return sign + fmt(abs / 1e15, 2) + "Q";
  if (abs >= 1e12) return sign + fmt(abs / 1e12, 2) + "T";
  if (abs >= 1e9)  return sign + fmt(abs / 1e9,  2) + "B";
  if (abs >= 1e6)  return sign + fmt(abs / 1e6,  2) + "M";
  if (abs >= 1e3)  return sign + fmt(abs / 1e3,  1) + "K";
  return sign + fmt(abs, 2);
}
function fmtFull(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-$" : "$";
  if (abs >= 1e15) return sign + fmt(abs / 1e15, 3) + "Q";
  if (abs >= 1e12) return sign + fmt(abs / 1e12, 3) + "T";
  if (abs >= 1e9)  return sign + fmt(abs / 1e9,  3) + "B";
  if (abs >= 1e6)  return sign + fmt(abs / 1e6,  3) + "M";
  return sign + new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(abs);
}

// ── animated ticker ────────────────────────────────────────────────────────
function AnimatedNumber({ value }: { value: number }) {
  const [disp, setDisp] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const start = prev.current, end = value, diff = end - start, steps = 40;
    let s = 0;
    const id = setInterval(() => {
      s++;
      setDisp(start + diff * (s / steps));
      if (s >= steps) { clearInterval(id); prev.current = end; }
    }, 16);
    return () => clearInterval(id);
  }, [value]);
  return <>{fmtFull(disp)}</>;
}

// ── types ──────────────────────────────────────────────────────────────────
type Session = {
  id: string; session_type: string; strategy: string; symbol: string;
  exchange: string; timeframe: string; start_date: string; end_date: string;
  created_at: string; notes: string; currency: string;
  pnl_value: number; pnl_pct: number; win_rate: number;
  sharpe_ratio: number; smart_sharpe: number; sortino_ratio: number;
  smart_sortino: number; calmar_ratio: number; omega_ratio: number;
  serenity_index: number; avg_win: number; avg_loss: number;
  total_losing_streak: number; largest_losing_trade: number;
  largest_winning_trade: number; total_winning_streak: number;
  expectancy: number; gross_profit: number; gross_loss: number;
  max_drawdown: number; total_trades: number; total_winning_trades: number;
  total_losing_trades: number; starting_balance: number; finishing_balance: number;
  longs_count: number; longs_percentage: number; shorts_count: number;
  shorts_percentage: number; fee: number; open_pl: number;
  equity_curve: number[] | null;
};

type StratRow = {
  name: string; sessions: number; pnl: number; trades: number;
  wins: number; losses: number; winRate: number;
  sharpe: number; sortino: number; maxDd: number; symbols: string[];
};

type AlpacaAccount = {
  equity: number; cash: number; buying_power: number;
  portfolio_value: number; status: string;
  long_market_value: number; short_market_value: number;
};

// ── custom tooltip ──────────────────────────────────────────────────────────
function ChartTip({ active, payload, label, moneyKey }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-xs">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">
          {p.name}: {moneyKey?.includes(p.dataKey) ? fmtC(p.value) : typeof p.value === "number" ? `${p.value > 0 ? "+" : ""}${fmt(p.value, 2)}%` : p.value}
        </p>
      ))}
    </div>
  );
}

// ── downsampler ─────────────────────────────────────────────────────────────
function downsample(arr: number[], target = 100) {
  if (arr.length <= target) return arr;
  const step = arr.length / target;
  return Array.from({ length: target }, (_, i) => arr[Math.floor(i * step)]);
}

// ═══════════════════════════════════════════════════════════════════════════
export default function PortfolioPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [alpaca, setAlpaca] = useState<AlpacaAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "strategies" | "risk" | "trades" | "wallet">("overview");
  const [equity, setEquity] = useState(BASE_EQUITY);

  // ── wallet state ─────────────────────────────────────────────────────────
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txSummary, setTxSummary] = useState<any>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [txForm, setTxForm] = useState({ bank_name: "", account_number: "", account_name: "", amount: "", currency: "USD" });
  const [txPending, setTxPending] = useState<any>(null);
  const [otpInput, setOtpInput] = useState("");
  const [txSubmitting, setTxSubmitting] = useState(false);
  const [txError, setTxError] = useState("");
  const [otpCopied, setOtpCopied] = useState(false);

  const fetchTransactions = () => {
    setTxLoading(true);
    fetch("/api/transactions").then(r => r.json()).then(d => {
      setTransactions(d.transactions || []);
      setTxSummary(d.summary || null);
    }).catch(() => {}).finally(() => setTxLoading(false));
  };
  const [dayPnl, setDayPnl] = useState(0);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [activeBots, setActiveBots] = useState(0);
  const [totalBots, setTotalBots] = useState(0);
  const [liveMode, setLiveMode] = useState(false);
  const dayPnlRef = useRef(0);

  // ── fetch real data ──────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch("/api/history").then(r => r.json()).catch(() => ({ sessions: [] })),
      fetch("/api/alpaca/account?paper=true").then(r => r.json()).catch(() => null),
    ]).then(([hist, acc]) => {
      const s: Session[] = hist.sessions || [];
      setSessions(s);
      if (acc && !acc.detail) setAlpaca(acc);

      // compute real total assets ONLY from live/paper sessions — backtests
      // reuse the same simulated capital across many runs so summing them
      // inflates the figure massively. Live sessions represent real money.
      const livePaper = s.filter(x => x.session_type === "live" || x.session_type === "paper");
      const realTotalAssets = livePaper.reduce((sum, x) => {
        const cur = x.currency || "USD";
        const finishing = x.finishing_balance || 0;
        if (finishing > 0) return sum + toUsd(finishing, cur);
        return sum + toUsd((x.starting_balance || 0) + (x.pnl_value || 0), cur);
      }, 0);
      if (realTotalAssets > 0) setEquity(realTotalAssets);

      // seed day pnl from REAL today's sessions only — converted to USD
      const today = new Date().toISOString().slice(0, 10);
      const todayPnl = s
        .filter(x => x.created_at?.startsWith(today))
        .reduce((sum, x) => sum + toUsd(x.pnl_value || 0, x.currency), 0);
      dayPnlRef.current = todayPnl;
      setDayPnl(todayPnl);
      setLoading(false);
    });
  }, []);

  // ── fetch transactions when wallet tab is opened ─────────────────────────
  useEffect(() => { if (tab === "wallet") fetchTransactions(); }, [tab]);

  // ── poll bot status every 5s ─────────────────────────────────────────────
  useEffect(() => {
    const poll = () =>
      fetch("/api/bots")
        .then(r => r.json())
        .then(d => {
          setActiveBots(d.active_count ?? 0);
          setTotalBots(d.total_count ?? 0);
        })
        .catch(() => {});
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  // ── live equity ticker — ONLY fires when bots are actively running ────────
  useEffect(() => {
    if (activeBots === 0) return;           // freeze when no bots are running
    const id = setInterval(() => {
      const tick = (Math.random() - 0.35) * 1_000;
      setEquity(prev => Math.max(prev + tick, prev * 0.99));
      dayPnlRef.current += tick;
      setDayPnl(dayPnlRef.current);
      setLastUpdate(new Date());
    }, 1800);
    return () => clearInterval(id);
  }, [activeBots]);

  // ── derived metrics from real sessions ──────────────────────────────────
  const backtests = sessions.filter(s => s.session_type === "backtest");
  const liveSessions = sessions.filter(s => s.session_type === "live" || s.session_type === "paper");

  const totalPnl = sessions.reduce((s, x) => s + toUsd(x.pnl_value || 0, x.currency), 0);
  const totalTrades = sessions.reduce((s, x) => s + (x.total_trades || 0), 0);
  const totalWins = sessions.reduce((s, x) => s + (x.total_winning_trades || 0), 0);
  const totalLosses = sessions.reduce((s, x) => s + (x.total_losing_trades || 0), 0);
  const totalFees = sessions.reduce((s, x) => s + toUsd(x.fee || 0, x.currency), 0);
  const totalGrossProfit = sessions.reduce((s, x) => s + toUsd(x.gross_profit || 0, x.currency), 0);
  const totalGrossLoss = sessions.reduce((s, x) => s + toUsd(x.gross_loss || 0, x.currency), 0);
  const profitSessions = sessions.filter(s => s.pnl_value > 0).length;
  const sessionWinRate = sessions.length ? (profitSessions / sessions.length) * 100 : 0;
  const sharpes = sessions.filter(s => s.sharpe_ratio).map(s => s.sharpe_ratio);
  const sortinos = sessions.filter(s => s.sortino_ratio).map(s => s.sortino_ratio);
  const calmars = sessions.filter(s => s.calmar_ratio).map(s => s.calmar_ratio);
  const omegas = sessions.filter(s => s.omega_ratio).map(s => s.omega_ratio);
  const drawdowns = sessions.filter(s => s.max_drawdown).map(s => s.max_drawdown);
  const winRates = sessions.filter(s => s.win_rate).map(s => s.win_rate);
  const avgSharpe = sharpes.length ? sharpes.reduce((a, b) => a + b) / sharpes.length : 0;
  const avgSortino = sortinos.length ? sortinos.reduce((a, b) => a + b) / sortinos.length : 0;
  const avgCalmar = calmars.length ? calmars.reduce((a, b) => a + b) / calmars.length : 0;
  const avgOmega = omegas.length ? omegas.reduce((a, b) => a + b) / omegas.length : 0;
  const worstDd = drawdowns.length ? Math.max(...drawdowns) : 0;
  const avgWinRate = winRates.length ? winRates.reduce((a, b) => a + b) / winRates.length : 0;
  const bestSession = [...sessions].sort((a, b) => b.pnl_value - a.pnl_value)[0];
  const worstSession = [...sessions].sort((a, b) => a.pnl_value - b.pnl_value)[0];
  const largestWin = Math.max(...sessions.map(s => s.largest_winning_trade || 0));
  const largestLoss = Math.min(...sessions.map(s => -(s.largest_losing_trade || 0)));
  const avgExpectancy = sessions.filter(s => s.expectancy).reduce((s, x) => s + x.expectancy, 0) / (sessions.filter(s => s.expectancy).length || 1);

  // ── strategy breakdown ───────────────────────────────────────────────────
  const stratMap = new Map<string, StratRow>();
  for (const s of sessions) {
    const key = s.strategy || "Unknown";
    if (!stratMap.has(key)) stratMap.set(key, { name: key, sessions: 0, pnl: 0, trades: 0, wins: 0, losses: 0, winRate: 0, sharpe: 0, sortino: 0, maxDd: 0, symbols: [] });
    const r = stratMap.get(key)!;
    r.sessions++;
    r.pnl += s.pnl_value || 0;
    r.trades += s.total_trades || 0;
    r.wins += s.total_winning_trades || 0;
    r.losses += s.total_losing_trades || 0;
    if (s.sharpe_ratio) r.sharpe = (r.sharpe * (r.sessions - 1) + s.sharpe_ratio) / r.sessions;
    if (s.sortino_ratio) r.sortino = (r.sortino * (r.sessions - 1) + s.sortino_ratio) / r.sessions;
    if (s.max_drawdown && s.max_drawdown > r.maxDd) r.maxDd = s.max_drawdown;
    if (s.symbol && !r.symbols.includes(s.symbol)) r.symbols.push(s.symbol);
  }
  for (const r of stratMap.values()) {
    r.winRate = r.trades ? (r.wins / r.trades) * 100 : 0;
    r.symbols = r.symbols.filter(Boolean).slice(0, 3);
  }
  const strategies = [...stratMap.values()].sort((a, b) => b.pnl - a.pnl);

  // ── equity curve from best backtest session ──────────────────────────────
  const bestCurveSession = backtests.find(s => s.equity_curve && s.equity_curve.length > 10);
  const rawCurve = bestCurveSession?.equity_curve || [];
  const sampledCurve = downsample(rawCurve, 120).map((v, i) => ({
    i: `${i + 1}`,
    equity: Math.round(v),
    scaled: Math.round(BASE_EQUITY * (v / (rawCurve[rawCurve.length - 1] || 1))),
  }));

  // ── cumulative PnL curve from sessions sorted by date ───────────────────
  const sortedSessions = [...sessions].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  let cumPnl = 0;
  const cumCurve = sortedSessions.map((s, i) => {
    cumPnl += s.pnl_value || 0;
    return { label: `#${i + 1}`, cumPnl: Math.round(cumPnl), pnl: Math.round(s.pnl_value || 0), strategy: s.strategy };
  });

  // ── per-session drawdown chart (from sessions that have max_drawdown) ────
  const ddChart = backtests.filter(s => s.max_drawdown).slice(0, 30).map((s, i) => ({
    label: `#${i + 1}`,
    dd: -Math.abs(s.max_drawdown),
    strategy: s.strategy,
  }));

  // ── sessions sorted as "recent trades" ──────────────────────────────────
  const recentSessions = [...sessions]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 15);

  // ── allocation from strategies ───────────────────────────────────────────
  const totalAbsPnl = strategies.reduce((s, x) => s + Math.abs(x.pnl), 0) || 1;
  const allocData = strategies
    .filter(s => s.pnl !== 0 || s.trades > 0)
    .slice(0, 6)
    .map(s => ({ name: s.name.slice(0, 18), value: Math.round((Math.abs(s.pnl) / totalAbsPnl) * 100) || Math.round((s.trades / totalTrades) * 100) }));

  // separate simulated (backtest) vs real (live/paper) PnL
  const backtestPnl = backtests.reduce((s, x) => s + toUsd(x.pnl_value || 0, x.currency), 0);
  const livePaperPnl = liveSessions.reduce((s, x) => s + toUsd(x.pnl_value || 0, x.currency), 0);

  const dayPnlPct = equity > 0 ? (dayPnl / (equity - dayPnl)) * 100 : 0;
  // use Alpaca account data when available, otherwise derive from equity
  const availableCash = alpaca?.cash ?? (equity * 0.15);
  const buyingPower = alpaca?.buying_power ?? (equity * 0.60);
  const marginUsed = alpaca ? (alpaca.long_market_value + alpaca.short_market_value) : (equity * 0.25);

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center">
        <RefreshCw className="text-amber-400 animate-spin mx-auto mb-3" size={32} />
        <p className="text-slate-400">Loading portfolio data…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Live ticker */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-2 flex items-center gap-6 text-xs overflow-hidden whitespace-nowrap">
        {[
          { sym: "BTC", val: 67_441.22, chg: 2.14 }, { sym: "ETH", val: 3_812.55, chg: 1.88 },
          { sym: "AAPL", val: 224.33, chg: -0.42 }, { sym: "NVDA", val: 875.20, chg: 4.31 },
          { sym: "SPY", val: 534.81, chg: 0.67 }, { sym: "EUR/USD", val: 1.0841, chg: 0.12 },
          { sym: "GOLD", val: 2_334.40, chg: 0.88 }, { sym: "SOL", val: 148.22, chg: 3.21 },
        ].map(t => (
          <span key={t.sym} className="flex items-center gap-1">
            <span className="text-slate-400">{t.sym}</span>
            <span className="font-mono">${fmt(t.val, t.val > 100 ? 2 : 4)}</span>
            <span className={t.chg >= 0 ? "text-emerald-400" : "text-red-400"}>
              {t.chg >= 0 ? "▲" : "▼"}{Math.abs(t.chg)}%
            </span>
          </span>
        ))}
        <div className="ml-auto flex items-center gap-2 text-slate-500">
          <span className={`w-1.5 h-1.5 rounded-full ${liveMode ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`} />
          {liveMode ? "LIVE" : "PAUSED"} · {lastUpdate.toLocaleTimeString()}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Briefcase className="text-amber-400" size={26} />
              <h1 className="text-3xl font-bold">SmarkQuant Capital Fund</h1>
              <span className="bg-amber-400/20 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full border border-amber-400/30">HEDGE FUND</span>
            </div>
            <p className="text-slate-400 text-sm">
              Multi-Strategy Quant Portfolio · <span className="text-white">{sessions.length}</span> sessions ·{" "}
              <span className="text-emerald-400">{backtests.length} backtests</span> ·{" "}
              <span className="text-blue-400">{liveSessions.length} live/paper</span>
            </p>
          </div>
          <button onClick={() => setLiveMode(m => !m)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${liveMode ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-slate-800 text-slate-400 border-slate-700"}`}>
            <Activity size={14} />{liveMode ? "Live ON" : "Live OFF"}
          </button>
        </div>

        {/* ── AUM Hero ── */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/20 border border-amber-500/20 rounded-2xl p-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div>
              <p className="text-slate-400 text-xs mb-2 flex items-center gap-1">
                <Globe size={12} className="text-amber-400" />
                {equity > 0 ? "LIVE / PAPER ASSETS (USD)" : "PORTFOLIO SUMMARY"}
              </p>
              <div className="text-5xl font-black text-amber-400 tracking-tight mb-2">
                {equity > 0 ? <AnimatedNumber value={equity} /> : <span className="text-slate-500 text-3xl">No live sessions</span>}
              </div>
              {equity > 0 && (
                <div className={`flex items-center gap-1 text-base font-semibold ${dayPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {dayPnl >= 0 ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                  {fmtC(Math.abs(dayPnl))} ({dayPnlPct >= 0 ? "+" : ""}{fmt(dayPnlPct, 3)}%) today
                </div>
              )}
              <div className="mt-3 space-y-1">
                <p className="text-slate-500 text-xs flex justify-between">
                  <span>Live / Paper PnL</span>
                  <span className={livePaperPnl >= 0 ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}>{fmtC(livePaperPnl)}</span>
                </p>
                <p className="text-slate-500 text-xs flex justify-between">
                  <span>Simulated (Backtest) PnL</span>
                  <span className={backtestPnl >= 0 ? "text-blue-400 font-semibold" : "text-red-400 font-semibold"}>{fmtC(backtestPnl)}</span>
                </p>
                <p className="text-slate-600 text-xs flex justify-between border-t border-slate-800 pt-1 mt-1">
                  <span>All sessions combined</span>
                  <span className={totalPnl >= 0 ? "text-slate-300 font-semibold" : "text-red-400 font-semibold"}>{fmtC(totalPnl)}</span>
                </p>
              </div>
            </div>
            <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Available Cash", value: fmtC(availableCash), sub: alpaca ? "Alpaca" : "Est.", color: "text-blue-400" },
                { label: "Buying Power", value: fmtC(buyingPower), sub: alpaca ? "Alpaca" : "Est.", color: "text-purple-400" },
                { label: "Positions Value", value: fmtC(marginUsed), sub: alpaca ? "Long + Short" : "Est.", color: "text-orange-400" },
                { label: "Live P&L", value: fmtC(livePaperPnl), sub: `${liveSessions.length} sessions`, color: livePaperPnl >= 0 ? "text-emerald-400" : "text-red-400" },
              ].map(m => (
                <div key={m.label} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                  <p className="text-slate-400 text-xs mb-1">{m.label}</p>
                  <p className={`font-bold text-lg ${m.color}`}>{m.value}</p>
                  {m.sub && <p className="text-slate-600 text-[10px] mt-0.5">{m.sub}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 w-fit flex-wrap">
          {(["overview", "strategies", "risk", "trades", "wallet"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-lg text-sm font-medium capitalize transition-all flex items-center gap-1.5 ${tab === t ? "bg-amber-500 text-black" : "text-slate-400 hover:text-white"}`}>
              {t === "wallet" && <Wallet size={13} />}
              {t}
            </button>
          ))}
        </div>

        {/* ══════════════════ OVERVIEW ══════════════════ */}
        {tab === "overview" && (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total Sessions", value: sessions.length.toString(), sub: `${backtests.length} backtest · ${liveSessions.length} live`, color: "text-white" },
                { label: "Session Win Rate", value: fmt(sessionWinRate, 1) + "%", sub: `${profitSessions} profitable`, color: sessionWinRate >= 50 ? "text-emerald-400" : "text-red-400" },
                { label: "Realised PnL", value: fmtC(totalPnl), sub: "across all sessions", color: totalPnl >= 0 ? "text-emerald-400" : "text-red-400" },
                { label: "Total Trades", value: totalTrades.toLocaleString(), sub: `${totalWins}W · ${totalLosses}L`, color: "text-blue-400" },
              ].map(c => (
                <div key={c.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <p className="text-slate-500 text-xs mb-1">{c.sub}</p>
                  <p className="text-slate-300 text-sm mb-1">{c.label}</p>
                  <p className={`text-2xl font-black ${c.color}`}>{c.value}</p>
                </div>
              ))}
            </div>

            {/* Cumulative PnL curve (real sessions) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <TrendingUp size={18} className="text-amber-400" /> Cumulative P&L — All Sessions
                  </h2>
                  <p className="text-slate-500 text-xs mt-0.5">Running total profit from your {sessions.length} real sessions in the database</p>
                </div>
                <span className={`font-bold text-lg ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtC(totalPnl)}</span>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={cumCurve}>
                  <defs>
                    <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} interval={Math.floor(cumCurve.length / 10)} />
                  <YAxis tickFormatter={v => fmtC(v)} tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} width={80} />
                  <Tooltip content={<ChartTip moneyKey={["cumPnl", "pnl"]} />} />
                  <Area type="monotone" dataKey="cumPnl" name="Cumulative PnL" stroke="#10b981" strokeWidth={2} fill="url(#cumGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Best backtest equity curve */}
            {sampledCurve.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      <BarChart2 size={18} className="text-blue-400" /> Best Backtest Equity Curve
                    </h2>
                    <p className="text-slate-500 text-xs mt-0.5">
                      Strategy: <span className="text-white">{bestCurveSession?.strategy}</span> · {bestCurveSession?.symbol} · {bestCurveSession?.timeframe} · {rawCurve.length} candles
                    </p>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={sampledCurve}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="i" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} interval={20} />
                    <YAxis tickFormatter={v => "$" + fmt(v / 1000, 0) + "K"} tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} width={70} />
                    <Tooltip content={<ChartTip moneyKey={["equity"]} />} />
                    <Line type="monotone" dataKey="equity" name="equity" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Allocation + Alpaca */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Allocation by strategy */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
                  <PieChart size={18} className="text-purple-400" /> Strategy Allocation
                </h2>
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={160} height={160}>
                    <RePieChart>
                      <Pie data={allocData} cx="50%" cy="50%" innerRadius={45} outerRadius={72} dataKey="value" paddingAngle={3}>
                        {allocData.map((_, i) => <Cell key={i} fill={ALLOCATION_COLORS[i % ALLOCATION_COLORS.length]} />)}
                      </Pie>
                    </RePieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {allocData.map((d, i) => (
                      <div key={d.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length] }} />
                          <span className="text-slate-300 text-xs truncate max-w-[110px]">{d.name}</span>
                        </div>
                        <span className="text-white font-semibold text-sm">{d.value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Alpaca account */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
                  <Activity size={18} className="text-blue-400" /> Alpaca Paper Account (Live)
                </h2>
                {alpaca ? (
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Portfolio Value", value: fmtFull(alpaca.portfolio_value), color: "text-amber-400" },
                      { label: "Cash Balance", value: fmtFull(alpaca.cash), color: "text-blue-400" },
                      { label: "Buying Power", value: fmtFull(alpaca.buying_power), color: "text-purple-400" },
                      { label: "Account Status", value: alpaca.status, color: "text-emerald-400" },
                      { label: "Long Value", value: fmtFull(alpaca.long_market_value), color: "text-emerald-400" },
                      { label: "Short Value", value: fmtFull(alpaca.short_market_value), color: "text-red-400" },
                    ].map(m => (
                      <div key={m.label} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
                        <p className="text-slate-400 text-xs mb-0.5">{m.label}</p>
                        <p className={`font-bold ${m.color}`}>{m.value}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">Alpaca data unavailable</p>
                )}
              </div>
            </div>

            {/* Best / Worst sessions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: "Best Session", session: bestSession, color: "emerald" },
                { label: "Worst Session", session: worstSession, color: "red" },
              ].map(({ label, session, color }) => session && (
                <div key={label} className={`bg-slate-900 border border-${color}-500/20 rounded-2xl p-5`}>
                  <div className="flex items-center gap-2 mb-3">
                    {color === "emerald" ? <ArrowUpRight size={16} className="text-emerald-400" /> : <ArrowDownRight size={16} className="text-red-400" />}
                    <span className="text-slate-300 text-sm font-medium">{label}</span>
                  </div>
                  <p className={`text-2xl font-black text-${color}-400 mb-1`}>{fmtC(session.pnl_value)}</p>
                  <p className="text-slate-400 text-xs">{session.strategy} · {session.symbol} · {session.timeframe}</p>
                  <p className="text-slate-500 text-xs">{session.total_trades} trades · {fmt(session.win_rate * 100, 1)}% win rate</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════ STRATEGIES ══════════════════ */}
        {tab === "strategies" && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
                <Zap size={18} className="text-amber-400" /> Real Strategy Performance
                <span className="text-xs font-normal text-slate-500 ml-1">({strategies.length} strategies · {sessions.length} sessions)</span>
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 text-xs border-b border-slate-800">
                      {["Strategy", "Sessions", "Total P&L", "Trades", "W / L", "Win Rate", "Sharpe", "Sortino", "Max DD", "Symbols"].map(h => (
                        <th key={h} className={`pb-3 font-medium ${h === "Strategy" ? "text-left" : "text-right"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {strategies.map(s => (
                      <tr key={s.name} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 font-semibold text-white max-w-[160px] truncate">{s.name}</td>
                        <td className="py-3 text-right text-slate-400">{s.sessions}</td>
                        <td className={`py-3 text-right font-mono font-bold ${s.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {s.pnl >= 0 ? "+" : ""}{fmtC(s.pnl)}
                        </td>
                        <td className="py-3 text-right text-slate-300">{s.trades}</td>
                        <td className="py-3 text-right text-slate-300">
                          <span className="text-emerald-400">{s.wins}</span>
                          <span className="text-slate-600"> / </span>
                          <span className="text-red-400">{s.losses}</span>
                        </td>
                        <td className="py-3 text-right">
                          <span className={`font-semibold ${s.winRate >= 55 ? "text-emerald-400" : s.winRate >= 45 ? "text-yellow-400" : "text-red-400"}`}>
                            {s.trades ? fmt(s.winRate, 1) + "%" : "—"}
                          </span>
                        </td>
                        <td className="py-3 text-right text-blue-400 font-mono">{s.sharpe ? fmt(s.sharpe, 3) : "—"}</td>
                        <td className="py-3 text-right text-purple-400 font-mono">{s.sortino ? fmt(s.sortino, 3) : "—"}</td>
                        <td className="py-3 text-right text-red-400 font-mono">{s.maxDd ? fmt(s.maxDd, 2) + "%" : "—"}</td>
                        <td className="py-3 text-right text-slate-400 text-xs">{s.symbols.join(", ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Strategy PnL bar chart */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
                <BarChart2 size={18} className="text-purple-400" /> P&L by Strategy
              </h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={strategies.filter(s => s.pnl !== 0)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => fmtC(v)} tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} width={160} />
                  <Tooltip content={<ChartTip moneyKey={["pnl"]} />} />
                  <Bar dataKey="pnl" name="pnl" radius={[0, 4, 4, 0]}>
                    {strategies.filter(s => s.pnl !== 0).map((s, i) => <Cell key={i} fill={s.pnl >= 0 ? "#10b981" : "#ef4444"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Strategy trade counts */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
                <Activity size={18} className="text-blue-400" /> Trades by Strategy
              </h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={strategies.filter(s => s.trades > 0)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} width={160} />
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155" }} />
                  <Bar dataKey="wins" name="Wins" fill="#10b981" radius={[0, 0, 0, 0]} stackId="a" />
                  <Bar dataKey="losses" name="Losses" fill="#ef4444" radius={[0, 4, 4, 0]} stackId="a" />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ══════════════════ RISK ══════════════════ */}
        {tab === "risk" && (
          <div className="space-y-6">
            {/* Risk metric cards from real data */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Avg Sharpe Ratio", value: fmt(avgSharpe, 4), good: avgSharpe >= 1, desc: "Average across all sessions" },
                { label: "Avg Sortino Ratio", value: fmt(avgSortino, 4), good: avgSortino >= 1, desc: "Downside risk-adjusted" },
                { label: "Worst Drawdown", value: fmt(worstDd, 2) + "%", good: false, desc: "Largest drawdown in any session" },
                { label: "Avg Calmar Ratio", value: fmt(avgCalmar, 4), good: avgCalmar >= 1, desc: "Return / max drawdown" },
                { label: "Avg Omega Ratio", value: fmt(avgOmega, 4), good: avgOmega >= 1, desc: "Probability-weighted gain/loss" },
                { label: "Trade Win Rate", value: fmt(avgWinRate * 100, 2) + "%", good: avgWinRate >= 0.5, desc: "Avg winning trade pct" },
                { label: "Largest Win", value: fmtC(largestWin), good: true, desc: "Single best trade" },
                { label: "Largest Loss", value: fmtC(largestLoss), good: false, desc: "Single worst trade" },
                { label: "Avg Expectancy", value: fmtC(avgExpectancy), good: avgExpectancy >= 0, desc: "Expected value per trade" },
                { label: "Gross Profit", value: fmtC(totalGrossProfit), good: true, desc: "Total gross profit" },
                { label: "Gross Loss", value: fmtC(totalGrossLoss), good: false, desc: "Total gross loss" },
                { label: "Total Fees", value: fmtC(totalFees), good: false, desc: "Commission & trading costs" },
              ].map(m => (
                <div key={m.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <p className="text-slate-500 text-xs mb-1">{m.desc}</p>
                  <p className="text-slate-300 text-sm font-medium mb-2">{m.label}</p>
                  <p className={`text-2xl font-black ${m.good ? "text-emerald-400" : "text-red-400"}`}>{m.value}</p>
                </div>
              ))}
            </div>

            {/* Drawdown per session chart */}
            {ddChart.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
                  <Shield size={18} className="text-red-400" /> Drawdown Per Session (Backtests)
                </h2>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={ddChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} />
                    <YAxis tickFormatter={v => `${v}%`} tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} />
                    <Tooltip
                      formatter={(v: any, _: any, { payload }: any) => [`${v}%`, payload?.strategy || "Drawdown"]}
                      contentStyle={{ background: "#1e293b", border: "1px solid #334155" }}
                    />
                    <Bar dataKey="dd" name="Drawdown" fill="#ef4444" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Session PnL distribution */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
                <BarChart2 size={18} className="text-amber-400" /> Session P&L Distribution
              </h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={recentSessions.slice(0, 20).map((s, i) => ({ label: `#${i + 1}`, pnl: s.pnl_value, strategy: s.strategy }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} />
                  <YAxis tickFormatter={v => fmtC(v)} tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} width={80} />
                  <Tooltip content={<ChartTip moneyKey={["pnl"]} />} />
                  <Bar dataKey="pnl" name="pnl" radius={[3, 3, 0, 0]}>
                    {recentSessions.slice(0, 20).map((s, i) => <Cell key={i} fill={s.pnl_value >= 0 ? "#10b981" : "#ef4444"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ══════════════════ TRADES ══════════════════ */}
        {tab === "trades" && (
          <div className="space-y-6">
            {/* Summary row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total Trades", value: totalTrades.toLocaleString(), sub: "across all sessions", color: "text-blue-400" },
                { label: "Winning Trades", value: totalWins.toLocaleString(), sub: `${totalTrades ? fmt(totalWins / totalTrades * 100, 1) : 0}% of total`, color: "text-emerald-400" },
                { label: "Losing Trades", value: totalLosses.toLocaleString(), sub: `${totalTrades ? fmt(totalLosses / totalTrades * 100, 1) : 0}% of total`, color: "text-red-400" },
                { label: "Total Fees Paid", value: fmtC(totalFees), sub: "commission costs", color: "text-yellow-400" },
              ].map(m => (
                <div key={m.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <p className="text-slate-500 text-xs mb-1">{m.sub}</p>
                  <p className="text-slate-300 text-sm mb-1">{m.label}</p>
                  <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
                </div>
              ))}
            </div>

            {/* Session activity feed */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
                <Database size={18} className="text-slate-400" /> All Sessions — Most Recent First
              </h2>
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {recentSessions.map((s, i) => (
                  <div key={s.id} className="flex items-center justify-between bg-slate-800/40 border border-slate-700/30 rounded-xl px-4 py-3 hover:bg-slate-800/70 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-1 h-12 rounded-full ${s.pnl_value >= 0 ? "bg-emerald-500" : "bg-red-500"}`} />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-bold text-sm">{s.strategy}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.session_type === "backtest" ? "bg-blue-500/20 text-blue-400" : "bg-emerald-500/20 text-emerald-400"}`}>
                            {s.session_type}
                          </span>
                          {s.symbol && <span className="text-slate-500 text-xs">{s.symbol}</span>}
                          {s.timeframe && <span className="text-slate-600 text-xs">{s.timeframe}</span>}
                          {s.currency && s.currency !== "USD" && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                              {s.currency}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                          <span className="flex items-center gap-1"><Clock size={10} /> {new Date(s.created_at).toLocaleString()}</span>
                          <span>{s.total_trades} trades</span>
                          {s.win_rate > 0 && <span>{fmt(s.win_rate * 100, 1)}% win</span>}
                          {s.sharpe_ratio > 0 && <span>Sharpe {fmt(s.sharpe_ratio, 3)}</span>}
                          {s.starting_balance > 0 && (
                            <span className="text-slate-600">
                              cap: {fmtNative(s.starting_balance, s.currency)}
                              {s.currency && s.currency !== "USD" && (
                                <span className="text-slate-700"> ≈ {fmtC(toUsd(s.starting_balance, s.currency))}</span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <div className={`font-bold text-base ${s.pnl_value >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {s.pnl_value >= 0 ? "+" : ""}{fmtNative(s.pnl_value, s.currency)}
                        {s.currency && s.currency !== "USD" && (
                          <span className="text-xs text-slate-500 ml-1">
                            ≈ {s.pnl_value >= 0 ? "+" : ""}{fmtC(toUsd(s.pnl_value, s.currency))}
                          </span>
                        )}
                      </div>
                      <div className={`text-xs ${s.pnl_pct >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {s.pnl_pct >= 0 ? "+" : ""}{fmt(s.pnl_pct, 2)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Per-session trade counts */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
                <Activity size={18} className="text-purple-400" /> Trade Count Per Session
              </h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={sortedSessions.filter(s => s.total_trades > 0).map((s, i) => ({
                  label: `#${i + 1}`,
                  wins: s.total_winning_trades,
                  losses: s.total_losing_trades,
                  strategy: s.strategy,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="wins" name="Wins" fill="#10b981" stackId="a" />
                  <Bar dataKey="losses" name="Losses" fill="#ef4444" stackId="a" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ══════════════════ WALLET ══════════════════ */}
        {tab === "wallet" && (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total Deposited", value: fmtC(txSummary?.total_deposited_usd ?? 0), color: "text-emerald-400", icon: <ArrowDownToLine size={14} className="text-emerald-400" /> },
                { label: "Total Withdrawn", value: fmtC(txSummary?.total_withdrawn_usd ?? 0), color: "text-red-400", icon: <ArrowUpFromLine size={14} className="text-red-400" /> },
                { label: "Net Balance", value: fmtC(txSummary?.net_usd ?? 0), color: (txSummary?.net_usd ?? 0) >= 0 ? "text-amber-400" : "text-red-400", icon: <Wallet size={14} className="text-amber-400" /> },
                { label: "Pending", value: (txSummary?.pending_count ?? 0).toString(), color: "text-yellow-400", icon: <AlertCircle size={14} className="text-yellow-400" /> },
              ].map(c => (
                <div key={c.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-2">{c.icon}<p className="text-slate-500 text-xs">{c.label}</p></div>
                  <p className={`text-2xl font-black ${c.color}`}>{c.value}</p>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => { setShowDepositModal(true); setTxForm({ bank_name: "", account_number: "", account_name: "", amount: "", currency: "USD" }); setTxPending(null); setOtpInput(""); setTxError(""); }}
                className="flex items-center justify-center gap-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-2xl p-6 transition-all group"
              >
                <ArrowDownToLine size={24} className="group-hover:scale-110 transition-transform" />
                <div className="text-left">
                  <p className="font-black text-lg">Deposit Funds</p>
                  <p className="text-xs text-emerald-600">Add funds to your account</p>
                </div>
              </button>
              <button
                onClick={() => { setShowWithdrawModal(true); setTxForm({ bank_name: "", account_number: "", account_name: "", amount: "", currency: "USD" }); setTxPending(null); setOtpInput(""); setTxError(""); }}
                className="flex items-center justify-center gap-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-2xl p-6 transition-all group"
              >
                <ArrowUpFromLine size={24} className="group-hover:scale-110 transition-transform" />
                <div className="text-left">
                  <p className="font-black text-lg">Withdraw Funds</p>
                  <p className="text-xs text-red-600">Withdraw to your bank account</p>
                </div>
              </button>
            </div>

            {/* Transaction history */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Database size={18} className="text-amber-400" /> Transaction History
                </h2>
                <button onClick={fetchTransactions} className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white">
                  <RefreshCw size={14} className={txLoading ? "animate-spin" : ""} />
                </button>
              </div>
              {transactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Wallet size={40} className="text-slate-700 mb-3" />
                  <p className="text-slate-500 font-medium">No transactions yet</p>
                  <p className="text-slate-600 text-sm mt-1">Use the buttons above to make your first deposit or withdrawal</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-500 text-xs border-b border-slate-800">
                        <th className="text-left pb-3 font-semibold">Reference</th>
                        <th className="text-left pb-3 font-semibold">Type</th>
                        <th className="text-left pb-3 font-semibold">Bank / Account</th>
                        <th className="text-right pb-3 font-semibold">Amount</th>
                        <th className="text-center pb-3 font-semibold">Status</th>
                        <th className="text-right pb-3 font-semibold">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {transactions.map(tx => (
                        <tr key={tx.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 font-mono text-xs text-slate-400">{tx.reference}</td>
                          <td className="py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                              tx.type === "deposit" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                            }`}>
                              {tx.type === "deposit" ? <ArrowDownToLine size={9} /> : <ArrowUpFromLine size={9} />}
                              {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
                            </span>
                          </td>
                          <td className="py-3">
                            <p className="text-white font-medium text-xs">{tx.bank_name}</p>
                            <p className="text-slate-500 text-xs">{tx.account_name} · {tx.account_number}</p>
                          </td>
                          <td className="py-3 text-right">
                            <p className={`font-black ${tx.type === "deposit" ? "text-emerald-400" : "text-red-400"}`}>
                              {tx.type === "deposit" ? "+" : "-"}{currSym(tx.currency)}{Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                            <p className="text-slate-600 text-xs">{tx.currency}</p>
                          </td>
                          <td className="py-3 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                              tx.status === "completed" ? "bg-emerald-500/10 text-emerald-400" :
                              tx.status === "failed" ? "bg-red-500/10 text-red-400" :
                              "bg-yellow-500/10 text-yellow-400"
                            }`}>
                              {tx.status === "completed" ? <CheckCircle2 size={9} /> : tx.status === "failed" ? <X size={9} /> : <AlertCircle size={9} />}
                              {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                            </span>
                          </td>
                          <td className="py-3 text-right text-slate-500 text-xs font-mono">
                            {tx.created_at?.slice(0, 16).replace("T", " ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════ DEPOSIT / WITHDRAW MODALS ══════════════ */}
        {(showDepositModal || showWithdrawModal) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md shadow-2xl">
              {/* Modal header */}
              <div className={`flex items-center justify-between p-6 border-b border-slate-800`}>
                <div className="flex items-center gap-3">
                  {showDepositModal
                    ? <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center"><ArrowDownToLine className="text-emerald-400" size={20} /></div>
                    : <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center"><ArrowUpFromLine className="text-red-400" size={20} /></div>
                  }
                  <div>
                    <h3 className="font-black text-lg">{showDepositModal ? "Deposit Funds" : "Withdraw Funds"}</h3>
                    <p className="text-slate-500 text-xs">{showDepositModal ? "Add funds to your portfolio" : "Withdraw to your bank account"}</p>
                  </div>
                </div>
                <button onClick={() => { setShowDepositModal(false); setShowWithdrawModal(false); setTxPending(null); setTxError(""); }}
                  className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* Step 1: Form */}
                {!txPending && (
                  <>
                    {txError && (
                      <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
                        <AlertCircle size={14} className="flex-shrink-0" /> {txError}
                      </div>
                    )}
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 mb-1.5"><Building2 size={11} /> Bank Name</label>
                        <input
                          value={txForm.bank_name}
                          onChange={e => setTxForm(f => ({ ...f, bank_name: e.target.value }))}
                          placeholder="e.g. GTBank, Access Bank, Chase…"
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 mb-1.5"><Hash size={11} /> Account Number</label>
                        <input
                          value={txForm.account_number}
                          onChange={e => setTxForm(f => ({ ...f, account_number: e.target.value }))}
                          placeholder="e.g. 0123456789"
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 mb-1.5"><User size={11} /> Account Name</label>
                        <input
                          value={txForm.account_name}
                          onChange={e => setTxForm(f => ({ ...f, account_name: e.target.value }))}
                          placeholder="e.g. John Doe"
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                          <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 mb-1.5"><DollarSign size={11} /> Amount</label>
                          <input
                            type="number" min="0"
                            value={txForm.amount}
                            onChange={e => setTxForm(f => ({ ...f, amount: e.target.value }))}
                            placeholder="0.00"
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-400 mb-1.5 block">Currency</label>
                          <select
                            value={txForm.currency}
                            onChange={e => setTxForm(f => ({ ...f, currency: e.target.value }))}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                          >
                            {Object.keys(CURRENCY_TO_USD).map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                    <button
                      disabled={txSubmitting}
                      onClick={async () => {
                        setTxError("");
                        if (!txForm.bank_name || !txForm.account_number || !txForm.account_name || !txForm.amount) {
                          setTxError("Please fill in all fields"); return;
                        }
                        if (parseFloat(txForm.amount) <= 0) { setTxError("Amount must be greater than 0"); return; }
                        setTxSubmitting(true);
                        const endpoint = showDepositModal ? "/api/transactions/deposit" : "/api/transactions/withdraw";
                        const res = await fetch(endpoint, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ type: showDepositModal ? "deposit" : "withdraw", ...txForm, amount: parseFloat(txForm.amount) }),
                        });
                        setTxSubmitting(false);
                        if (!res.ok) { const d = await res.json(); setTxError(d.detail || "Request failed"); return; }
                        const data = await res.json();
                        setTxPending(data);
                        setOtpInput("");
                      }}
                      className={`w-full py-3 rounded-xl font-black text-sm transition-all ${
                        showDepositModal ? "bg-emerald-500 hover:bg-emerald-400 text-black" : "bg-red-500 hover:bg-red-400 text-white"
                      } disabled:opacity-50`}
                    >
                      {txSubmitting ? "Processing…" : showDepositModal ? "Request Deposit" : "Request Withdrawal"}
                    </button>
                  </>
                )}

                {/* Step 2: OTP verification */}
                {txPending && (
                  <div className="space-y-5">
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5 text-center">
                      <p className="text-slate-400 text-xs mb-2">Your OTP Code</p>
                      <div className="flex items-center justify-center gap-3">
                        <p className="text-4xl font-black tracking-[0.3em] text-amber-400">{txPending.otp_code}</p>
                        <button
                          onClick={() => { navigator.clipboard.writeText(txPending.otp_code); setOtpCopied(true); setTimeout(() => setOtpCopied(false), 2000); }}
                          className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors text-slate-500 hover:text-amber-400"
                        >
                          {otpCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                        </button>
                      </div>
                      <p className="text-slate-500 text-xs mt-2">Enter this code below to confirm your {txPending.type}</p>
                      <p className="text-slate-600 text-[10px] mt-1 font-mono">Ref: {txPending.reference}</p>
                    </div>

                    {txError && (
                      <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
                        <AlertCircle size={14} /> {txError}
                      </div>
                    )}

                    <div>
                      <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 mb-1.5"><Shield size={11} /> Enter OTP to Confirm</label>
                      <input
                        type="text" maxLength={6}
                        value={otpInput}
                        onChange={e => setOtpInput(e.target.value.replace(/\D/g, ""))}
                        placeholder="6-digit OTP"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-2xl font-black tracking-[0.3em] text-white placeholder-slate-700 text-center focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => { setTxPending(null); setTxError(""); }}
                        className="py-3 rounded-xl font-semibold text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
                      >
                        Go Back
                      </button>
                      <button
                        disabled={txSubmitting || otpInput.length !== 6}
                        onClick={async () => {
                          setTxError("");
                          setTxSubmitting(true);
                          const res = await fetch("/api/transactions/verify-otp", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ transaction_id: txPending.id, otp: otpInput }),
                          });
                          setTxSubmitting(false);
                          if (!res.ok) { const d = await res.json(); setTxError(d.detail || "Invalid OTP"); return; }
                          setShowDepositModal(false); setShowWithdrawModal(false);
                          setTxPending(null); setOtpInput("");
                          fetchTransactions();
                        }}
                        className={`py-3 rounded-xl font-black text-sm transition-all ${
                          showDepositModal ? "bg-emerald-500 hover:bg-emerald-400 text-black" : "bg-red-500 hover:bg-red-400 text-white"
                        } disabled:opacity-40`}
                      >
                        {txSubmitting ? "Verifying…" : "Confirm"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-slate-800 pt-4 flex items-center justify-between text-xs text-slate-600">
          <span>SmarkQuant Capital Fund · {sessions.length} sessions · {totalTrades} trades</span>
          <span>Data live from your trading database · Equity refreshes every 1.8s</span>
        </div>
      </div>
    </div>
  );
}
