"""
YooKassa payment integration (same logic as original bot).
"""
import base64
import logging
from datetime import datetime
from zoneinfo import ZoneInfo
import aiohttp
from config import (
    YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY, BOT_USERNAME, PREMIUM_PRICE
)
from database import db_execute, db_fetchone, activate_premium

logger = logging.getLogger("yookassa")
tz = ZoneInfo("Europe/Moscow")


async def create_payment(user_id: int, amount: float = None) -> dict | None:
    amount = amount or PREMIUM_PRICE
    if not YOOKASSA_SHOP_ID or not YOOKASSA_SECRET_KEY:
        logger.error("YooKassa credentials missing")
        return None

    auth_string = f"{YOOKASSA_SHOP_ID}:{YOOKASSA_SECRET_KEY}"
    auth_header = base64.b64encode(auth_string.encode()).decode()

    url = "https://api.yookassa.ru/v3/payments"
    idempotence_key = f"{user_id}-{int(datetime.now(tz).timestamp())}"

    payload = {
        "amount": {"value": f"{amount:.2f}", "currency": "RUB"},
        "confirmation": {
            "type": "redirect",
            "return_url": f"https://t.me/{BOT_USERNAME}"
        },
        "capture": True,
        "metadata": {"user_id": str(user_id)},
        "description": "Premium на 30 дней",
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Basic {auth_header}",
        "Idempotence-Key": idempotence_key,
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers) as resp:
                data = await resp.json()
                if resp.status in (200, 201):
                    pid = data.get("id")
                    curl = data.get("confirmation", {}).get("confirmation_url")
                    if pid and curl:
                        now = datetime.now(tz).strftime("%Y-%m-%d %H:%M")
                        await db_execute(
                            "INSERT OR REPLACE INTO pending_payments "
                            "(payment_id, user_id, amount, status, created_at) VALUES (?, ?, ?, 'pending', ?)",
                            (pid, user_id, amount, now)
                        )
                        return {"payment_id": pid, "confirmation_url": curl}
                logger.error("YooKassa error: %s %s", resp.status, data)
                return None
    except Exception as e:
        logger.exception("YooKassa exception: %s", e)
        return None


async def check_payment(payment_id: str) -> str:
    if not YOOKASSA_SHOP_ID or not YOOKASSA_SECRET_KEY:
        return "error"
    auth_string = f"{YOOKASSA_SHOP_ID}:{YOOKASSA_SECRET_KEY}"
    auth_header = base64.b64encode(auth_string.encode()).decode()
    url = f"https://api.yookassa.ru/v3/payments/{payment_id}"
    headers = {
        "Authorization": f"Basic {auth_header}",
        "Content-Type": "application/json",
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as resp:
                data = await resp.json()
                if resp.status == 200:
                    return data.get("status", "unknown")
                return "error"
    except Exception:
        return "error"


async def process_successful_payment(payment_id: str, user_id: int) -> str | None:
    row = await db_fetchone(
        "SELECT status FROM pending_payments WHERE payment_id = ?", (payment_id,)
    )
    if row and row["status"] == "succeeded":
        return None  # already processed
    end_date = await activate_premium(user_id, 30)
    await db_execute(
        "UPDATE pending_payments SET status = 'succeeded' WHERE payment_id = ?",
        (payment_id,)
    )
    return end_date
