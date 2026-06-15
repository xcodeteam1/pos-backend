# ТЗ: Улучшение аналитики и отчётов бэкенда (Scanner-POS)

**Версия:** 1.0  
**Дата:** 2025-06-15  
**Статус:** Черновик на согласование

---

## 1. Цель

Создать **единый, предсказуемый слой аналитики** вместо разрозненных запросов в `sale`, `main`, `debt` с разной логикой подсчёта.

Пользователь (админ) должен видеть:
- анализ **по каждому филиалу**;
- анализ **по каждому кассиру** (сумма продаж за **любой период**);
- **продажи за сегодня**, **за текущий месяц** и **за всё время (all time)**;
- **список проданных товаров** за **любой период** (дата от–до или без фильтра = всё время);
- **ежемесячный график** по сумме;
- **чистую прибыль** (маржу);
- **общую продажу** (выручку).

Все метрики должны **сходиться** между экранами при одинаковых фильтрах.

---

## 2. Текущее состояние (проблемы)

| Проблема | Где | Влияние |
|----------|-----|---------|
| `SUM(price)` без `× quantity` | `/sale/daily`, `/main/six-month` | Занижение выручки |
| Маржа из `product.price`, не из `sale.price` | `/sale/net-profit` | Неверная прибыль при скидках |
| Фильтр кассира для долгов: `customer_id` | `getNetProfit` | Неверная прибыль по кассиру |
| `payment_type` не фильтруется | `/sale/search` | Фильтр на UI не работает |
| Нет эндпоинтов | `/sale/total-sales`, `/sale/current-month-sales`, `/sale/product-statistics` | 404 на дашборде |
| Возвраты не привязаны к sale | `return` таблица | Двойной учёт / неточный search |
| Разные источники: sale / debt / return | Все отчёты | Цифры не сходятся |
| Нет группировки по филиалу/кассиру в одном API | — | Много ручных запросов на фронте |

**Вывод:** не чинить точечно старые SQL, а ввести модуль `analytics` с едиными формулами.

---

## 3. Единые определения метрик (обязательно зафиксировать)

### 3.1. Выручка (Revenue / Общая продажа)

```
revenue = Σ (строка.price × строка.quantity)
```

Источники:
- **Касса:** таблица `sale`, поле `price` = цена за единицу (как шлёт фронт).
- **Долг:** таблица `debt`, поле `debt_amount` (сумма строки при оформлении).

Опционально (настройка `include_debt`):
- `include_debt=true` (по умолчанию) — долги входят в выручку в момент оформления.
- `include_debt=false` — только `sale`.

Возвраты:
```
revenue_net = revenue − Σ (return_line_revenue)
```
где `return_line_revenue` = цена продажи × возвращённое кол-во (см. п. 6.1 про связь return ↔ sale).

### 3.2. Чистая прибыль (Net Profit / Маржа)

```
margin_per_unit = sale_price − real_price
net_profit = Σ (margin_per_unit × quantity) по sale
           + Σ (margin_per_unit × quantity) по debt
           − Σ (margin_per_unit × quantity) по return
```

Где:
- `sale_price` — **фактическая** цена из `sale.price` / расчёт из `debt`;
- `real_price` — `product.real_price` на момент операции (см. п. 6.2).

> Это **валовая маржа**, не P&L (аренда, зарплаты и т.д. не учитываются).

### 3.3. Количество

| Метрика | Формула |
|---------|---------|
| `units_sold` | Σ quantity (sale + debt) − Σ quantity (return) |
| `orders_count` | `COUNT(DISTINCT receipt_key)`; до появления `receipt_id` использовать `receipt_key = CONCAT(cashier_id, '_', (created_at AT TIME ZONE 'Asia/Tashkent')::date, '_', COALESCE(payment_type, 'cash'))` |
| `products_count` | COUNT DISTINCT `item_barcode` |

### 3.4. Периоды

| Ключ | Значение |
|------|----------|
| `today` | интервал `[day_start, day_end)` в `Asia/Tashkent`, где `day_start = date_trunc('day', now() AT TIME ZONE 'Asia/Tashkent')` |
| `current_month` | интервал `[month_start, now)` в `Asia/Tashkent`, где `month_start = date_trunc('month', now() AT TIME ZONE 'Asia/Tashkent')` |
| `custom` | `from` + `to` в query, интервал `[from, to)` (верхняя граница не включается) |
| `all_time` | без ограничения по дате (вся история в БД) |

> **Правило для админа:** если не переданы `from`, `to` и `period` — отчёт считается за **all_time**.  
> **Единое правило TZ:** хранение в UTC (`timestamptz`), бизнес-агрегации и периоды — в `Asia/Tashkent`.

---

## 4. Функциональные требования

### FR-1. Анализ по филиалу

**Описание:** сводка и детализация по каждому `branch`.

**Эндпоинт:** `GET /analytics/branches`

**Query:**
```
from?, to?, period? = today | current_month | custom
include_debt? = true
payment_type? = cash | terminal | online
```

**Ответ (массив):**
```json
{
  "data": [
    {
      "branch_id": 1,
      "branch_name": "Главный",
      "revenue": 12500000,
      "net_profit": 3200000,
      "units_sold": 145,
      "orders_count": 89,
      "returns_amount": 150000,
      "debt_issued": 500000,
      "debt_collected": 200000
    }
  ],
  "summary": {
    "revenue": 25000000,
    "net_profit": 6400000
  }
}
```

**Детализация:** `GET /analytics/branches/:id` — те же метрики + breakdown по кассирам внутри филиала.

**Группировка:** через `cashier.branch_id` для sale; для debt — через `product.branch_id` или JOIN product.

---

### FR-2. Анализ по кассиру (суммы за любой период)

**Описание (требование админа):** таблица всех кассиров с **суммой продаж** за выбранный период. Период — любой: сегодня, месяц, произвольные даты или **всё время**.

**Эндпоинт:** `GET /analytics/cashiers`

**Query:**
```
from?, to?, period? = today | current_month | custom | all_time
branch_id?
payment_type?
include_debt? = true
```

**Поведение по периоду:**
- `period=today` — только сегодня
- `period=current_month` — с 1-го числа месяца
- `period=custom` + `from` + `to` — произвольный диапазон
- `period=all_time` или **без дат** — сумма за всю историю

**Ответ:**
```json
{
  "data": [
    {
      "cashier_id": 5,
      "cashier_name": "Али",
      "branch_id": 1,
      "branch_name": "Главный",
      "revenue": 4500000,
      "net_profit": 980000,
      "units_sold": 52,
      "orders_count": 34,
      "avg_check": 132352.94
    }
  ]
}
```

`avg_check = revenue / orders_count`

**Детализация:** `GET /analytics/cashiers/:id`

---

### FR-3. Сводка: сегодня + текущий месяц + all time

**Эндпоинт:** `GET /analytics/summary`

Заменяет разрозненные `/sale/daily`, `/sale/total-sales`, `/sale/current-month-sales`.

**Query:** `branch_id?`, `cashier_id?`, `payment_type?`, `include_debt?`

**Ответ:** три фиксированных блока — админ всегда видит картину **сразу за день, месяц и всё время**.

```json
{
  "today": {
    "revenue": 1250000,
    "net_profit": 340000,
    "units_sold": 18,
    "orders_count": 12,
    "by_cashier": [
      { "cashier_id": 5, "cashier_name": "Али", "revenue": 800000, "orders_count": 7 }
    ]
  },
  "current_month": {
    "revenue": 45000000,
    "net_profit": 11200000,
    "units_sold": 620,
    "orders_count": 410,
    "vs_previous_month_percent": 12.5,
    "by_cashier": [
      { "cashier_id": 5, "cashier_name": "Али", "revenue": 12000000, "orders_count": 85 }
    ]
  },
  "all_time": {
    "revenue": 320000000,
    "net_profit": 78000000,
    "units_sold": 15420,
    "orders_count": 9800,
    "by_cashier": [
      { "cashier_id": 5, "cashier_name": "Али", "revenue": 95000000, "orders_count": 2100 }
    ]
  }
}
```

**Блок `all_time` (обязательно):**
- `revenue` — общая выручка за всю историю
- `net_profit` — чистая прибыль за всю историю
- `units_sold`, `orders_count` — объём за всё время
- `by_cashier` — разбивка суммы по каждому кассиру за всё время

`vs_previous_month_percent` — сравнение выручки текущего месяца с прошлым (опционально, этап 2).

> Для **произвольного периода** (не сегодня/месяц/all time) админ использует `GET /analytics/cashiers` и `GET /analytics/products/sold` с `from`/`to`.

---

### FR-4. Список проданных товаров (за любой период)

**Описание (требование админа):** полный список товаров, которые были проданы, с количеством и суммой. Админ выбирает период в UI (дата от–до) или смотрит **за всё время**.

**Эндпоинт:** `GET /analytics/products/sold`

**Query:**
```
from?, to?, period? = today | current_month | custom | all_time
branch_id?, cashier_id?
payment_type?
q?                    — поиск по name/barcode
page, pageSize        — обязательна пагинация
sort? = revenue | quantity | net_profit
order? = asc | desc
include_debt? = true
```

**Поведение по периоду:**
- `from` + `to` — товары, проданные в этом диапазоне
- `period=all_time` или **без `from`/`to`** — все проданные товары за всю историю
- каждая строка: товар + `quantity_net` + `revenue` (сумма) + `net_profit`

**Ответ:**
```json
{
  "data": [
    {
      "item_barcode": "123456",
      "product_name": "iPhone 15",
      "category_name": "Телефоны",
      "branch_name": "Главный",
      "quantity_sold": 12,
      "quantity_returned": 1,
      "quantity_net": 11,
      "revenue": 66000000,
      "net_profit": 12000000,
      "avg_sale_price": 5500000
    }
  ],
  "pagination": { "total_records": 120, "current_page": 1, "total_pages": 12 },
  "summary": { "revenue": 125000000, "units_net": 450 }
}
```

Источник: агрегация `sale` + `debt` − `return`, GROUP BY `item_barcode`.

---

### FR-5. Ежемесячный график по сумме

**Эндпоинт:** `GET /analytics/chart/monthly`

Заменяет `/main/six-month` с корректной формулой.

**Query:**
```
months? = 6          — глубина (по умолчанию 6)
branch_id?, cashier_id?
metric? = revenue | net_profit   — по умолчанию revenue
include_debt? = true
include_current_month? = true    — включать текущий месяц в график
```

**Ответ:**
```json
{
  "data": [
    {
      "year": 2025,
      "month": 6,
      "month_name": "Июнь 2025",
      "revenue": 45000000,
      "net_profit": 11200000,
      "units_sold": 620
    }
  ]
}
```

**Требование:** каждый бакет = календарный месяц `[date_trunc('month'), date_trunc('month') + 1 month)`.

---

### FR-6. Чистая прибыль

**Эндпоинт:** `GET /analytics/net-profit`

Рефакторинг `/sale/net-profit` с исправленными формулами.

**Query:** `from?, to?, period?, branch_id?, cashier_id?, include_debt?`

**Ответ:**
```json
{
  "net_profit": 11200000,
  "breakdown": {
    "from_sales": 10500000,
    "from_debts": 1200000,
    "from_returns": -500000
  }
}
```

**Обязательно исправить:** фильтр `cashier_id` для debt — либо добавить `cashier_id` в таблицу `debt`, либо не применять debt к фильтру кассира (и документировать).

---

### FR-7. Общая продажа (выручка)

**Эндпоинт:** `GET /analytics/revenue` или часть `/analytics/summary`

**Query:** те же фильтры.

**Ответ:**
```json
{
  "revenue": 320000000,
  "revenue_from_sales": 300000000,
  "revenue_from_debts": 20000000,
  "returns_deducted": 1500000,
  "revenue_net": 318500000
}
```

Совместимость с фронтом: alias `GET /sale/total-sales` → `{ "total_sales": revenue }` (deprecated wrapper).

---

## 5. Архитектура реализации

### 5.1. Новый модуль NestJS

```
src/analytics/
  analytics.module.ts
  analytics.controller.ts
  analytics.service.ts
  analytics.repository.ts
  dto/
    analytics-query.dto.ts
    analytics-period.enum.ts
  queries/
    revenue.query.ts
    net-profit.query.ts
    monthly-chart.query.ts
    sold-products.query.ts
```

**Принципы:**
- Один `AnalyticsRepository` + один экземпляр Knex (через `DatabaseModule`).
- SQL вынести в отдельные файлы/константы с тестами.
- `AnalyticsService` — только оркестрация и нормализация ответов.

### 5.2. Обратная совместимость

| Старый роут | Действие |
|-------------|----------|
| `GET /sale/daily` | Deprecated → прокси на `/analytics/summary` (today.by_cashier) |
| `GET /sale/net-profit` | Deprecated → прокси на `/analytics/net-profit` |
| `GET /sale/total-sales` | Реализовать как wrapper |
| `GET /sale/current-month-sales` | Реализовать как wrapper |
| `GET /sale/product-statistics` | Перенести логику stock в `/analytics/products/stats` |
| `GET /main/six-month` | Deprecated → `/analytics/chart/monthly` |
| `GET /main/diagram` | Deprecated → `/analytics/products/sold?limit=10&sort=revenue` |

Срок deprecated: 2 релиза, затем удаление.

### 5.3. Авторизация

- Все `/analytics/*` — только роль `admin`.
- Кассир — опционально `GET /analytics/cashiers/:id` только свой `id` (этап 2).
- Добавить `JwtAuthGuard` + `RolesGuard`.

---

## 6. Изменения БД (обязательные для production)

### 6.1. Связь возвратов (обязательно)

```sql
ALTER TABLE return ADD COLUMN sale_id INTEGER REFERENCES sale(id);
-- или debt_id для долговых возвратов
```

Без этого возвраты матчатся только по `barcode + время` — неточно.

### 6.2. Снимок себестоимости (обязательно)

```sql
ALTER TABLE sale ADD COLUMN real_price_at_sale NUMERIC(15,2);
ALTER TABLE debt ADD COLUMN real_price_at_sale NUMERIC(15,2);
```

При создании sale/debt копировать `product.real_price` → точная маржа при изменении цен в каталоге.

### 6.3. Кассир в долге (обязательно для FR-2 + FR-6)

```sql
ALTER TABLE debt ADD COLUMN cashier_id INTEGER REFERENCES cashier(id);
```

Заполнять при `POST /debt/create` из JWT/тела запроса.

### 6.4. Индексы

```sql
CREATE INDEX idx_sale_created_at ON sale(created_at);
CREATE INDEX idx_sale_cashier_created ON sale(cashier_id, created_at);
CREATE INDEX idx_sale_payment_type ON sale(payment_type);
CREATE INDEX idx_sale_item_barcode ON sale(item_barcode);
CREATE INDEX idx_sale_not_debt_created ON sale(created_at) WHERE is_debt = false;
CREATE INDEX idx_product_branch_id ON product(branch_id);
CREATE INDEX idx_product_category_id ON product(category_id);
CREATE INDEX idx_debt_created_at ON debt(created_at);
CREATE INDEX idx_debt_customer_id ON debt(customer_id);
CREATE INDEX idx_debt_item_barcode ON debt(item_barcode);
CREATE INDEX idx_return_barcode_created ON return(item_barcode, created_at);
CREATE INDEX idx_cashier_branch_id ON cashier(branch_id);
```

### 6.5. Миграция `payment_type`

Добавить колонку в `sale`, если ещё нет в прод-БД.

---

## 7. Нефункциональные требования

| Требование | Значение |
|------------|----------|
| Время ответа summary | < 500 ms при 100k строк sale |
| Пагинация | Обязательна для списков > 50 |
| Формат чисел | JSON number или string с 2 знаками — **единый** по всему API |
| TZ дат | Хранение UTC (`timestamptz`), агрегации в `Asia/Tashkent` |
| Swagger | Все DTO + примеры ответов |
| Тесты | Unit на формулы + integration минимум 8 сценариев (sale, debt, return, filters, periods, wrappers) |

---

## 8. Этапы реализации (production, без MVP-режима)

### Этап 1 — Core analytics (обязательный базовый релиз)

- [ ] `DatabaseModule` — один Knex
- [ ] Единые формулы revenue / net_profit
- [ ] `GET /analytics/summary` (today + current_month + all_time)
- [ ] `GET /analytics/net-profit` (исправленный)
- [ ] `GET /analytics/chart/monthly`
- [ ] `GET /analytics/revenue` (или full breakdown в summary)
- [ ] Wrappers: `/sale/total-sales`, `/sale/current-month-sales`
- [ ] Исправить `SUM(price * quantity)` везде
- [ ] `sale_id`/`debt_id` в return + обновлённая логика вычитания возвратов
- [ ] `real_price_at_sale` в sale/debt
- [ ] `cashier_id` в debt
- [ ] Фильтр `payment_type` в search
- [ ] `JwtAuthGuard` + `RolesGuard` на `/analytics/*`
- [ ] Индексы БД из п. 6.4

### Этап 2 — Детализация и совместимость

- [ ] `GET /analytics/branches`, `/analytics/cashiers`
- [ ] `GET /analytics/products/sold`
- [ ] `GET /analytics/products/stats` (замена `/sale/product-statistics`)
- [ ] `GET /analytics/payment-breakdown`
- [ ] Deprecated-прокси `/sale/daily`, `/sale/net-profit`, `/main/six-month`, `/main/diagram`
- [ ] Swagger examples для всех analytics endpoint

### Этап 3 — Производительность и расширение

- [ ] Сравнение с прошлым месяцем
- [ ] Кэш summary (Redis/in-memory TTL)
- [ ] Экспорт CSV/Excel
- [ ] Почасовой график + сравнение периодов

---

## 9. Дополнительные фичи (рекомендации)

### 9.1. Обязательно добавить

| Фича | Эндпоинт | Зачем |
|------|----------|-------|
| **Разбивка по типу оплаты** | `GET /analytics/payment-breakdown` | cash / terminal / online — видно, как платят |
| **Топ-10 товаров** | `GET /analytics/products/top?limit=10` | Быстрый дашборд без тяжёлого списка |
| **Влияние возвратов** | в breakdown summary | Прозрачность: сколько «съели» возвраты |
| **Статус долгов в сводке** | в `/analytics/summary` | `debt_pending`, `debt_collected_month` — связь продаж и кассы |
| **Средний чек** | в cashier/branch | `avg_check` — KPI кассира |
| **Низкий остаток** | `GET /analytics/products/stats` | Замена `/sale/product-statistics` + stock alerts |

### 9.2. Полезно (этап 3+)

| Фича | Описание |
|------|----------|
| **Почасовой график за сегодня** | Пиковые часы продаж |
| **Сравнение периодов** | `?compare=previous_month` |
| **Экспорт CSV/Excel** | `GET /analytics/export?type=products_sold` |
| **Кэш summary** | Redis / in-memory 5 мин для дашборда |
| **Аудит** | Кто смотрел отчёты (admin actions log) |
| **ABC-анализ товаров** | Группы A/B/C по выручке |
| **Маржинальность категорий** | GROUP BY category_id |
| **План/факт** | Если появятся плановые KPI |

### 9.3. Технический долг (параллельно)

- Исправить JOIN `b.id = c.branch_id` в `admin.repository`
- Удалить пустой `CashierModule` или перенести роуты
- `.env.example` + скрипт `npm run migrate`
- Переименовать миграцию `category` раньше `product`

---

## 10. Маппинг на фронтенд

| Экран / потребность | Новый API | Старый API (убрать) |
|---------------------|-----------|---------------------|
| AdminDashboard — общая продажа | `/analytics/summary` → `all_time.revenue` | `/sale/total-sales` |
| AdminDashboard — месяц | `/analytics/summary` → `current_month` | `/sale/current-month-sales` |
| AdminDashboard — график | `/analytics/chart/monthly` | `/main/six-month` |
| AdminDashboard — прибыль | `/analytics/net-profit` | `/sale/net-profit` |
| AdminDashboard — товары | `/analytics/products/stats` | `/sale/product-statistics`, `/main/product` |
| Sales page — сегодня | `/analytics/summary` → `today` | `/sale/daily` |
| Sales page — таблица | `/sale/search` (оставить, починить payment_type) | — |
| Новый: по филиалам | `/analytics/branches` | — |
| Новый: по кассирам | `/analytics/cashiers` | — |
| Новый: проданные товары | `/analytics/products/sold` | — |

**Новый файл API:** `frontend/src/api/analyticsApi.ts`  
**Типы:** `frontend/src/types/analytics.ts`

---

## 11. Критерии приёмки

1. При продаже 3 шт × 100 000 в `today.revenue` = **300 000**, не 100 000.
2. `revenue` на дашборде = сумма `revenue` по всем филиалам при тех же фильтрах.
3. `net_profit` уменьшается после возврата на корректную маржу.
4. График за 6 месяцев включает **текущий** месяц и совпадает с `current_month.revenue`.
5. `/sale/total-sales` перестаёт отдавать 404.
6. Фильтр `branch_id` на всех analytics-эндпоинтах работает одинаково.
7. Swagger документирует все query-параметры.
8. Минимум 8 integration-тестов на формулы, периоды, фильтры и wrappers.
9. **`all_time` в summary** содержит `revenue`, `net_profit`, `units_sold`, `orders_count`, `by_cashier`.
10. **`GET /analytics/products/sold`** без дат возвращает все проданные товары за всю историю.
11. **`GET /analytics/cashiers`** с `from`/`to` возвращает сумму каждого кассира только за выбранный диапазон.
12. `current_month.revenue` в summary равен бакету текущего месяца из `/analytics/chart/monthly` при одинаковых фильтрах.
13. Все endpoint используют единое правило периода `[from, to)` и TZ `Asia/Tashkent`.

---

## 12. Зафиксированные решения

1. **Долг в выручке:** учитывать в момент оформления (`include_debt=true` по умолчанию), погашение показывать отдельно (`debt_collected`).
2. **Таймзона:** хранение UTC, все бизнес-периоды и агрегации — `Asia/Tashkent`.
3. **Права доступа:** `/analytics/*` только для `admin`; доступ кассира к личной аналитике — отдельным endpoint на этапе 2+.
4. **Скидки и маржа:** маржа считается от фактической цены продажи (`sale.price`) и `real_price_at_sale`.
5. **Периоды:** обязательные `today`, `current_month`, `custom`, `all_time`; `week/quarter` добавляются как расширение этапа 3.

---

## 13. Резюме

| Требование заказчика | Решение |
|----------------------|---------|
| По филиалу | `GET /analytics/branches` |
| По кассиру | `GET /analytics/cashiers` |
| Сегодня + текущий месяц + **all time** | `GET /analytics/summary` → `today`, `current_month`, **`all_time`** |
| Список проданных товаров **за любой период** | `GET /analytics/products/sold` + `from`/`to` или `all_time` |
| **Суммы кассиров за любой период** | `GET /analytics/cashiers` + `from`/`to` или `all_time` |
| Ежемесячный график | `GET /analytics/chart/monthly` |
| Чистая прибыль | `GET /analytics/net-profit` |
| Общая продажа | `revenue` в summary / `GET /analytics/revenue` |

**Главный принцип:** один модуль, одни формулы, явные определения метрик — тогда цифры перестанут расходиться между экранами.
