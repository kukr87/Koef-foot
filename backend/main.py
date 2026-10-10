"""
Koefi WebApp Backend — FastAPI
Exact functional parity with the original Telegram bot.
"""
import asyncio
import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from typing import Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pathlib import Path

from config import (
    ADMIN_ID, PREMIUM_PRICE, FRONTEND_ORIGIN, BOT_USERNAME,
    get_flag, SUPPORT_CATEGORIES, LEAGUE_PRIORITIES
)
from auth import get_current_user, is_admin
from database import (
    init_db, get_or_create_user, update_user_subscription, check_match_limit,
    update_streak, activate_premium, calculate_express_stats, log_admin_action,
    db_execute, db_fetchone, db_fetchall
)
from services.yookassa import create_payment, check_payment, process_successful_payment
from services import parser as match_parser

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger("koefi-webapp")
tz = ZoneInfo("Europe/Moscow")

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("Database initialized")
    # Background payment checker
    task = asyncio.create_task(check_pending_payments_loop())
    yield
    task.cancel()


app = FastAPI(title="Koefi WebApp API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN] if FRONTEND_ORIGIN != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Frontend static files ----------
# CSS, JS, assets must be served at the same paths as in index.html
if FRONTEND_DIR.exists():
    css_dir = FRONTEND_DIR / "css"
    js_dir = FRONTEND_DIR / "js"
    assets_dir = FRONTEND_DIR / "assets"
    if css_dir.exists():
        app.mount("/css", StaticFiles(directory=str(css_dir)), name="css")
    if js_dir.exists():
        app.mount("/js", StaticFiles(directory=str(js_dir)), name="js")
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")


@app.get("/")
async def root():
    index = FRONTEND_DIR / "index.html"
    if index.exists():
        return FileResponse(str(index), media_type="text/html")
    return {"status": "ok", "message": "Koefi WebApp API"}


@app.get("/index.html")
async def index_html():
    index = FRONTEND_DIR / "index.html"
    if index.exists():
        return FileResponse(str(index), media_type="text/html")
    raise HTTPException(404, "Not found")


# ==================== MODELS ====================

class SupportMessage(BaseModel):
    category: str
    text: str

class AdminMatchCreate(BaseModel):
    name: str
    country: str
    league: str
    match_time: str = ""
    text: str = ""

class AdminMatchText(BaseModel):
    text: str

class ExpressPick(BaseModel):
    match_id: int
    prediction: str
    coef: str

class ExpressResult(BaseModel):
    type: str  # double | triple
    coefs: List[float]
    result: str  # win | lose

class PremiumGrant(BaseModel):
    user_id: int
    days: int = 30

class NewsCreate(BaseModel):
    text: str


# ==================== BACKGROUND ====================

async def check_pending_payments_loop():
    while True:
        try:
            rows = await db_fetchall(
                "SELECT payment_id, user_id FROM pending_payments WHERE status = 'pending'"
            )
            for row in rows:
                status = await check_payment(row["payment_id"])
                if status == "succeeded":
                    await process_successful_payment(row["payment_id"], row["user_id"])
                elif status == "canceled":
                    await db_execute(
                        "UPDATE pending_payments SET status = 'canceled' WHERE payment_id = ?",
                        (row["payment_id"],)
                    )
        except Exception as e:
            logger.exception("payment loop: %s", e)
        await asyncio.sleep(30)


# ==================== USER ====================

@app.get("/api/me")
async def api_me(user=Depends(get_current_user)):
    uid = user["id"]
    u = await get_or_create_user(uid, user.get("first_name", ""), user.get("username", ""))
    await update_streak(uid)

    ref_rows = await db_fetchall("SELECT user_id FROM users WHERE referred_by = ?", (uid,))
    fav_row = await db_fetchone("SELECT COUNT(*) as c FROM favorites WHERE user_id = ?", (uid,))
    today = str(datetime.now(tz).date())
    viewed_row = await db_fetchone(
        "SELECT COUNT(*) as c FROM viewed_matches WHERE user_id = ? AND viewed_date = ?",
        (uid, today)
    )
    total_users = (await db_fetchone("SELECT COUNT(*) as c FROM users"))["c"]
    premium_users = (await db_fetchone("SELECT COUNT(*) as c FROM users WHERE subscription = 'Premium'"))["c"]
    total_matches = (await db_fetchone("SELECT COUNT(*) as c FROM matches"))["c"]

    days_in_project = 0
    if u.get("reg_date"):
        try:
            reg = datetime.strptime(u["reg_date"], "%Y-%m-%d").date()
            days_in_project = (datetime.now(tz).date() - reg).days
        except ValueError:
            pass

    is_prem = u["subscription"] == "Premium"
    viewed_today = viewed_row["c"] if viewed_row else 0

    return {
        "user_id": uid,
        "first_name": u["first_name"] or user.get("first_name", ""),
        "username": u["username"],
        "subscription": u["subscription"],
        "end_date": u["end_date"],
        "reg_date": u["reg_date"],
        "streak_days": u["streak_days"],
        "matches_left": "∞" if is_prem else max(0, 3 - viewed_today),
        "days_in_project": days_in_project,
        "ref_count": len(ref_rows),
        "fav_count": fav_row["c"] if fav_row else 0,
        "total_users": total_users,
        "premium_users": premium_users,
        "total_matches": total_matches,
        "is_admin": is_admin(uid),
        "ref_link": f"https://t.me/{BOT_USERNAME}?start=ref_{uid}",
        "premium_price": PREMIUM_PRICE,
        "photo_url": user.get("photo_url") or "",
        "channel_url": "https://t.me/koefchat",
    }


@app.post("/api/start")
async def api_start(referrer: Optional[int] = Query(None), user=Depends(get_current_user)):
    """Called on first open — handles referral + welcome Test Drive for new users."""
    uid = user["id"]
    existing = await db_fetchone("SELECT user_id FROM users WHERE user_id = ?", (uid,))
    is_new = existing is None

    await get_or_create_user(uid, user.get("first_name", ""), user.get("username", ""))
    bonus_end = None

    if is_new:
        # Test Drive — 30 days Premium for new users (same as bot)
        bonus_end = await activate_premium(uid, 30)

    if referrer and referrer != uid:
        u = await get_or_create_user(uid)
        if not u.get("referred_by"):
            await db_execute("UPDATE users SET referred_by = ? WHERE user_id = ?", (referrer, uid))
            # Referral bonus: +3 days Premium
            ref_user = await get_or_create_user(referrer)
            if ref_user["subscription"] == "Free":
                new_end = (datetime.now(tz) + timedelta(days=3)).strftime("%Y-%m-%d")
            else:
                try:
                    cur = datetime.strptime(ref_user["end_date"] or "1970-01-01", "%Y-%m-%d")
                    new_end = (cur + timedelta(days=3)).strftime("%Y-%m-%d")
                except ValueError:
                    new_end = (datetime.now(tz) + timedelta(days=3)).strftime("%Y-%m-%d")
            await update_user_subscription(referrer, "Premium", new_end)

    await update_streak(uid)
    return {"is_new": is_new, "bonus_end": bonus_end}


# ==================== MATCHES ====================

def _sort_key(country: str, league: str):
    return (LEAGUE_PRIORITIES.get(league, 99), country, league)


@app.get("/api/matches")
async def api_matches(user=Depends(get_current_user)):
    rows = await db_fetchall("SELECT * FROM matches ORDER BY country, league")
    groups = {}
    for r in rows:
        key = f"{r['country']}|{r['league']}"
        hl = r["home_logo"] if "home_logo" in r.keys() else ""
        al = r["away_logo"] if "away_logo" in r.keys() else ""
        groups.setdefault(key, []).append({
            "id": r["id"], "name": r["name"], "match_time": r["match_time"] or "",
            "home_logo": hl or "", "away_logo": al or "",
        })

    sorted_keys = sorted(groups.keys(), key=lambda k: _sort_key(*k.split("|", 1)))
    result = []
    for key in sorted_keys:
        country, league = key.split("|", 1)
        result.append({
            "country": country,
            "league": league,
            "flag": get_flag(country),
            "count": len(groups[key]),
            "matches": groups[key],
        })
    return {"groups": result}


@app.get("/api/matches/{match_id}")
async def api_match_detail(match_id: int, user=Depends(get_current_user)):
    row = await db_fetchone("SELECT * FROM matches WHERE id = ?", (match_id,))
    if not row:
        raise HTTPException(404, "Match not found")

    allowed = await check_match_limit(user["id"], match_id)
    if not allowed:
        raise HTTPException(403, "Daily limit reached (3 matches). Buy Premium.")

    fav = await db_fetchone(
        "SELECT 1 FROM favorites WHERE user_id = ? AND match_id = ?",
        (user["id"], match_id)
    )
    hl = row["home_logo"] if "home_logo" in row.keys() else ""
    al = row["away_logo"] if "away_logo" in row.keys() else ""
    return {
        "id": row["id"],
        "name": row["name"],
        "country": row["country"],
        "league": row["league"],
        "flag": get_flag(row["country"] or ""),
        "match_time": row["match_time"] or "",
        "text": row["text"] or "",
        "is_favorite": bool(fav),
        "home_logo": hl or "",
        "away_logo": al or "",
    }


@app.post("/api/matches/{match_id}/favorite")
async def api_add_fav(match_id: int, user=Depends(get_current_user)):
    now = datetime.now(tz).strftime("%Y-%m-%d %H:%M")
    await db_execute(
        "INSERT OR IGNORE INTO favorites (user_id, match_id, added_at) VALUES (?, ?, ?)",
        (user["id"], match_id, now)
    )
    return {"ok": True}


@app.delete("/api/matches/{match_id}/favorite")
async def api_remove_fav(match_id: int, user=Depends(get_current_user)):
    await db_execute(
        "DELETE FROM favorites WHERE user_id = ? AND match_id = ?",
        (user["id"], match_id)
    )
    return {"ok": True}


@app.get("/api/favorites")
async def api_favorites(user=Depends(get_current_user)):
    rows = await db_fetchall(
        "SELECT m.id, m.name, m.country, m.match_time FROM matches m "
        "INNER JOIN favorites f ON m.id = f.match_id WHERE f.user_id = ?",
        (user["id"],)
    )
    return {
        "items": [
            {
                "id": r["id"], "name": r["name"], "country": r["country"],
                "flag": get_flag(r["country"]), "match_time": r["match_time"] or "",
            }
            for r in rows
        ]
    }


# ==================== EXPRESS ====================

@app.get("/api/express")
async def api_express(page: int = 0, user=Depends(get_current_user)):
    u = await get_or_create_user(user["id"])
    is_prem = u["subscription"] == "Premium"

    picks_raw = await db_fetchall(
        "SELECT name, country, league, prediction, coef FROM express_picks ORDER BY id"
    )
    picks = []
    total_coef = 1.0
    if picks_raw:
        if is_prem:
            for p in picks_raw:
                picks.append({
                    "name": p["name"], "country": p["country"] or "",
                    "league": p["league"] or "", "flag": get_flag(p["country"] or ""),
                    "prediction": p["prediction"] or "", "coef": p["coef"] or "",
                })
                try:
                    total_coef *= float(p["coef"])
                except (ValueError, TypeError):
                    pass
        else:
            picks = None  # locked

    stats = await calculate_express_stats()

    results = await db_fetchall(
        "SELECT id, type, coefs, coef, result, created_at FROM express_results "
        "WHERE result IN ('win', 'lose') ORDER BY id DESC"
    )
    per_page = 7
    total_pages = max(1, (len(results) + per_page - 1) // per_page) if results else 1
    page = max(0, min(page, total_pages - 1))
    page_results = results[page * per_page : (page + 1) * per_page]

    history = [
        {
            "id": r["id"],
            "type": r["type"],
            "type_label": "Двойник" if r["type"] == "double" else "Тройник",
            "coef": float(r["coef"]),
            "result": r["result"],
            "date": (r["created_at"] or "")[:10],
        }
        for r in page_results
    ]

    return {
        "picks": picks,
        "total_coef": round(total_coef, 2) if picks else None,
        "locked": picks is None and bool(picks_raw),
        "stats": stats,
        "history": history,
        "page": page,
        "total_pages": total_pages,
    }


# ==================== PREMIUM / PAYMENT ====================

@app.post("/api/premium/create")
async def api_create_payment(user=Depends(get_current_user)):
    result = await create_payment(user["id"], PREMIUM_PRICE)
    if not result:
        raise HTTPException(500, "Could not create payment")
    return result


@app.get("/api/premium/check/{payment_id}")
async def api_check_payment(payment_id: str, user=Depends(get_current_user)):
    status = await check_payment(payment_id)
    if status == "succeeded":
        row = await db_fetchone(
            "SELECT user_id FROM pending_payments WHERE payment_id = ?", (payment_id,)
        )
        if row:
            end = await process_successful_payment(payment_id, row["user_id"])
            return {"status": "succeeded", "end_date": end}
    return {"status": status}


# ==================== SUPPORT ====================

@app.post("/api/support")
async def api_support(body: SupportMessage, user=Depends(get_current_user)):
    if body.category not in SUPPORT_CATEGORIES:
        raise HTTPException(400, "Invalid category")
    uid = user["id"]
    user_name = user.get("first_name", "User")
    now = datetime.now(tz).strftime("%Y-%m-%d %H:%M")

    thread = await db_fetchone("SELECT thread_id FROM support_threads WHERE thread_id = ?", (uid,))
    if not thread:
        await db_execute(
            "INSERT INTO support_threads (thread_id, user_id, user_name, category, created_at) VALUES (?, ?, ?, ?, ?)",
            (uid, uid, user_name, body.category, now)
        )
    await db_execute(
        "INSERT INTO support_messages (thread_id, sender, text, created_at) VALUES (?, 'user', ?, ?)",
        (uid, body.text, now)
    )
    return {"ok": True, "message": "Сообщение отправлено!"}


@app.get("/api/support/categories")
async def api_support_cats():
    return {"categories": SUPPORT_CATEGORIES}


# ==================== ADMIN ====================

def require_admin(user):
    if not is_admin(user["id"]):
        raise HTTPException(403, "Admin only")


@app.get("/api/admin/matches")
async def admin_list_matches(user=Depends(get_current_user)):
    require_admin(user)
    rows = await db_fetchall("SELECT id, name, country, league, match_time, text FROM matches ORDER BY id DESC")
    return {"items": [dict(r) for r in rows]}


@app.post("/api/admin/matches")
async def admin_create_match(body: AdminMatchCreate, user=Depends(get_current_user)):
    require_admin(user)
    now = datetime.now(tz).strftime("%Y-%m-%d %H:%M")
    await db_execute(
        "INSERT INTO matches (name, country, league, match_time, text, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (body.name, body.country, body.league, body.match_time, body.text, now)
    )
    await log_admin_action(user["id"], "add_match", body.name)
    return {"ok": True}


@app.put("/api/admin/matches/{match_id}/text")
async def admin_set_text(match_id: int, body: AdminMatchText, user=Depends(get_current_user)):
    require_admin(user)
    await db_execute("UPDATE matches SET text = ? WHERE id = ?", (body.text, match_id))
    await log_admin_action(user["id"], "edit_text", str(match_id))
    return {"ok": True}


@app.delete("/api/admin/matches/{match_id}")
async def admin_delete_match(match_id: int, user=Depends(get_current_user)):
    require_admin(user)
    await db_execute("DELETE FROM matches WHERE id = ?", (match_id,))
    await db_execute("DELETE FROM viewed_matches WHERE match_id = ?", (match_id,))
    await db_execute("DELETE FROM favorites WHERE match_id = ?", (match_id,))
    await log_admin_action(user["id"], "delete_match", str(match_id))
    return {"ok": True}


@app.delete("/api/admin/matches")
async def admin_clear_matches(user=Depends(get_current_user)):
    require_admin(user)
    await db_execute("DELETE FROM matches")
    await db_execute("DELETE FROM viewed_matches")
    await db_execute("DELETE FROM favorites")
    await log_admin_action(user["id"], "delete_all_matches", "")
    return {"ok": True}


@app.get("/api/admin/express")
async def admin_express(user=Depends(get_current_user)):
    require_admin(user)
    picks = await db_fetchall("SELECT * FROM express_picks ORDER BY id")
    stats = await calculate_express_stats()
    return {"picks": [dict(p) for p in picks], "stats": stats}


@app.post("/api/admin/express")
async def admin_add_express(body: ExpressPick, user=Depends(get_current_user)):
    require_admin(user)
    row = await db_fetchone("SELECT name, country, league FROM matches WHERE id = ?", (body.match_id,))
    if not row:
        raise HTTPException(404, "Match not found")
    now = datetime.now(tz).strftime("%Y-%m-%d %H:%M")
    await db_execute(
        "INSERT INTO express_picks (name, country, league, prediction, coef, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (row["name"], row["country"], row["league"], body.prediction, body.coef, now)
    )
    await log_admin_action(user["id"], "add_express", row["name"])
    return {"ok": True}


@app.delete("/api/admin/express")
async def admin_clear_express(user=Depends(get_current_user)):
    require_admin(user)
    await db_execute("DELETE FROM express_picks")
    await log_admin_action(user["id"], "clear_express", "")
    return {"ok": True}


@app.post("/api/admin/express/result")
async def admin_add_result(body: ExpressResult, user=Depends(get_current_user)):
    require_admin(user)
    if body.type not in ("double", "triple") or body.result not in ("win", "lose"):
        raise HTTPException(400, "Invalid type or result")
    total = 1.0
    for c in body.coefs:
        total *= c
    total = round(total, 2)
    coefs_str = ", ".join(f"{c:.2f}" for c in body.coefs)
    now = datetime.now(tz).strftime("%Y-%m-%d %H:%M")
    await db_execute(
        "INSERT INTO express_results (type, coefs, coef, result, created_at) VALUES (?, ?, ?, ?, ?)",
        (body.type, coefs_str, total, body.result, now)
    )
    await log_admin_action(user["id"], "add_result", f"{body.type} {body.result}")
    return {"ok": True, "total_coef": total}


@app.post("/api/admin/premium/grant")
async def admin_grant_premium(body: PremiumGrant, user=Depends(get_current_user)):
    require_admin(user)
    end = await activate_premium(body.user_id, body.days)
    await log_admin_action(user["id"], "give_premium", str(body.user_id))
    return {"ok": True, "end_date": end}


@app.post("/api/admin/premium/revoke")
async def admin_revoke_premium(body: PremiumGrant, user=Depends(get_current_user)):
    require_admin(user)
    await update_user_subscription(body.user_id, "Free", None)
    await log_admin_action(user["id"], "remove_premium", str(body.user_id))
    return {"ok": True}


@app.get("/api/admin/support")
async def admin_support_list(user=Depends(get_current_user)):
    require_admin(user)
    rows = await db_fetchall(
        "SELECT thread_id, user_name, category, created_at FROM support_threads ORDER BY created_at DESC"
    )
    return {
        "threads": [
            {
                "thread_id": r["thread_id"],
                "user_name": r["user_name"],
                "category": SUPPORT_CATEGORIES.get(r["category"], r["category"]),
                "created_at": r["created_at"],
            }
            for r in rows
        ]
    }


@app.get("/api/admin/support/{thread_id}")
async def admin_support_thread(thread_id: int, user=Depends(get_current_user)):
    require_admin(user)
    msgs = await db_fetchall(
        "SELECT sender, text, created_at FROM support_messages WHERE thread_id = ? ORDER BY id",
        (thread_id,)
    )
    return {"messages": [dict(m) for m in msgs]}


@app.post("/api/admin/support/{thread_id}/reply")
async def admin_support_reply(thread_id: int, body: AdminMatchText, user=Depends(get_current_user)):
    require_admin(user)
    now = datetime.now(tz).strftime("%Y-%m-%d %H:%M")
    await db_execute(
        "INSERT INTO support_messages (thread_id, sender, text, created_at) VALUES (?, 'admin', ?, ?)",
        (thread_id, body.text, now)
    )
    await log_admin_action(user["id"], "reply_support", str(thread_id))
    return {"ok": True}


@app.get("/api/admin/logs")
async def admin_logs(user=Depends(get_current_user)):
    require_admin(user)
    rows = await db_fetchall(
        "SELECT admin_id, action, details, created_at FROM admin_log ORDER BY id DESC LIMIT 30"
    )
    return {"logs": [dict(r) for r in rows]}


# ==================== NEWS ====================

@app.get("/api/news")
async def api_news(user=Depends(get_current_user)):
    rows = await db_fetchall("SELECT id, number, text, created_at FROM news ORDER BY number DESC, id DESC LIMIT 50")
    return {
        "items": [
            {
                "id": r["id"],
                "number": r["number"],
                "text": r["text"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]
    }


@app.post("/api/admin/news")
async def admin_create_news(body: NewsCreate, user=Depends(get_current_user)):
    require_admin(user)
    if not body.text.strip():
        raise HTTPException(400, "Empty news text")
    max_row = await db_fetchone("SELECT MAX(number) as m FROM news")
    num = (max_row["m"] or 0) + 1 if max_row else 1
    now = datetime.now(tz).strftime("%Y-%m-%d %H:%M")
    await db_execute(
        "INSERT INTO news (number, text, created_at) VALUES (?, ?, ?)",
        (num, body.text.strip(), now)
    )
    await log_admin_action(user["id"], "add_news", f"#{num}")
    return {"ok": True, "number": num}


@app.delete("/api/admin/news/{news_id}")
async def admin_delete_news(news_id: int, user=Depends(get_current_user)):
    require_admin(user)
    await db_execute("DELETE FROM news WHERE id = ?", (news_id,))
    await log_admin_action(user["id"], "delete_news", str(news_id))
    return {"ok": True}


@app.get("/api/admin/news")
async def admin_list_news(user=Depends(get_current_user)):
    require_admin(user)
    rows = await db_fetchall("SELECT id, number, text, created_at FROM news ORDER BY number DESC")
    return {"items": [dict(r) for r in rows]}


# ==================== PARSER ====================

@app.post("/api/admin/parser/fetch")
async def admin_parser_fetch(date: str = Query(...), user=Depends(get_current_user)):
    require_admin(user)
    if not date:
        raise HTTPException(400, "date required YYYY-MM-DD")
    matches = await match_parser.fetch_matches_from_api(date)
    if not matches:
        return {"ok": False, "count": 0, "message": "Нет матчей на эту дату"}
    leagues = await match_parser.fetch_leagues_from_api()
    await match_parser.save_parsed_to_temp(matches, date, leagues)
    total = await db_fetchone("SELECT COUNT(*) as c FROM parsed_matches")
    await log_admin_action(user["id"], "parser_fetch", f"{date}: {total['c'] if total else 0}")
    return {"ok": True, "count": total["c"] if total else 0}


@app.get("/api/admin/parser/list")
async def admin_parser_list(page: int = 0, user=Depends(get_current_user)):
    require_admin(user)
    return await match_parser.list_parsed(page=page)


@app.get("/api/admin/parser/leagues")
async def admin_parser_leagues(user=Depends(get_current_user)):
    require_admin(user)
    return {"leagues": await match_parser.list_parsed_leagues()}


@app.post("/api/admin/parser/add")
async def admin_parser_add(
    parsed_id: Optional[int] = None,
    league_id: Optional[int] = None,
    all_matches: bool = False,
    user=Depends(get_current_user)
):
    require_admin(user)
    if parsed_id:
        count = await match_parser.move_parsed_to_matches(parsed_id=parsed_id)
    elif league_id:
        count = await match_parser.move_parsed_to_matches(league_id=league_id)
    elif all_matches:
        count = await match_parser.move_parsed_to_matches(limit=80)
        await db_execute("DELETE FROM parsed_matches")
    else:
        raise HTTPException(400, "Specify parsed_id, league_id or all_matches")
    await log_admin_action(user["id"], "parser_add", f"count={count}")
    return {"ok": True, "count": count}




if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
