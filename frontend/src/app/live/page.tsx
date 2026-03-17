"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Radio, Play, Square, Activity, Terminal, Trash2,
    Bot, TrendingUp, TrendingDown, Box, Clock,
    Wallet, List, RefreshCw, AlertTriangle, CheckCircle, ExternalLink,
    ChevronDown, ChevronUp, BarChart2
} from "lucide-react";
import {
    LineChart, Line, ResponsiveContainer, Tooltip as RechartTooltip, XAxis, YAxis
} from "recharts";
import { toast } from "sonner";

const CURRENCIES = [
    { code: "USD", symbol: "$", label: "US Dollar" },
    { code: "NGN", symbol: "₦", label: "Nigerian Naira" },
    { code: "EUR", symbol: "€", label: "Euro" },
    { code: "CNY", symbol: "¥", label: "Chinese Yuan" },
];

const EXCHANGES = [
    "Simulated",
    "Alpaca Live",
    "Alpaca Paper",
    "Binance Futures",
    "Binance",
    "Bybit",
    "Coinbase",
];

const SYMBOLS = [
    "BTC-USD", "ETH-USD", "SOL-USD", "BTC-USDT", "ETH-USDT", "BNB-USDT",
    "SOL-USDT", "ADA-USDT", "XRP-USDT", "DOGE-USDT",
    "AAPL", "TSLA", "SPY", "NVDA", "MSFT", "GOOGL", "AMZN", "META",
];
const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "2h", "3h", "4h", "6h", "8h", "12h", "1D", "3D", "1W"];

function isAlpacaExchange(ex: string) {
    return ex === "Alpaca Live" || ex === "Alpaca Paper";
}
function isAlpacaPaper(ex: string) {
    return ex === "Alpaca Paper";
}

export default function LivePage() {
    const [bots, setBots] = useState<any[]>([]);
    const [activeCount, setActiveCount] = useState(0);
    const [selectedBot, setSelectedBot] = useState<any>(null);
    const [strategies, setStrategies] = useState<string[]>([]);

    const [symbol, setSymbol] = useState("BTC-USD");
    const [exchange, setExchange] = useState("Simulated");
    const [amount, setAmount] = useState("1000");
    const [currency, setCurrency] = useState("USD");
    const [strategy, setStrategy] = useState("");
    const [timeframe, setTimeframe] = useState("4h");
    const [launching, setLaunching] = useState(false);
    const [switchingStrategy, setSwitchingStrategy] = useState<string | null>(null);

    // Alpaca dashboard state
    const [alpacaTab, setAlpacaTab] = useState<"account" | "positions" | "orders">("account");
    const [alpacaAccount, setAlpacaAccount] = useState<any>(null);
    const [alpacaPositions, setAlpacaPositions] = useState<any[]>([]);
    const [alpacaOrders, setAlpacaOrders] = useState<any[]>([]);
    const [alpacaLoading, setAlpacaLoading] = useState(false);
    const [alpacaError, setAlpacaError] = useState<string | null>(null);

    const fetchAlpacaData = useCallback(async () => {
        if (!isAlpacaExchange(exchange)) return;
        const paper = isAlpacaPaper(exchange);
        setAlpacaLoading(true);
        setAlpacaError(null);
        try {
            const [acctRes, posRes, ordRes] = await Promise.all([
                fetch(`/api/alpaca/account?paper=${paper}`),
                fetch(`/api/alpaca/positions?paper=${paper}`),
                fetch(`/api/alpaca/orders?paper=${paper}&limit=20`),
            ]);
            if (!acctRes.ok) {
                const err = await acctRes.json();
                setAlpacaError(err.detail || "Could not connect to Alpaca");
                return;
            }
            const [acct, pos, ord] = await Promise.all([acctRes.json(), posRes.json(), ordRes.json()]);
            setAlpacaAccount(acct);
            setAlpacaPositions(pos.positions || []);
            setAlpacaOrders(ord.orders || []);
        } catch {
            setAlpacaError("Failed to connect to Alpaca API");
        } finally {
            setAlpacaLoading(false);
        }
    }, [exchange]);

    useEffect(() => {
        if (isAlpacaExchange(exchange)) {
            fetchAlpacaData();
            const iv = setInterval(fetchAlpacaData, 15000);
            return () => clearInterval(iv);
        } else {
            setAlpacaAccount(null);
            setAlpacaPositions([]);
            setAlpacaOrders([]);
            setAlpacaError(null);
        }
    }, [exchange, fetchAlpacaData]);

    const switchBotStrategy = async (botId: string, newStrategy: string) => {
        setSwitchingStrategy(botId);
        try {
            const res = await fetch(`/api/bots/${botId}/strategy`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ strategy: newStrategy }),
            });
            if (res.ok) {
                toast.success(`Strategy switched to ${newStrategy}`);
                fetchBots();
            } else {
                toast.error("Failed to switch strategy");
            }
        } catch {
            toast.error("Connection error");
        } finally {
            setSwitchingStrategy(null);
        }
    };

    const fetchBots = async () => {
        try {
            const res = await fetch("/api/bots");
            const data = await res.json();
            setBots(data.bots || []);
            setActiveCount(data.active_count || 0);
            if (selectedBot) {
                const updated = data.bots?.find((b: any) => b.id === selectedBot.id);
                if (updated) setSelectedBot(updated);
            }
        } catch {
            console.error("Failed to fetch bots");
        }
    };

    const fetchStrategies = async () => {
        try {
            const res = await fetch("/api/strategies");
            const data = await res.json();
            const list: string[] = data.strategies || [];
            setStrategies(list);
            if (!strategy && list.length > 0) setStrategy(list[0]);
        } catch {}
    };

    useEffect(() => {
        fetchStrategies();
        fetchBots();
        const interval = setInterval(fetchBots, 3000);
        return () => clearInterval(interval);
    }, []);

    const launchBot = async () => {
        const amt = parseFloat(amount);
        if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
        if (!strategy) { toast.error("Select a strategy"); return; }
        setLaunching(true);
        try {
            const res = await fetch("/api/bots", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ symbol, exchange, amount: amt, currency, strategy, timeframe }),
            });
            if (res.ok) {
                const data = await res.json();
                toast.success(`Bot launched — ${strategy} on ${symbol} via ${exchange}`);
                setSelectedBot(data.bot);
                fetchBots();
                if (isAlpacaExchange(exchange)) fetchAlpacaData();
            } else {
                const err = await res.json();
                toast.error(err.detail || "Failed to launch bot");
            }
        } catch {
            toast.error("Connection error");
        } finally {
            setLaunching(false);
        }
    };

    const stopBot = async (id: string) => {
        try {
            await fetch(`/api/bots/${id}/stop`, { method: "POST" });
            toast.info("Bot stopped");
            fetchBots();
        } catch { toast.error("Failed to stop bot"); }
    };

    const deleteBot = async (id: string) => {
        try {
            await fetch(`/api/bots/${id}`, { method: "DELETE" });
            toast.success("Bot removed");
            if (selectedBot?.id === id) setSelectedBot(null);
            fetchBots();
        } catch { toast.error("Failed to delete bot"); }
    };

    const currencyInfo = CURRENCIES.find(c => c.code === currency) || CURRENCIES[0];
    const showAlpaca = isAlpacaExchange(exchange);

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <Radio className={activeCount > 0 ? "text-red-500 animate-pulse" : "text-slate-500"} />
                        Live Dashboard
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">Monitor active algorithmic trading sessions</p>
                </div>
                <div className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm">
                    <span className="text-slate-500">Active Bots: </span>
                    <span className={`font-black text-lg ${activeCount > 0 ? "text-green-400" : "text-slate-400"}`}>{activeCount}</span>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Launch Panel */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                    <h2 className="font-black text-xs uppercase tracking-widest text-slate-400 flex items-center gap-2">
                        <Bot size={15} className="text-blue-400" /> Launch Bot
                    </h2>

                    {/* Strategy Selector */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <Box size={10} className="text-blue-400" />
                            Strategy
                        </label>
                        {strategies.length === 0 ? (
                            <div className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-500 italic">
                                Loading strategies…
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                {strategies.map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setStrategy(s)}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all border ${
                                            strategy === s
                                                ? "bg-blue-600/15 border-blue-500/60 text-blue-300 font-semibold"
                                                : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                                        }`}
                                    >
                                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-2 ${strategy === s ? "bg-blue-400" : "bg-slate-600"}`} />
                                        {s}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Timeframe Selector */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <Clock size={10} className="text-purple-400" />
                            Timeframe
                        </label>
                        <div className="grid grid-cols-4 gap-1.5">
                            {TIMEFRAMES.map(tf => (
                                <button
                                    key={tf}
                                    onClick={() => setTimeframe(tf)}
                                    className={`py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                        timeframe === tf
                                            ? "bg-purple-600/20 border-purple-500/60 text-purple-300"
                                            : "bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300"
                                    }`}
                                >
                                    {tf}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="border-t border-slate-800" />

                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Symbol</label>
                        <select
                            value={symbol}
                            onChange={e => setSymbol(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm focus:border-blue-500 transition-colors"
                        >
                            {SYMBOLS.map(s => <option key={s}>{s}</option>)}
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Exchange</label>
                        <select
                            value={exchange}
                            onChange={e => setExchange(e.target.value)}
                            className={`w-full bg-slate-950 border rounded-lg px-3 py-2.5 text-sm focus:border-blue-500 transition-colors ${
                                showAlpaca ? "border-yellow-600/50 text-yellow-300" : "border-slate-800"
                            }`}
                        >
                            {EXCHANGES.map(ex => (
                                <option key={ex} value={ex}>{ex}</option>
                            ))}
                        </select>
                        {showAlpaca && (
                            <p className="text-[10px] text-yellow-500 flex items-center gap-1 mt-1">
                                <AlertTriangle size={9} />
                                Requires ALPACA_API_KEY + ALPACA_SECRET_KEY in Secrets
                            </p>
                        )}
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Currency</label>
                        <div className="grid grid-cols-2 gap-2">
                            {CURRENCIES.map(c => (
                                <button
                                    key={c.code}
                                    onClick={() => setCurrency(c.code)}
                                    className={`py-2 rounded-lg text-xs font-bold border transition-all ${
                                        currency === c.code
                                            ? "bg-blue-600/20 border-blue-500 text-blue-400"
                                            : "bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600"
                                    }`}
                                >
                                    {c.symbol} {c.code}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            Capital ({currencyInfo.symbol}{currencyInfo.code})
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">{currencyInfo.symbol}</span>
                            <input
                                type="number"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                min="1"
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-2.5 text-sm focus:border-blue-500 transition-colors"
                                placeholder="1000"
                            />
                        </div>
                        {showAlpaca && (
                            <p className="text-[10px] text-slate-500">Capital field is for reference — Alpaca uses your real account balance.</p>
                        )}
                    </div>

                    <button
                        onClick={launchBot}
                        disabled={launching || !strategy}
                        className={`w-full py-3 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg text-sm uppercase tracking-wider ${
                            showAlpaca
                                ? "bg-yellow-600 hover:bg-yellow-500 shadow-yellow-600/20"
                                : "bg-blue-600 hover:bg-blue-500 shadow-blue-600/20"
                        }`}
                    >
                        <Play size={15} fill="currentColor" />
                        {launching ? "Launching..." : showAlpaca ? `Launch on ${exchange}` : "Launch Bot"}
                    </button>

                    {strategy && (
                        <p className="text-[10px] text-slate-500 text-center">
                            Using <span className="text-blue-400 font-medium">{strategy}</span>
                        </p>
                    )}
                </div>

                {/* Right Column */}
                <div className="lg:col-span-3 space-y-4">

                    {/* Alpaca Dashboard */}
                    {showAlpaca && (
                        <div className="bg-slate-900 border border-yellow-600/30 rounded-2xl overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-yellow-600/5">
                                <div className="flex items-center gap-2">
                                    <Activity size={15} className="text-yellow-400" />
                                    <span className="text-sm font-black text-yellow-300 uppercase tracking-widest">
                                        Alpaca {isAlpacaPaper(exchange) ? "Paper" : "Live"} Account
                                    </span>
                                    {alpacaAccount && (
                                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                                            alpacaAccount.status === "ACTIVE"
                                                ? "bg-green-500/10 border-green-500/20 text-green-400"
                                                : "bg-red-500/10 border-red-500/20 text-red-400"
                                        }`}>
                                            {alpacaAccount.status}
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={fetchAlpacaData}
                                    disabled={alpacaLoading}
                                    className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
                                    title="Refresh"
                                >
                                    <RefreshCw size={13} className={alpacaLoading ? "animate-spin" : ""} />
                                </button>
                            </div>

                            {alpacaError ? (
                                <div className="p-5 flex items-start gap-3">
                                    <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm text-red-400 font-semibold">Connection Error</p>
                                        <p className="text-xs text-slate-500 mt-1">{alpacaError}</p>
                                        <p className="text-xs text-slate-600 mt-2">
                                            Add <span className="text-yellow-400 font-mono">ALPACA_API_KEY</span> and{" "}
                                            <span className="text-yellow-400 font-mono">ALPACA_SECRET_KEY</span> in your project Secrets, then restart the backend.
                                        </p>
                                    </div>
                                </div>
                            ) : alpacaLoading && !alpacaAccount ? (
                                <div className="p-5 text-center text-slate-500 text-sm animate-pulse">Connecting to Alpaca…</div>
                            ) : alpacaAccount ? (
                                <div>
                                    {/* Account Summary */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border-b border-slate-800">
                                        <AlpacaStat label="Equity" value={`$${Number(alpacaAccount.equity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} accent="green" />
                                        <AlpacaStat label="Cash" value={`$${Number(alpacaAccount.cash).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                                        <AlpacaStat label="Buying Power" value={`$${Number(alpacaAccount.buying_power).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                                        <AlpacaStat label="Portfolio Value" value={`$${Number(alpacaAccount.portfolio_value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                                    </div>

                                    {/* Tabs */}
                                    <div className="flex border-b border-slate-800">
                                        {(["account", "positions", "orders"] as const).map(tab => (
                                            <button
                                                key={tab}
                                                onClick={() => setAlpacaTab(tab)}
                                                className={`px-5 py-3 text-xs font-black uppercase tracking-widest transition-colors border-b-2 ${
                                                    alpacaTab === tab
                                                        ? "border-yellow-500 text-yellow-300"
                                                        : "border-transparent text-slate-500 hover:text-slate-300"
                                                }`}
                                            >
                                                {tab === "account" && <span className="flex items-center gap-1.5"><Wallet size={11} />{tab}</span>}
                                                {tab === "positions" && <span className="flex items-center gap-1.5"><TrendingUp size={11} />{tab} ({alpacaPositions.length})</span>}
                                                {tab === "orders" && <span className="flex items-center gap-1.5"><List size={11} />{tab} ({alpacaOrders.length})</span>}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Tab Content */}
                                    <div className="p-4">
                                        {alpacaTab === "account" && (
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                                <InfoRow label="Account ID" value={alpacaAccount.id?.slice(0, 16) + "…"} />
                                                <InfoRow label="Currency" value={alpacaAccount.currency} />
                                                <InfoRow label="Day Trades" value={alpacaAccount.daytrade_count} />
                                                <InfoRow label="Long Market Value" value={`$${Number(alpacaAccount.long_market_value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                                                <InfoRow label="Short Market Value" value={`$${Number(alpacaAccount.short_market_value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                                                <InfoRow
                                                    label="Pattern Day Trader"
                                                    value={alpacaAccount.pattern_day_trader ? "Yes" : "No"}
                                                    accent={alpacaAccount.pattern_day_trader ? "red" : "green"}
                                                />
                                                <InfoRow
                                                    label="Trading Blocked"
                                                    value={alpacaAccount.trading_blocked ? "Yes" : "No"}
                                                    accent={alpacaAccount.trading_blocked ? "red" : "green"}
                                                />
                                                <InfoRow
                                                    label="Mode"
                                                    value={isAlpacaPaper(exchange) ? "Paper Trading" : "Live Trading"}
                                                    accent={isAlpacaPaper(exchange) ? "yellow" : "green"}
                                                />
                                            </div>
                                        )}

                                        {alpacaTab === "positions" && (
                                            alpacaPositions.length === 0 ? (
                                                <p className="text-slate-500 text-sm text-center py-4">No open positions</p>
                                            ) : (
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-xs">
                                                        <thead>
                                                            <tr className="text-[10px] text-slate-500 uppercase tracking-widest">
                                                                <th className="text-left py-2 pr-4">Symbol</th>
                                                                <th className="text-left py-2 pr-4">Side</th>
                                                                <th className="text-right py-2 pr-4">Qty</th>
                                                                <th className="text-right py-2 pr-4">Avg Entry</th>
                                                                <th className="text-right py-2 pr-4">Current</th>
                                                                <th className="text-right py-2 pr-4">Market Value</th>
                                                                <th className="text-right py-2">Unrealized P&L</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {alpacaPositions.map((p, i) => {
                                                                const pl = p.unrealized_pl ?? 0;
                                                                const plPct = (p.unrealized_plpc ?? 0) * 100;
                                                                return (
                                                                    <tr key={i} className="border-t border-slate-800">
                                                                        <td className="py-2.5 pr-4 font-black text-white">{p.symbol}</td>
                                                                        <td className="py-2.5 pr-4">
                                                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${p.side === "long" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                                                                                {String(p.side).toUpperCase()}
                                                                            </span>
                                                                        </td>
                                                                        <td className="py-2.5 pr-4 text-right font-mono">{p.qty}</td>
                                                                        <td className="py-2.5 pr-4 text-right font-mono">${Number(p.avg_entry_price).toFixed(4)}</td>
                                                                        <td className="py-2.5 pr-4 text-right font-mono">${Number(p.current_price ?? 0).toFixed(4)}</td>
                                                                        <td className="py-2.5 pr-4 text-right font-mono">${Number(p.market_value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                                        <td className={`py-2.5 text-right font-mono font-bold ${pl >= 0 ? "text-green-400" : "text-red-400"}`}>
                                                                            {pl >= 0 ? "+" : ""}{Number(pl).toFixed(2)} ({plPct >= 0 ? "+" : ""}{plPct.toFixed(2)}%)
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )
                                        )}

                                        {alpacaTab === "orders" && (
                                            alpacaOrders.length === 0 ? (
                                                <p className="text-slate-500 text-sm text-center py-4">No recent orders</p>
                                            ) : (
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-xs">
                                                        <thead>
                                                            <tr className="text-[10px] text-slate-500 uppercase tracking-widest">
                                                                <th className="text-left py-2 pr-4">Symbol</th>
                                                                <th className="text-left py-2 pr-4">Side</th>
                                                                <th className="text-right py-2 pr-4">Qty</th>
                                                                <th className="text-right py-2 pr-4">Filled</th>
                                                                <th className="text-right py-2 pr-4">Avg Price</th>
                                                                <th className="text-left py-2 pr-4">Status</th>
                                                                <th className="text-left py-2">Submitted</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {alpacaOrders.map((o, i) => (
                                                                <tr key={i} className="border-t border-slate-800">
                                                                    <td className="py-2.5 pr-4 font-black text-white">{o.symbol}</td>
                                                                    <td className="py-2.5 pr-4">
                                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${String(o.side).includes("buy") ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                                                                            {String(o.side).toUpperCase()}
                                                                        </span>
                                                                    </td>
                                                                    <td className="py-2.5 pr-4 text-right font-mono">{o.qty}</td>
                                                                    <td className="py-2.5 pr-4 text-right font-mono">{o.filled_qty}</td>
                                                                    <td className="py-2.5 pr-4 text-right font-mono">{o.filled_avg_price ? `$${Number(o.filled_avg_price).toFixed(4)}` : "—"}</td>
                                                                    <td className="py-2.5 pr-4">
                                                                        <OrderStatusBadge status={o.status} />
                                                                    </td>
                                                                    <td className="py-2.5 text-slate-500 text-[10px]">
                                                                        {o.submitted_at ? new Date(o.submitted_at).toLocaleString() : "—"}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )
                                        )}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    )}

                    {/* Bot List */}
                    {bots.length === 0 ? (
                        <div className="bg-slate-900 border border-dashed border-slate-800 rounded-2xl h-48 flex flex-col items-center justify-center text-slate-600 gap-3">
                            <Bot size={40} className="opacity-20" />
                            <p className="font-bold text-sm">No bots running</p>
                            <p className="text-xs">Select a strategy and launch a bot from the panel on the left</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {bots.map(bot => (
                                <BotCard
                                    key={bot.id}
                                    bot={bot}
                                    isSelected={selectedBot?.id === bot.id}
                                    onSelect={() => setSelectedBot(selectedBot?.id === bot.id ? null : bot)}
                                    onStop={() => stopBot(bot.id)}
                                    onDelete={() => deleteBot(bot.id)}
                                    strategies={strategies}
                                    onSwitchStrategy={(s: string) => switchBotStrategy(bot.id, s)}
                                    isSwitching={switchingStrategy === bot.id}
                                />
                            ))}
                        </div>
                    )}

                    {/* Signal Stream for selected bot */}
                    {selectedBot && (
                        <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
                            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                                <div className="flex items-center gap-2">
                                    <Terminal size={15} className="text-slate-400" />
                                    <span className="text-xs font-bold uppercase tracking-widest text-slate-300">
                                        Signal Stream — {selectedBot.strategy} · Bot {selectedBot.id}
                                    </span>
                                    {isAlpacaExchange(selectedBot.exchange) && (
                                        <span className="text-[10px] px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/20 rounded text-yellow-400 font-bold">
                                            {selectedBot.exchange}
                                        </span>
                                    )}
                                </div>
                                {selectedBot.is_running && (
                                    <div className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 rounded text-[9px] font-black text-red-500 animate-pulse">LIVE</div>
                                )}
                            </div>
                            <div className="h-48 overflow-y-auto p-4 font-mono text-[11px] space-y-1">
                                {(selectedBot.logs || []).slice().reverse().map((log: string, i: number) => (
                                    <div key={i} className={`border-l-2 pl-3 py-0.5 ${
                                        log.includes("LONG") ? "border-green-500/50 text-green-400" :
                                        log.includes("SHORT") ? "border-red-500/50 text-red-400" :
                                        log.includes("EXIT") ? "border-yellow-500/50 text-yellow-400" :
                                        log.includes("STRATEGY SWITCH") ? "border-blue-500/50 text-blue-400" :
                                        log.includes("ALPACA") ? "border-yellow-500/50 text-yellow-300" :
                                        log.includes("BUY") ? "border-green-500/50 text-green-400" :
                                        log.includes("SELL") ? "border-red-500/50 text-red-400" :
                                        "border-slate-800 text-slate-400"
                                    }`}>{log}</div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function OrderStatusBadge({ status }: { status: string }) {
    const s = String(status).toLowerCase();
    const colors =
        s === "filled" ? "bg-green-500/10 text-green-400 border-green-500/20" :
        s === "canceled" || s === "cancelled" ? "bg-slate-700 text-slate-400 border-slate-600" :
        s === "new" || s === "accepted" || s === "pending_new" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
        s === "partially_filled" ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" :
        s === "rejected" || s === "expired" ? "bg-red-500/10 text-red-400 border-red-500/20" :
        "bg-slate-800 text-slate-400 border-slate-700";
    return (
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${colors}`}>
            {String(status).toUpperCase()}
        </span>
    );
}

function AlpacaStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
    return (
        <div className="p-4 border-r border-slate-800 last:border-r-0">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{label}</p>
            <p className={`text-base font-black ${accent === "green" ? "text-green-400" : accent === "red" ? "text-red-400" : "text-white"}`}>{value}</p>
        </div>
    );
}

function InfoRow({ label, value, accent }: { label: string; value: any; accent?: string }) {
    return (
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{label}</p>
            <p className={`text-sm font-bold ${accent === "green" ? "text-green-400" : accent === "red" ? "text-red-400" : accent === "yellow" ? "text-yellow-400" : "text-white"}`}>{value}</p>
        </div>
    );
}

function BotCard({ bot, isSelected, onSelect, onStop, onDelete, strategies, onSwitchStrategy, isSwitching }: any) {
    const [showStrategyPicker, setShowStrategyPicker] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const pnlPositive = bot.pnl_pct >= 0;
    const sym = bot.currency_symbol;
    const isAlpaca = isAlpacaExchange(bot.exchange);
    const equitySnapshots: any[] = bot.equity_snapshots ?? [];
    const completedTrades: any[] = bot.completed_trades ?? [];

    return (
        <div
            onClick={onSelect}
            className={`bg-slate-900 border rounded-2xl p-5 cursor-pointer transition-all ${
                isSelected
                    ? isAlpaca ? "border-yellow-500/50 bg-yellow-500/5" : "border-blue-500/50 bg-blue-500/5"
                    : "border-slate-800 hover:border-slate-700"
            }`}
        >
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3 flex-wrap">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${bot.is_running ? "bg-green-500 animate-pulse" : "bg-slate-600"}`} />
                    <span className="font-black text-white">{bot.symbol}</span>
                    <span className="text-[10px] px-2 py-0.5 bg-slate-800 rounded text-slate-400 font-mono">{bot.id}</span>
                    {bot.strategy && (
                        <div className="relative">
                            <button
                                onClick={e => { e.stopPropagation(); setShowStrategyPicker(v => !v); }}
                                className="text-[10px] px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded text-blue-400 font-medium flex items-center gap-1 hover:bg-blue-500/20 transition-colors"
                                title="Click to switch strategy"
                            >
                                <Box size={9} />
                                {isSwitching ? "Switching…" : bot.strategy}
                                <span className="text-blue-600 ml-1">▾</span>
                            </button>
                            {showStrategyPicker && strategies.length > 0 && (
                                <div
                                    className="absolute top-full left-0 mt-1 z-50 bg-slate-950 border border-slate-700 rounded-xl shadow-2xl overflow-hidden min-w-[160px]"
                                    onClick={e => e.stopPropagation()}
                                >
                                    <p className="text-[9px] text-slate-500 uppercase font-bold px-3 py-2 border-b border-slate-800">Switch Strategy</p>
                                    {strategies.map((s: string) => (
                                        <button
                                            key={s}
                                            onClick={() => { onSwitchStrategy(s); setShowStrategyPicker(false); }}
                                            className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-800 transition-colors flex items-center gap-2 ${s === bot.strategy ? "text-blue-400 font-bold" : "text-slate-300"}`}
                                        >
                                            {s === bot.strategy && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />}
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    {bot.timeframe && (
                        <span className="text-[10px] px-2 py-0.5 bg-purple-500/10 border border-purple-500/20 rounded text-purple-400 font-mono font-bold">
                            {bot.timeframe}
                        </span>
                    )}
                    <span className={`text-[10px] font-semibold ${isAlpaca ? "text-yellow-400" : "text-slate-500"}`}>{bot.exchange}</span>
                    {bot.position && (
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                            bot.position === "LONG" ? "bg-green-500/10 text-green-400" :
                            bot.position === "SHORT" ? "bg-red-500/10 text-red-400" :
                            "bg-slate-800 text-slate-400"
                        }`}>{bot.position}</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={e => { e.stopPropagation(); setShowDetails(v => !v); }}
                        className={`p-1.5 rounded-lg transition-colors text-xs flex items-center gap-1 border ${
                            showDetails ? "bg-slate-700 border-slate-600 text-white" : "border-slate-700 text-slate-500 hover:text-white hover:bg-slate-800"
                        }`}
                        title="Show trade details & equity curve"
                    >
                        <BarChart2 size={13} />
                        {showDetails ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </button>
                    {bot.is_running ? (
                        <button
                            onClick={e => { e.stopPropagation(); onStop(); }}
                            className="p-1.5 hover:bg-red-500/10 text-red-400 rounded-lg transition-colors border border-transparent hover:border-red-500/20"
                        >
                            <Square size={14} fill="currentColor" />
                        </button>
                    ) : null}
                    <button
                        onClick={e => { e.stopPropagation(); onDelete(); }}
                        className="p-1.5 hover:bg-slate-800 text-slate-500 hover:text-red-400 rounded-lg transition-colors"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Stat label="Capital" value={`${sym}${bot.amount_native.toLocaleString()}`} sub={bot.currency} />
                <Stat label="Equity" value={`${sym}${bot.equity_native.toLocaleString()}`} />
                <Stat
                    label="P&L"
                    value={`${pnlPositive ? "+" : ""}${sym}${Math.abs(bot.pnl_native).toFixed(2)}`}
                    sub={`${pnlPositive ? "+" : ""}${bot.pnl_pct.toFixed(2)}%`}
                    highlight={pnlPositive ? "green" : "red"}
                />
                <Stat label="Trades" value={bot.trades_count} sub={`${(bot.win_rate * 100).toFixed(0)}% win rate`} />
                <Stat
                    label="Runtime"
                    value={`${Math.floor(bot.runtime / 60)}m ${Math.floor(bot.runtime % 60)}s`}
                    sub={bot.is_running ? "Running" : "Stopped"}
                />
            </div>

            {/* ── Expandable details: equity curve + trades ── */}
            {showDetails && (
                <div
                    onClick={e => e.stopPropagation()}
                    className="mt-5 pt-4 border-t border-slate-800 space-y-4"
                >
                    {/* Mini equity curve */}
                    <div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2 flex items-center gap-1">
                            <BarChart2 size={10} /> Equity Curve
                            {equitySnapshots.length === 0 && <span className="text-slate-600 ml-1 normal-case font-normal">(awaiting data…)</span>}
                        </p>
                        {equitySnapshots.length > 1 ? (
                            <ResponsiveContainer width="100%" height={90}>
                                <LineChart data={equitySnapshots} margin={{ top: 2, right: 4, left: 0, bottom: 2 }}>
                                    <XAxis dataKey="t" hide />
                                    <YAxis domain={["auto", "auto"]} hide />
                                    <RechartTooltip
                                        contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
                                        formatter={(v: any) => [`$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, "Equity"]}
                                        labelFormatter={(l: any) => `Tick ${l}`}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="equity"
                                        stroke={pnlPositive ? "#34d399" : "#f87171"}
                                        strokeWidth={2}
                                        dot={false}
                                        isAnimationActive={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-[90px] flex items-center justify-center bg-slate-800/30 rounded-lg">
                                <p className="text-slate-600 text-xs">Bot needs more ticks to generate chart</p>
                            </div>
                        )}
                    </div>

                    {/* Completed trades table */}
                    <div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2 flex items-center gap-1">
                            <List size={10} /> Completed Trades ({completedTrades.length})
                        </p>
                        {completedTrades.length === 0 ? (
                            <p className="text-slate-600 text-xs py-2">No completed trades yet</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-[11px]">
                                    <thead>
                                        <tr className="text-slate-500 border-b border-slate-800">
                                            <th className="text-left pb-1 font-semibold">#</th>
                                            <th className="text-left pb-1 font-semibold">Side</th>
                                            <th className="text-right pb-1 font-semibold">Entry</th>
                                            <th className="text-right pb-1 font-semibold">Exit</th>
                                            <th className="text-right pb-1 font-semibold">P&L (USD)</th>
                                            <th className="text-right pb-1 font-semibold">Reason</th>
                                            <th className="text-right pb-1 font-semibold">Time</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...completedTrades].reverse().slice(0, 15).map((tr: any) => (
                                            <tr key={tr.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                                                <td className="py-1 text-slate-500">{tr.id}</td>
                                                <td className={`py-1 font-bold ${tr.side === "LONG" ? "text-emerald-400" : "text-red-400"}`}>{tr.side}</td>
                                                <td className="py-1 text-right font-mono text-slate-300">${tr.entry.toLocaleString()}</td>
                                                <td className="py-1 text-right font-mono text-slate-300">${tr.exit.toLocaleString()}</td>
                                                <td className={`py-1 text-right font-mono font-bold ${tr.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                                    {tr.pnl >= 0 ? "+" : ""}{tr.pnl.toFixed(4)}
                                                </td>
                                                <td className={`py-1 text-right text-[10px] ${tr.reason === "TP" ? "text-emerald-600" : "text-orange-500"}`}>{tr.reason}</td>
                                                <td className="py-1 text-right font-mono text-slate-600">{tr.time}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function Stat({ label, value, sub, highlight }: any) {
    return (
        <div>
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{label}</p>
            <p className={`text-sm font-black ${
                highlight === "green" ? "text-green-400" :
                highlight === "red" ? "text-red-400" :
                "text-white"
            }`}>{value}</p>
            {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
        </div>
    );
}
