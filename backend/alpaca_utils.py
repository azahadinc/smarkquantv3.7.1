import os


def get_alpaca_credentials():
    """Return Alpaca API key and secret from supported env var names.

    Priority:
    1. ALPACA_API_KEY / ALPACA_SECRET_KEY
    2. APCA_API_KEY_ID / APCA_API_SECRET_KEY
    """
    api_key = os.getenv("ALPACA_API_KEY") or os.getenv("APCA_API_KEY_ID")
    secret_key = os.getenv("ALPACA_SECRET_KEY") or os.getenv("APCA_API_SECRET_KEY")

    if not api_key or not secret_key:
        return None, None

    return api_key.strip(), secret_key.strip()


def alpaca_keys_configured():
    api_key, secret_key = get_alpaca_credentials()
    return bool(api_key and secret_key)
