"""
Configuration from environment variables.
"""
import os
from pathlib import Path

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
ADMIN_ID = int(os.getenv("ADMIN_ID", "0"))
BOT_USERNAME = os.getenv("BOT_USERNAME", "koefiibot")

YOOKASSA_SHOP_ID = os.getenv("YOOKASSA_SHOP_ID", "")
YOOKASSA_SECRET_KEY = os.getenv("YOOKASSA_SECRET_KEY", "")
BSD_API_KEY = os.getenv("BSD_API_KEY", "")

PREMIUM_PRICE = int(os.getenv("PREMIUM_PRICE", "300"))

# CORS / frontend origin (for production set your domain)
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "*")

# WebApp URL (used in payment return)
WEBAPP_URL = os.getenv("WEBAPP_URL", "https://t.me/koefiibot")

COUNTRY_FLAGS = {
    "Russia": "🇷🇺", "England": "🇬🇧", "Spain": "🇪🇸", "Italy": "🇮🇹",
    "Germany": "🇩🇪", "France": "🇫🇷", "Portugal": "🇵🇹", "Turkey": "🇹🇷",
    "Serbia": "🇷🇸", "Kazakhstan": "🇰🇿", "Ukraine": "🇺🇦", "Belarus": "🇧🇾",
    "USA": "🇺🇸", "Brazil": "🇧🇷", "Argentina": "🇦🇷", "Austria": "🇦🇹",
    "Belgium": "🇧🇪", "Bulgaria": "🇧🇬", "Hungary": "🇭🇺", "Greece": "🇬🇷",
    "Denmark": "🇩🇰", "Ireland": "🇮🇪", "Netherlands": "🇳🇱", "Norway": "🇳🇴",
    "Poland": "🇵🇱", "Croatia": "🇭🇷", "Sweden": "🇸🇪", "Switzerland": "🇨🇭",
    "Czech Republic": "🇨🇿", "Romania": "🇷🇴", "Slovakia": "🇸🇰",
    "Slovenia": "🇸🇮", "Montenegro": "🇲🇪", "China": "🇨🇳", "Mexico": "🇲🇽",
    "Finland": "🇫🇮", "Saudi Arabia": "🇸🇦", "Morocco": "🇲🇦",
    "World": "🌍", "Europe": "🇪🇺",
}

LEAGUE_PRIORITIES = {
    "World Cup": 1, "European Championship": 1, "UEFA Nations League": 1,
    "UEFA Champions League": 2, "UEFA Europa League": 2, "UEFA Europa Conference League": 2,
    "Premier League": 3, "La Liga": 3, "Serie A": 3, "Bundesliga": 3,
    "Ligue 1": 3, "Eredivisie": 3, "Russian Premier League": 3, "Primeira Liga": 3,
    "Belgian Pro League": 4, "Bulgarian First League": 4, "Danish Superliga": 4,
    "Swiss Super League": 4, "Süper Lig": 4, "League of Ireland": 4,
    "Major League Soccer": 4, "Serie A Brasileirão": 4, "Primera División": 4,
    "Czech First League": 4, "Super League Greece": 4, "Eliteserien": 4,
    "Ekstraklasa": 4, "Allsvenskan": 4, "Croatian Football League": 4,
    "Serbian SuperLiga": 4, "Nemzeti Bajnokság I": 4, "Austrian Bundesliga": 4,
    "Belarusian Premier League": 4, "Liga I": 4, "Slovak Super Liga": 4,
    "Slovenian PrvaLiga": 4, "Ukrainian Premier League": 4, "Montenegrin First League": 4,
    "EFL Championship": 5, "Segunda División": 5, "Serie B": 5, "2. Bundesliga": 5, "FNL": 5,
}

SUPPORT_CATEGORIES = {
    "bug": "🐛 Баг / ошибка",
    "pay": "💳 Оплата",
    "idea": "💡 Предложение",
    "q": "❓ Вопрос",
}

def get_flag(country: str) -> str:
    return COUNTRY_FLAGS.get(country, "🏳️")
