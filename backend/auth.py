"""
Telegram WebApp authentication — validate initData.
"""
import hmac
import hashlib
import json
import time
from urllib.parse import parse_qsl
from typing import Optional, Dict, Any
from fastapi import HTTPException, Header, Depends
from config import BOT_TOKEN, ADMIN_ID


def validate_init_data(init_data: str, bot_token: str, max_age: int = 86400) -> Dict[str, Any]:
    """
    Validate Telegram WebApp initData according to official docs.
    Returns parsed user dict on success.
    """
    if not init_data or not bot_token:
        raise HTTPException(status_code=401, detail="Missing auth data")

    parsed = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = parsed.pop("hash", None)
    if not received_hash:
        raise HTTPException(status_code=401, detail="No hash in initData")

    # Check auth_date freshness
    auth_date = int(parsed.get("auth_date", 0))
    if time.time() - auth_date > max_age:
        raise HTTPException(status_code=401, detail="initData expired")

    # Build data-check-string
    data_check_arr = [f"{k}={v}" for k, v in sorted(parsed.items())]
    data_check_string = "\n".join(data_check_arr)

    # Secret key = HMAC-SHA256 of bot_token with key "WebAppData"
    secret_key = hmac.new(
        b"WebAppData", bot_token.encode(), hashlib.sha256
    ).digest()
    calculated_hash = hmac.new(
        secret_key, data_check_string.encode(), hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(calculated_hash, received_hash):
        raise HTTPException(status_code=401, detail="Invalid initData signature")

    user_raw = parsed.get("user")
    if not user_raw:
        raise HTTPException(status_code=401, detail="No user in initData")

    try:
        user = json.loads(user_raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=401, detail="Invalid user JSON")

    return user


async def get_current_user(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
) -> Dict[str, Any]:
    """FastAPI dependency — extracts and validates Telegram user."""
    if not x_telegram_init_data:
        # Dev fallback when BOT_TOKEN is empty (local testing)
        if not BOT_TOKEN:
            return {
                "id": 123456789,
                "first_name": "Dev",
                "username": "devuser",
                "language_code": "ru",
            }
        raise HTTPException(status_code=401, detail="X-Telegram-Init-Data header required")

    user = validate_init_data(x_telegram_init_data, BOT_TOKEN)
    return user


def is_admin(user_id: int) -> bool:
    return user_id == ADMIN_ID or str(user_id) == str(ADMIN_ID)
