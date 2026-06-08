# Документация по статистике и отчётам (pos-backend)

## Введение

Статистика и отчёты в Scanner-POS построены **исключительно на сырых данных** из таблиц PostgreSQL через Knex (`knex.raw` + query builder). Нет отдельного слоя аналитики, кубов или материализованных представлений.

### Основные таблицы, участвующие в статистике

| Таблица   | Ключевые поля для статистики                          | Роль в отчётах |
|-----------|-------------------------------------------------------|---------------|
| `sale`    | `item_barcode`, `price`, `quantity`, `cashier_id`, `is_debt`, `payment_type`, `created_at` | Обычные продажи (кассовые). Основной источник revenue и части прибыли. |
| `debt`    | `item_barcode`, `quantity`, `amount`, `debt_amount`, `customer_id`, `created_at` | Продажи в долг (qarz / nasiya). Вносят вклад в прибыль так же, как обычные продажи. |
| `return`  | `item_barcode`, `quantity`, `created_at`              | Возвраты. **Вычитаются** из прибыли и из количества проданного. |
| `product` | `price` (продажная цена), `real_price` (себестоимость), `branch_id` | **Маржа = price - real_price**. Все расчёты прибыли используют именно маржу, а не полную цену. |
| `cashier` | `id`, `name`, `branch_id`                             | Группировки в daily-отчётах. |
| `branch`  | `id`, `name`                                          | Фильтрация по филиалам (через product.branch_id). |
| `customer`| `id`, `customer_name`                                 | Для долгов (агрегации по клиентам). |

**Ключевое понятие прибыли (Net Profit / Соф фойда):**

Прибыль = **Маржа × Количество**

Маржа одной единицы = `product.price - product.real_price`

Система считает **валовую маржу** (gross margin) от всех операций, а не чистую прибыль (не учитывает другие расходы).

## Эндпоинты статистики

### 1. `GET /sale/daily` — Ежедневные продажи по кассирам (для быстрого обзора)

**Контроллер**: `sale.controller.ts` → `selectAllProductCont` (название legacy)

**Сервис**: `sale.service.selectDailySale()` — дополнительно считает `total_price`

**Репозиторий**: `sale.repository.selectDailySale()` использует константу `selectDailySaleQurey`

**SQL (упрощённо):**
```sql
SELECT
    SUM(COALESCE(sale.price, 0)) AS cashier_price,   -- revenue по кассиру
    COUNT(*) AS cashier_order,                      -- кол-во позиций (строк)
    cashier.name AS cashier_name,
    cashier.id AS cashier_id,
    branch.name AS branch_name
FROM sale
LEFT JOIN cashier ON cashier.id = sale.cashier_id
LEFT JOIN branch ON branch.id = cashier.branch_id
WHERE DATE(sale.created_at) = CURRENT_DATE 
  AND sale.is_debt = false
GROUP BY cashier.name, branch.name, cashier.id
ORDER BY cashier_price DESC;
```

**Что считается и почему так:**
- Только **сегодняшние** записи (`DATE(created_at) = CURRENT_DATE`).
- **Исключаются долги** (`is_debt = false`). Долги идут отдельно в `debt` таблицу.
- Считается **полная выручка** (`SUM(price * quantity)` неявно через price на строке + quantity в модели, но в запросе SUM(price) — см. замечания).
- В сервисе дополнительно суммируется `cashier_price` → `total_price` для всего дня.
- Возвраты **не вычитаются** в этом отчёте (возвраты за сегодня не влияют на daily revenue здесь).

**Ответ фронтенду:**
```json
{
  "data": [ { "cashier_price": "...", "cashier_order": 12, "cashier_name": "...", ... } ],
  "total_price": 123456.00
}
```

**Замечания:**
- В современных вставках в `sale` поле `is_debt` почти не используется (дефолт false в БД). Долги отдельно.
- `cashier_order` — это количество **строк** в sale, а не уникальных чеков.

---

### 2. `GET /sale/net-profit` — Самая важная статистика: чистая (маржинальная) прибыль

**Контроллер**: `sale.controller.getNetProfit`
**DTO**: `NetProfitQueryDto` (from, to, branch_id, cashier_id)

**Формула прибыли (точно как в коде):**

```sql
net_profit =
    COALESCE( (SELECT SUM( (p.price - p.real_price) * s.quantity )
               FROM sale s
               JOIN product p ON p.barcode = s.item_barcode
               ${saleFilter} ), 0 )

    + COALESCE( (SELECT SUM( (p.price - p.real_price) * d.quantity )
                 FROM debt d
                 JOIN product p ON p.barcode = d.item_barcode
                 ${debtFilter} ), 0 )

    - COALESCE( (SELECT SUM( (p.price - p.real_price) * r.quantity )
                 FROM return r
                 JOIN product p ON p.barcode = r.item_barcode
                 ${returnFilter} ), 0 )
```

**Откуда берутся данные и что вычитается:**

1. **Положительный вклад от обычных продаж (sale)**:
   - Берутся все строки из `sale`.
   - Для каждой строки: маржа продукта × quantity.
   - Фильтры применяются в подзапросе.

2. **Положительный вклад от долгов (debt)**:
   - Аналогично, но из таблицы `debt`.
   - Долговая продажа даёт такую же маржу, как кассовая (система считает, что деньги "висят", но маржа уже "заработана").

3. **Вычитание возвратов (return)**:
   - Для каждого возврата вычитается маржа этого количества: `(price - real_price) * r.quantity`.
   - Это трактуется как "потерянная прибыль" / "zarar".
   - Возврат **не привязан** к конкретной sale/debt строке — только по `item_barcode` и времени (`r.created_at` >= фильтр).

**Применение фильтров (важно!):**

- **Даты** (`from` / `to`): применяются к `s.created_at`, `d.created_at`, `r.created_at` соответственно. Отдельные условия в каждом подзапросе.
- **Филиал** (`branch_id`): через `p.branch_id` (товар "принадлежит" филиалу). Применяется ко всем трём подзапросам.
- **Кассир** (`cashier_id`):
  - Для sale: `s.cashier_id = ?`
  - Для debt: `d.customer_id = ?` ← **явная ошибка** (см. комментарий в коде: "agar debt ham kassirga bog‘langan bo‘lsa shu"). Долги привязаны к customer, а не к кассиру напрямую. Это приводит к неверным результатам при фильтре по кассиру.

**Ответ**: `{ "net_profit": "12345.67" }` (одно число).

**Как это используется**:
- На дашборде админа для показа "Соф фойда".
- Фильтры позволяют считать прибыль за период / по филиалу / (с оговоркой) по кассиру.

---

### 3. `GET /sale/search` — Детальный поиск продаж (с учётом возвратов)

Используется на странице "Продажи" для таблицы.

**Ключевой момент — вычитание возвратов:**

В запросе происходит:

```sql
SELECT 
    s.id,
    s.item_barcode,
    p.name AS product_name,
    ...
    s.quantity - COALESCE(SUM(r.quantity), 0) AS final_quantity,   -- ← ВЫЧИТАЕТ ВОЗВРАТЫ
    ...
FROM sale s
JOIN product p ...
JOIN cashier c ...
LEFT JOIN return r 
    ON r.item_barcode = s.item_barcode 
   AND r.created_at >= s.created_at          -- только возвраты ПОСЛЕ продажи
${where}
GROUP BY s.id, p.name, c.name
HAVING (s.quantity - COALESCE(SUM(r.quantity), 0)) > 0   -- полностью возвращённые исключаются
```

**Что это даёт:**
- Если по товару был возврат позже — `final_quantity` уменьшается.
- Если весь товар по строке вернули — строка исчезает из отчёта (HAVING).
- Возвраты "привязываются" по времени (возврат не может уменьшить более раннюю продажу? Логика "r.created_at >= s.created_at").

**Дополнительно** в этом запросе есть поддержка `payment_type`, но в текущей реализации `where` **не добавляет** условие по `payment_type` (параметр принимается, но игнорируется в фильтре).

---

### 4. Дашборд-эндпоинты (`/main/*`)

#### `GET /main/product`
```sql
SELECT 
    COUNT(*) AS total_products,
    COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)) AS new_products
FROM product;
```
Простой подсчёт товаров + сколько добавлено в текущем месяце.

#### `GET /main/six-month`
Считает **выручку** (не прибыль!) за последние ~6 месяцев из таблицы `sale` только.

Использует 6 отдельных `SUM(price) FILTER (WHERE created_at в диапазоне месяца)`.

**Важно**:
- Только `sale`, долги и возвраты **не учитываются**.
- Считается полная `price`, а не маржа.
- Бакеты идут "назад" от текущего месяца (six_months_ago_sales и т.д.).
- Названия в результате могут немного путать (логика дат в FILTER).

#### `GET /main/diagram`
```sql
SELECT 
    product.name AS product_name,
    sale.item_barcode,
    SUM(sale.price) AS sum   -- revenue
FROM sale
JOIN product ...
GROUP BY product_name, sale.price, sale.item_barcode;  -- ← группировка по price тоже
```

Затем в JS (в репозитории):
```ts
const sumAll = rows.reduce((acc, r) => acc + Number(r.sum), 0);
return rows.map(r => ({ ...r, percent: String( (Number(r.sum) / sumAll) * 100 ) }));
```

**Проблемы**:
- Группировка по `sale.price` может создавать несколько строк на один товар, если цены менялись.
- Считает только по `sale` (долги и возвраты не влияют на топ).
- Процент вычисляется на бэкенде после выборки.

---

### 5. Статистика по долгам (Debt stats) — `/debt/*`

Используется на странице "Долги".

**Модель долгов (важно для понимания):**

При создании долговой продажи (`POST /debt/create`):
- Вставляется строка в `debt`:
  - `debt_amount` = сумма долга (первоначальная)
  - `amount` = сумма долга (текущий остаток)
- При погашении (`PUT /debt/update-amount/:id` или `update-all-amount`):
  - `amount = 0`, `updated_at = NOW()`

**Агрегаты (используются в отчётах):**

- **selectAllDebtQuery** (для `/debt/list`):
  ```sql
  SUM(d.debt_amount) AS debt_amount,     -- всего было должны
  SUM(d.amount) AS remain_amount,        -- осталось должны
  paid_percent = (debt_amount - remain_amount) / debt_amount * 100
  status = CASE ... 'paid' / 'pending' / 'partial'
  ```

- **selectPendingQuery** (`/debt/pending`):
  - `total_pending = SUM(amount) WHERE amount != 0`
  - `count_pending = COUNT WHERE amount != 0`

- **selectRecentQuery** (`/debt/recent`):
  - `total_paid = SUM(debt_amount - amount)`
  - `count_paid = COUNT WHERE amount = 0`

- История по клиенту, oldest unpaid и т.д. — аналогичные агрегации + JOIN customer/product.

**Связь с net-profit**:
Долги дают **положительный** вклад в net_profit сразу при оформлении (по марже).

---

## Как возвраты влияют на разные виды статистики (сводка)

| Отчёт                  | Влияние возврата                          | Механизм |
|------------------------|-------------------------------------------|----------|
| Net Profit             | Вычитает маржу возвращённого кол-ва       | Отдельный подзапрос минус в формуле |
| /sale/search (таблица) | Уменьшает `final_quantity`, исключает полностью возвращённые | LEFT JOIN + GROUP BY + HAVING |
| /sale/daily            | Почти не влияет (только если возврат сегодня и is_debt=false) | Нет явного вычитания |
| 6-month / diagram      | Не влияют (только sale таблица)           | - |
| Stock                  | Восстанавливает (`stock += quantity`)     | В return.repository + debt/sale tx |
| Debt rows              | Не меняют суммы в debt                    | Нет связи return ↔ debt |

## Известные проблемы и неточности в статистике (на момент изучения кода)

1. **Кассир-фильтр в net-profit** для долгов использует `d.customer_id` вместо чего-то осмысленного.
2. `payment_type` в `/sale/search` принимается, но не добавляется в WHERE.
3. В `getSales` нет фильтра по `payment_type` в текущей реализации where.
4. Six-month и diagram считают **revenue**, а не profit.
5. Diagram GROUP BY включает `sale.price` — может дробить товары.
6. Возвраты не связаны с конкретными sale/debt строками (только barcode + время).
7. При возврате долга долговая запись не корректируется.
8. Поле `is_debt` в sale почти не используется.
9. Нет учёта возвратов при подсчёте "paid" в долгах.
10. Много ручных парсингов PG-массивов и дублирования кода в сервисах.

## Рекомендации по улучшению (для будущей документации/рефакторинга)

- Вынести все статистические запросы в отдельные materialized views или dedicated reporting queries.
- Добавить связь `return.sale_id` / `return.debt_id` для точного вычитания.
- Исправить баг с cashier_id в debtFilter.
- Разделить понятия Revenue / Gross Profit / Net Profit чётко.
- Добавить индексы по created_at + barcode для отчётов.
- Добавить тесты на формулы прибыли.

---

**Файл сгенерирован автоматически на основе анализа кода репозиториев `sale.repository.ts`, `main.repository.ts`, `debt.repository.ts`, контроллеров и сервисов.**

Для ещё более глубокого погружения смотрите:
- `pos-backend/src/sale/sale.repository.ts` (getNetProfit, getSales, createSales)
- `pos-backend/src/main/main.repository.ts`
- `pos-backend/src/debt/debt.repository.ts` (selectAllDebtQuery и агрегаты)

Если нужно — могу добавить OpenAPI примеры ответов, визуальные схемы flow (sale → profit, debt → profit, return impact) или сгенерировать ERD с фокусом на статистику.
