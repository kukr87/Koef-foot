"""
Database layer — same schema as the original Telegram bot.
"""
import sqlite3
import asyncio
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple

DB_FILE = Path(__file__).parent / "bot.db"
tz = ZoneInfo("Europe/Moscow")

def get_connection():
    conn = sqlite3.connect(str(DB_FILE), timeout=10)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    c = conn.cursor()

    c.execute("""CREATE TABLE IF NOT EXISTS users (
        user_id      INTEGER PRIMARY KEY,
        username     TEXT DEFAULT '',
        first_name   TEXT DEFAULT '',
        subscription TEXT DEFAULT 'Free',
        end_date     TEXT DEFAULT NULL,
        reg_date     TEXT,
        referred_by  INTEGER DEFAULT NULL,
        streak_days  INTEGER DEFAULT 0,
        last_visit   TEXT DEFAULT NULL,
        status       TEXT DEFAULT 'active',
        notified_expire INTEGER DEFAULT 0
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS matches (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        name      TEXT,
        country   TEXT,
        league    TEXT,
        match_time TEXT DEFAULT '',
        text      TEXT,
        created_at TEXT
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS viewed_matches (
        user_id   INTEGER,
        match_id  INTEGER,
        viewed_date TEXT,
        PRIMARY KEY (user_id, match_id)
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS favorites (
        user_id  INTEGER,
        match_id INTEGER,
        added_at TEXT,
        PRIMARY KEY (user_id, match_id)
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS express_picks (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT,
        country    TEXT,
        league     TEXT,
        prediction TEXT,
        coef       TEXT,
        created_at TEXT
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS express_results (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        type       TEXT,
        coefs      TEXT,
        coef       REAL,
        result     TEXT DEFAULT 'pending',
        created_at TEXT
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS support_threads (
        thread_id INTEGER PRIMARY KEY,
        user_id   INTEGER,
        user_name TEXT,
        category  TEXT,
        created_at TEXT
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS support_messages (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id  INTEGER,
        sender     TEXT,
        text       TEXT,
        created_at TEXT
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS pending_payments (
        payment_id TEXT PRIMARY KEY,
        user_id    INTEGER,
        amount     REAL,
        status     TEXT DEFAULT 'pending',
        created_at TEXT
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS admin_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id   INTEGER,
        action     TEXT,
        details    TEXT,
        created_at TEXT
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS parsed_matches (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT,
        country     TEXT,
        country_en  TEXT,
        league      TEXT,
        league_id   INTEGER,
        match_time  TEXT DEFAULT '',
        match_date  TEXT,
        priority    INTEGER DEFAULT 99
    )""")

    conn.commit()
    conn.close()

# ---------- Async helpers (thread-safe via executor) ----------

async def db_execute(query: str, params: tuple = ()):
    loop = asyncio.get_event_loop()
    def _exec():
        conn = get_connection()
        conn.execute(query, params)
        conn.commit()
        conn.close()
    await loop.run_in_executor(None, _exec)

async def db_fetchone(query: str, params: tuple = ()) -> Optional[sqlite3.Row]:
    loop = asyncio.get_event_loop()
    def _fetch():
        conn = get_connection()
        c = conn.cursor()
        c.execute(query, params)
        row = c.fetchone()
        conn.close()
        return row
    return await loop.run_in_executor(None, _fetch)

async def db_fetchall(query: str, params: tuple = ()) -> List[sqlite3.Row]:
    loop = asyncio.get_event_loop()
    def _fetch():
        conn = get_connection()
        c = conn.cursor()
        c.execute(query, params)
        rows = c.fetchall()
        conn.close()
        return rows
    return await loop.run_in_executor(None, _fetch)

# ---------- User helpers ----------

async def get_or_create_user(user_id: int, first_name: str = "", username: str = "") -> dict:
    row = await db_fetchone("SELECT * FROM users WHERE user_id = ?", (user_id,))
    if row:
        return dict(row)
    now = datetime.now(tz).strftime("%Y-%m-%d")
    await db_execute(
        "INSERT INTO users (user_id, username, first_name, subscription, reg_date, status) "
        "VALUES (?, ?, ?, 'Free', ?, 'active')",
        (user_id, username, first_name, now)
    )
    return {
        "user_id": user_id, "username": username, "first_name": first_name,
        "subscription": "Free", "end_date": None, "reg_date": now,
        "referred_by": None, "streak_days": 0, "last_visit": None,
        "status": "active", "notified_expire": 0,
    }

async def update_user_subscription(user_id: int, sub: str, end_date: Optional[str] = None):
    await db_execute(
        "UPDATE users SET subscription = ?, end_date = ?, notified_expire = 0 WHERE user_id = ?",
        (sub, end_date, user_id)
    )

async def check_match_limit(user_id: int, match_id: int) -> bool:
    user = await get_or_create_user(user_id)
    if user["subscription"] == "Premium":
        return True
    today = str(datetime.now(tz).date())
    viewed = await db_fetchall(
        "SELECT match_id FROM viewed_matches WHERE user_id = ? AND viewed_date = ?",
        (user_id, today)
    )
    viewed_ids = [r[0] for r in viewed]
    if match_id in viewed_ids:
        return True
    if len(viewed_ids) >= 3:
        return False
    await db_execute(
        "INSERT OR IGNORE INTO viewed_matches (user_id, match_id, viewed_date) VALUES (?, ?, ?)",
        (user_id, match_id, today)
    )
    return True

async def update_streak(user_id: int):
    user = await get_or_create_user(user_id)
    today = datetime.now(tz).date()
    last_visit = user.get("last_visit")
    if last_visit:
        try:
            last_date = datetime.strptime(last_visit, "%Y-%m-%d").date()
            if last_date == today:
                return
            diff = (today - last_date).days
            new_streak = user.get("streak_days", 0) + 1 if diff == 1 else 1
        except ValueError:
            new_streak = 1
    else:
        new_streak = 1
    await db_execute(
        "UPDATE users SET last_visit = ?, streak_days = ? WHERE user_id = ?",
        (str(today), new_streak, user_id)
    )

async def activate_premium(user_id: int, days: int = 30) -> str:
    user = await get_or_create_user(user_id)
    if user["subscription"] == "Premium" and user["end_date"]:
        try:
            cur_end = datetime.strptime(user["end_date"], "%Y-%m-%d")
            if cur_end.date() > datetime.now(tz).date():
                new_end = (cur_end + timedelta(days=days)).strftime("%Y-%m-%d")
            else:
                new_end = (datetime.now(tz) + timedelta(days=days)).strftime("%Y-%m-%d")
        except ValueError:
            new_end = (datetime.now(tz) + timedelta(days=days)).strftime("%Y-%m-%d")
    else:
        new_end = (datetime.now(tz) + timedelta(days=days)).strftime("%Y-%m-%d")
    await update_user_subscription(user_id, "Premium", new_end)
    return new_end

async def calculate_express_stats() -> dict:
    rows = await db_fetchall(
        "SELECT coef, result FROM express_results WHERE result IN ('win', 'lose')"
    )
    total = len(rows)
    wins = sum(1 for r in rows if r[1] == "win")
    losses = sum(1 for r in rows if r[1] == "lose")
    winrate = (wins / total * 100) if total > 0 else 0
    profit = 0.0
    for coef, result in rows:
        if result == "win":
            profit += (float(coef) - 1)
        else:
            profit += (-1)
    roi = (profit / total * 100) if total > 0 else 0
    return {
        "total": total, "wins": wins, "losses": losses,
        "winrate": round(winrate, 1), "profit": round(profit, 2), "roi": round(roi, 1),
    }

async def log_admin_action(admin_id: int, action: str, details: str = ""):
    now = datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")
    await db_execute(
        "INSERT INTO admin_log (admin_id, action, details, created_at) VALUES (?, ?, ?, ?)",
        (admin_id, action, details, now)
    )
