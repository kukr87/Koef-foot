# ⚽ Koefi WebApp — Telegram Mini App

Полнофункциональный Telegram Web App (Mini App) для футбольных прогнозов.  
Точная функциональная копия оригинального Telegram-бота с современным тёмным UI в стиле футбола.

![Theme](https://img.shields.io/badge/theme-dark%20football-1a7a3a)
![Stack](https://img.shields.io/badge/stack-FastAPI%20%2B%20Vanilla%20JS-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Возможности

### Пользователь
| Функция | Описание |
|---------|----------|
| ⚽ **Матчи** | Просмотр прогнозов по странам и лигам |
| 🔒 **Лимит Free** | 3 матча в день (Premium — безлимит) |
| ⚡ **Экспресс дня** | Двойники/тройники + статистика и история |
| ⭐ **Избранное** | Сохранение матчей |
| 🔗 **Рефералы** | +3 дня Premium за каждого приглашённого |
| 🎁 **Test Drive** | 30 дней Premium новым пользователям |
| 💳 **Оплата** | ЮKassa — Premium 30 дней |
| ✉️ **Техподдержка** | Категории: баг / оплата / идея / вопрос |

### Админ-панель
- Добавление / редактирование / удаление матчей
- Управление экспрессом и результатами
- Выдача / снятие Premium
- Просмотр и ответы на обращения поддержки
- Логи действий

---

## Дизайн

Тёмная тема в футбольном стиле:
- Фон стадиона (глубокий `#0a0e14`)
- Акценты поля (`#1a7a3a` / `#22c55e`)
- Золотые коэффициенты (`#f5c542`)
- Карточки, анимации, bottom-navigation
- Адаптив под Telegram WebView

---

## Структура проекта

```
koefi-webapp/
├── frontend/
│   ├── index.html          # Точка входа WebApp
│   ├── css/style.css       # Тёмный футбольный дизайн
│   └── js/
│       ├── api.js          # HTTP-клиент + Telegram initData
│       └── app.js          # Вся логика UI и навигации
├── backend/
│   ├── main.py             # FastAPI — все эндпоинты
│   ├── config.py           # Настройки из env
│   ├── auth.py             # Валидация Telegram WebApp initData
│   ├── database.py         # SQLite (та же схема, что у бота)
│   ├── services/
│   │   └── yookassa.py     # Платежи ЮKassa
│   └── requirements.txt
├── .env.example
├── .gitignore
└── README.md
```

---

## Быстрый старт

### 1. Клонировать

```bash
git clone https://github.com/YOUR_USERNAME/koefi-webapp.git
cd koefi-webapp
```

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp ../.env.example ../.env
# Отредактируйте .env — укажите BOT_TOKEN, ADMIN_ID и т.д.

# Запуск
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Настроить Telegram Bot

1. Откройте [@BotFather](https://t.me/BotFather)
2. `/newbot` или выберите существующего
3. `/setmenubutton` → выберите бота → укажите URL вашего WebApp  
   (например `https://your-domain.com`)
4. Или через `/mybots` → Bot Settings → Menu Button → Configure menu button

Также можно открывать WebApp через inline-кнопку:

```python
from aiogram.types import WebAppInfo, InlineKeyboardButton, InlineKeyboardMarkup

kb = InlineKeyboardMarkup(inline_keyboard=[[
    InlineKeyboardButton(
        text="⚽ Открыть Koefi",
        web_app=WebAppInfo(url="https://your-domain.com")
    )
]])
```

### 4. Деплой (рекомендации)

| Способ | Описание |
|--------|----------|
| **VPS + Nginx** | Самый надёжный. SSL через Let's Encrypt |
| **Railway / Render** | Быстрый деплой из GitHub |
| **Docker** | См. ниже |

**Nginx (пример):**
```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;
    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**Docker (опционально):**
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install -r requirements.txt
COPY backend/ .
COPY frontend/ /app/../frontend/
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## Переменные окружения

| Переменная | Описание | Обязательно |
|------------|----------|-------------|
| `BOT_TOKEN` | Токен бота от BotFather | ✅ |
| `ADMIN_ID` | Telegram user ID админа | ✅ |
| `BOT_USERNAME` | Username бота без @ | ✅ |
| `YOOKASSA_SHOP_ID` | ID магазина ЮKassa | для оплаты |
| `YOOKASSA_SECRET_KEY` | Секретный ключ ЮKassa | для оплаты |
| `PREMIUM_PRICE` | Цена Premium (руб) | нет (300) |
| `FRONTEND_ORIGIN` | CORS origin | нет (`*`) |

---

## API (основные эндпоинты)

Все запросы требуют заголовок:
```
X-Telegram-Init-Data: <initData от Telegram.WebApp>
```

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/me` | Профиль пользователя |
| POST | `/api/start` | Регистрация + Test Drive |
| GET | `/api/matches` | Список матчей по группам |
| GET | `/api/matches/{id}` | Детали матча (с лимитом) |
| GET | `/api/express` | Экспресс + статистика |
| POST | `/api/premium/create` | Создать платёж ЮKassa |
| POST | `/api/support` | Отправить обращение |
| GET/POST | `/api/admin/*` | Админ-панель |

---

## База данных

SQLite-файл `backend/bot.db` создаётся автоматически.  
Схема **идентична** оригинальному боту:
- `users`, `matches`, `viewed_matches`, `favorites`
- `express_picks`, `express_results`
- `support_threads`, `support_messages`
- `pending_payments`, `admin_log`

Можно использовать ту же БД, что и у бота (просто скопируйте `bot.db`).

---

## Безопасность

- `initData` валидируется по [официальному алгоритму Telegram](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
- HMAC-SHA256 с ключом `WebAppData`
- Проверка `auth_date` (срок жизни 24 часа)
- Админ-эндпоинты проверяют `ADMIN_ID`

---

## Совместимость с ботом

WebApp использует **ту же схему БД** и ту же бизнес-логику:
- Лимит 3 матча/день для Free
- Premium 30 дней
- Реферальный бонус +3 дня
- Test Drive 30 дней для новых
- ЮKassa-платежи
- Экспресс, статистика, ROI

Можно запускать бота и WebApp параллельно на одной БД.

---

## Лицензия

MIT
