"""
Match parser from sports.bzzoiro.com (BSD API) — same logic as original bot.
"""
import logging
from datetime import datetime
from zoneinfo import ZoneInfo
import aiohttp
from config import BSD_API_KEY, LEAGUE_PRIORITIES, get_flag
from database import db_execute, db_fetchall, db_fetchone

logger = logging.getLogger("parser")
tz = ZoneInfo("Europe/Moscow")

COUNTRY_NORMALIZE = {
    "Czech-Republic": "Czech Republic",
    "Czech Republic": "Czech Republic",
    "USA": "USA",
    "United States": "USA",
    "UK": "England",
    "World": "World",
    "Europe": "Europe",
}


async def fetch_leagues_from_api() -> dict:
    if not BSD_API_KEY or not BSD_API_KEY.strip():
        logger.error("BSD_API_KEY not set")
        return {}
    headers = {"Authorization": f"Token {BSD_API_KEY.strip()}"}
    base_url = "https://sports.bzzoiro.com/api/v2/leagues/"
    leagues = {}
    offset = 0
    limit = 200
    async with aiohttp.ClientSession() as session:
        while True:
            try:
                async with session.get(base_url, headers=headers, params={"limit": limit, "offset": offset}) as resp:
                    if resp.status != 200:
                        logger.error("BSD leagues HTTP %s", resp.status)
                        break
                    data = await resp.json()
                    for lg in data.get("results", []):
                        leagues[lg["id"]] = {
                            "name": lg.get("name", ""),
                            "country": lg.get("country", ""),
                        }
                    if data.get("next"):
                        offset += limit
                    else:
                        break
            except Exception as e:
                logger.exception("BSD leagues: %s", e)
                break
    logger.info("BSD leagues: %d", len(leagues))
    return leagues


async def fetch_matches_from_api(date_str: str) -> list:
    if not BSD_API_KEY or not BSD_API_KEY.strip():
        return []
    headers = {"Authorization": f"Token {BSD_API_KEY.strip()}"}
    base_url = "https://sports.bzzoiro.com/api/v2/events/"
    all_matches = []
    offset = 0
    limit = 200
    async with aiohttp.ClientSession() as session:
        while True:
            params = {"date_from": date_str, "date_to": date_str, "limit": limit, "offset": offset}
            try:
                async with session.get(base_url, headers=headers, params=params) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        all_matches.extend(data.get("results", []))
                        if data.get("next"):
                            offset += limit
                        else:
                            break
                    elif resp.status == 429:
                        import asyncio
                        await asyncio.sleep(60)
                        continue
                    else:
                        logger.error("BSD events HTTP %s", resp.status)
                        break
            except Exception as e:
                logger.exception("BSD events: %s", e)
                break
    logger.info("BSD matches: %d", len(all_matches))
    return all_matches


def _extract_logo(match: dict, side: str) -> str:
    """Try common logo field names from API."""
    keys = [
        f"{side}_logo", f"{side}_team_logo", f"{side}_crest",
        f"{side}_team_image", f"{side}_image",
    ]
    for k in keys:
        v = match.get(k)
        if v and isinstance(v, str) and v.startswith("http"):
            return v
    # nested objects
    for nest in (f"{side}_team", side, f"{side}_club"):
        obj = match.get(nest)
        if isinstance(obj, dict):
            for k in ("logo", "image", "crest", "badge", "photo"):
                v = obj.get(k)
                if v and isinstance(v, str) and (v.startswith("http") or v.startswith("//")):
                    return v if v.startswith("http") else "https:" + v
    return ""


async def save_parsed_to_temp(matches_data: list, date_str: str, leagues_map: dict):
    await db_execute("DELETE FROM parsed_matches")
    for match in matches_data:
        home = match.get("home_team") or match.get("home") or "?"
        away = match.get("away_team") or match.get("away") or "?"
        if isinstance(home, dict):
            home = home.get("name", "?")
        if isinstance(away, dict):
            away = away.get("name", "?")
        league_id = match.get("league_id") or 0
        league_info = leagues_map.get(league_id, {})
        league_name = league_info.get("name") or match.get("league") or "Unknown"
        country_en = league_info.get("country") or match.get("country") or ""
        country_en = COUNTRY_NORMALIZE.get(country_en, country_en)
        priority = LEAGUE_PRIORITIES.get(league_name, 99)

        match_time = ""
        event_date = match.get("event_date") or match.get("date") or match.get("start") or ""
        if event_date:
            try:
                dt = datetime.fromisoformat(str(event_date).replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=ZoneInfo("UTC"))
                match_time = dt.astimezone(tz).strftime("%H:%M")
            except Exception:
                pass

        home_logo = _extract_logo(match, "home")
        away_logo = _extract_logo(match, "away")
        name = f"{home} — {away}"

        await db_execute(
            "INSERT INTO parsed_matches (name, country, country_en, league, league_id, match_time, match_date, priority, home_logo, away_logo) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (name, country_en, country_en, league_name, league_id, match_time, date_str, priority, home_logo, away_logo)
        )


async def move_parsed_to_matches(league_id=None, limit=80, parsed_id=None) -> int:
    now = datetime.now(tz).strftime("%Y-%m-%d %H:%M")
    if parsed_id:
        rows = await db_fetchall(
            "SELECT name, country, league, match_time, home_logo, away_logo FROM parsed_matches WHERE id = ?",
            (parsed_id,)
        )
    elif league_id:
        rows = await db_fetchall(
            "SELECT name, country, league, match_time, home_logo, away_logo FROM parsed_matches WHERE league_id = ? ORDER BY priority ASC",
            (league_id,)
        )
    else:
        rows = await db_fetchall(
            "SELECT name, country, league, match_time, home_logo, away_logo FROM parsed_matches ORDER BY priority ASC LIMIT ?",
            (limit,)
        )
    count = 0
    for row in rows:
        name, country, league, mtime = row["name"], row["country"], row["league"], row["match_time"]
        home_logo = row["home_logo"] if "home_logo" in row.keys() else ""
        away_logo = row["away_logo"] if "away_logo" in row.keys() else ""
        existing = await db_fetchone("SELECT id FROM matches WHERE name = ? AND league = ?", (name, league))
        if existing:
            continue
        await db_execute(
            "INSERT INTO matches (name, country, league, match_time, text, created_at, home_logo, away_logo) VALUES (?, ?, ?, ?, '', ?, ?, ?)",
            (name, country, league, mtime or "", now, home_logo or "", away_logo or "")
        )
        count += 1
    return count


async def list_parsed(page=0, per_page=10):
    total_row = await db_fetchone("SELECT COUNT(*) as c FROM parsed_matches")
    total = total_row["c"] if total_row else 0
    offset = page * per_page
    rows = await db_fetchall(
        "SELECT id, name, match_time, country, league, priority, home_logo, away_logo FROM parsed_matches "
        "ORDER BY priority ASC, match_time ASC LIMIT ? OFFSET ?",
        (per_page, offset)
    )
    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "items": [
            {
                "id": r["id"], "name": r["name"], "match_time": r["match_time"] or "",
                "country": r["country"], "league": r["league"], "flag": get_flag(r["country"] or ""),
                "priority": r["priority"],
                "home_logo": r["home_logo"] if "home_logo" in r.keys() else "",
                "away_logo": r["away_logo"] if "away_logo" in r.keys() else "",
            }
            for r in rows
        ],
    }


async def list_parsed_leagues():
    rows = await db_fetchall(
        "SELECT DISTINCT league, priority, league_id, country FROM parsed_matches ORDER BY priority ASC, league ASC"
    )
    result = []
    for r in rows:
        cnt = await db_fetchone("SELECT COUNT(*) as c FROM parsed_matches WHERE league_id = ?", (r["league_id"],))
        result.append({
            "league": r["league"], "priority": r["priority"], "league_id": r["league_id"],
            "country": r["country"], "flag": get_flag(r["country"] or ""),
            "count": cnt["c"] if cnt else 0,
        })
    return result
