SUPPORTED_CURRENCIES = ["USD", "NGN", "EUR", "GBP", "CNY", "JPY", "CAD", "AUD", "CHF", "ZAR"]

CURRENCY_SYMBOLS = {
    "USD": "$",
    "NGN": "₦",
    "EUR": "€",
    "GBP": "£",
    "CNY": "¥",
    "JPY": "¥",
    "CAD": "C$",
    "AUD": "A$",
    "CHF": "Fr",
    "ZAR": "R",
}

CURRENCY_TO_USD = {
    "USD": 1.0,
    "NGN": 0.000645,
    "EUR": 1.09,
    "GBP": 1.27,
    "CNY": 0.138,
    "JPY": 0.0066,
    "CAD": 0.74,
    "AUD": 0.65,
    "CHF": 1.13,
    "ZAR": 0.054,
}


def to_usd(amount: float, currency: str) -> float:
    rate = CURRENCY_TO_USD.get(currency.upper(), 1.0)
    return amount * rate


def from_usd(amount: float, currency: str) -> float:
    rate = CURRENCY_TO_USD.get(currency.upper(), 1.0)
    return amount / rate if rate else amount


def currency_symbol(currency: str) -> str:
    return CURRENCY_SYMBOLS.get(currency.upper(), currency)
