# Роуты бэкенда, подключённые к фронтенду (pos-frontend)

## Общая конфигурация

- **Базовый URL**: `import.meta.env.VITE_BASE_URL` (из `.env` = `http://213.139.210.248:3017`)
- **Клиент**: axios (`apiClient`)
- **Авторизация**: автоматически добавляется `Authorization: Bearer ${token}` из localStorage (интерцептор в `api.ts`).
- **Все вызовы** идут только через модули в `src/api/*.ts`. Прямых `apiClient` вызовов вне этих модулей нет.
- **Content-Type**: по умолчанию `application/json`, для загрузки изображений — `multipart/form-data`.

## Полный список используемых роутов

### 1. Auth
| Метод | Путь              | Frontend модуль     | Используется в                  | Примечания |
|-------|-------------------|---------------------|---------------------------------|----------|
| POST  | `/auth/login`    | `authApi.login`    | `AuthContext.tsx`, Login page  | Возвращает `{user, token}`. Логин унифицирован для admin и cashier. |

### 2. Sales (Продажи и отчёты)
| Метод | Путь                          | Frontend модуль          | Используется в                          | Статус на бэкенде | Примечания |
|-------|-------------------------------|--------------------------|-----------------------------------------|-------------------|----------|
| GET   | `/sale/daily`                | `saleApi.getDaily`      | Sales page, SalesFilters               | Есть             | Ежедневные продажи по кассирам |
| GET   | `/sale/search`               | `saleApi.search`        | Sales page (с фильтрами)               | Есть             | Поддерживает q, branch_id, cashier_id, from, to, payment_type, page, pageSize |
| POST  | `/sale/create`               | `saleApi.create`        | `useCartCheckout.ts` (handleSaleClick) | Есть             | Принимает **массив** позиций + payment_type |
| GET   | `/sale/net-profit`           | `saleApi.getNetProfit`  | AdminDashboard, NetProfitFilters       | Есть             | Фильтры: from, to, branch_id, cashier_id |
| GET   | `/sale/total-sales`          | `saleApi.getTotalSales` | AdminDashboard.tsx                     | **НЕТ**          | Вызывается, но роута нет на бэкенде |
| GET   | `/sale/current-month-sales`  | `saleApi.getCurrentMonthSales` | AdminDashboard.tsx              | **НЕТ**          | Вызывается, но роута нет |
| GET   | `/sale/product-statistics`   | `saleApi.getProductStatistics` | AdminDashboard.tsx                | **НЕТ**          | Вызывается, но роута нет |

### 3. Products (Товары)
| Метод | Путь                              | Frontend модуль             | Используется в                                      | Примечания |
|-------|-----------------------------------|-----------------------------|-----------------------------------------------------|----------|
| GET   | `/product/list`                  | `productApi.getAll`, `search` | Products page, ProductSearchPanel, BarcodeInput, Sales pages | Основной список + поиск. Поддерживает q, category_id, min/max_price, tegs |
| GET   | `/product/:barcode`              | `productApi.getByBarcode` | Scaner, Returns, ReturnForm, Customer lookup       | Поиск товара по штрихкоду |
| POST  | `/product/create`                | `productApi.create`       | Products page (форма создания)                     | multipart (images) |
| PUT   | `/product/update/:barcode`       | `productApi.update`       | Product form                                       | JSON |
| DELETE| `/product/delete/:barcode`       | `productApi.delete`       | Products page                                      | — |
| PUT   | `/product/images/add/:barcode`   | `productApi.updateImages` | Product image management                           | multipart |
| PUT   | `/product/image/replace/:barcode`| `productApi.replaceImage` | Product image management                           | multipart + oldImage в body |
| PUT   | `/product/images/delete/:barcode`| `productApi.deleteImages` | Product image management                           | `{removeImages: string[]}` |

### 4. Debts (Долги)
| Метод | Путь                                   | Frontend модуль          | Используется в                     | Статус на бэкенде | Примечания |
|-------|----------------------------------------|--------------------------|------------------------------------|-------------------|----------|
| GET   | `/debt/list`                          | `debtApi.getAll`        | Debts page                        | Есть             | Пагинированный список по клиентам |
| GET   | `/debt/search`                        | `debtApi.search`        | Debts page (поиск по имени)       | Есть             | ?name=... |
| GET   | `/debt/pending`                       | `debtApi.getPending`    | Debts page                        | Есть             | Статистика непогашенных |
| GET   | `/debt/oldest`                        | `debtApi.getOldest`     | Debts page                        | Есть             | Самый старый долг |
| GET   | `/debt/recent`                        | `debtApi.getRecent`     | Debts page                        | Есть             | Недавно оплаченные |
| GET   | `/debt/debt-history/:customerId`      | `debtApi.getCustomerHistory` | Debts (DebtHistoryDialog)     | Есть             | История по клиенту |
| POST  | `/debt/create`                        | `debtApi.create`        | `useCartCheckout.ts` (handleDebtWithCustomer) | Есть | Массив позиций + customer_id |
| PUT   | `/debt/update-all-amount/:customerId` | `debtApi.updateAllAmount`, `markAsPaid` | Debts page (погашение всех) | Есть | markAsPaid шлёт `{amount: 0}` |
| PUT   | `/debt/update-amount/:id`             | `debtApi.update`        | Debts page                        | Есть             | Погашение конкретной записи |
| DELETE| `/debt/delete/:id`                    | `debtApi.delete`        | (определён, но не используется в UI) | **НЕТ**       | Роута на бэкенде нет |

### 5. Branches (Филиалы)
| Метод | Путь                  | Frontend модуль       | Используется в                     | Примечания |
|-------|-----------------------|-----------------------|------------------------------------|----------|
| GET   | `/branch/list`       | `branchApi.getAll`   | Products, CashierForm, SalesFilters, Dashboard filters, Products page | Часто с pageSize=100 для селектов |
| GET   | `/branch/:id`        | `branchApi.getById`  | (редко)                           | — |
| POST  | `/branch/create`     | `branchApi.create`   | Branches page                     | — |
| PUT   | `/branch/update/:id` | `branchApi.update`   | Branches page                     | — |
| DELETE| `/branch/delete/:id` | `branchApi.delete`   | Branches page                     | — |
| GET   | `/branch/search`     | `branchApi.search`   | (в фильтрах)                      | ?name=... |

### 6. Cashiers (Кассиры)
| Метод | Путь                     | Frontend модуль        | Используется в                          | Статус / Проблема |
|-------|--------------------------|------------------------|-----------------------------------------|-------------------|
| GET   | `/cashier/list`         | `cashierApi.getAll`   | Cashier page, SalesFilters, Dashboard filters, NetProfitFilters | Есть |
| GET   | `/cashier/:id`          | `cashierApi.getById`  | CashierForm                             | Есть |
| POST  | `/cashier/create`       | `cashierApi.create`   | CashierForm                             | Есть |
| PUT   | `/cashier/update/:id`   | `cashierApi.update`   | CashierForm                             | Есть |
| DELETE| `/cashier/delete/:id`   | `cashierApi.delete`   | Cashier page                            | Есть |
| GET   | `/cashier/search`       | `cashierApi.search`   | Cashier page (searchCashiers)           | **Несоответствие** — бэкенд отдаёт `/cashier/search-cashier?name=` |

**Проблема**: Фронтенд вызывает `GET /cashier/search?q=...`, а бэкенд (AdminController) имеет `GET /cashier/search-cashier?name=...`. Поиск кассиров на странице "Кассир" скорее всего не работает.

### 7. Categories (Категории)
Полностью соответствует бэкенду:

- GET `/category/list`, `/category/:id`
- POST `/category/create` (multipart)
- PUT `/category/update/:id` (multipart)
- DELETE `/category/delete/:id`
- PUT `/category/images/add/:id`, `/category/image/replace/:id`, `/category/images/delete/:id`

Используется в: Categories page, Product form (CategorySelectWithCreate).

### 8. Customers (Клиенты)
- GET `/customer/list`
- GET `/customer/search?name=...`
- POST `/customer/create`

Используется в: CustomerModal (при оформлении долга), Debts.

### 9. Returns (Возвраты)
- GET `/return/all`
- POST `/return/create`

Используется в: Returns page, ReturnForm (с предварительным поиском товара по штрихкоду).

### 10. Dashboard / Main stats
- GET `/main/product`          → `dashboardApi.getStats`
- GET `/main/six-month`        → `dashboardApi.getSixMonthSales`
- GET `/main/diagram`          → `dashboardApi.getProductDiagram`

Используется исключительно в `AdminDashboard.tsx` (роль admin).

## Сводная таблица всех уникальных путей, которые фронт реально дёргает

**Полностью реализованы на бэкенде и используются:**
- /auth/login
- /sale/daily, /sale/search, /sale/create, /sale/net-profit
- /product/list, /product/:barcode, /product/create, /product/update/:barcode, /product/delete/:barcode, /product/images/*, /product/image/*
- /debt/list, /debt/search, /debt/pending, /debt/oldest, /debt/recent, /debt/debt-history/*, /debt/create, /debt/update-*-amount/*
- /branch/list, /branch/:id, /branch/create, /branch/update/:id, /branch/delete/:id, /branch/search
- /cashier/list, /cashier/:id, /cashier/create, /cashier/update/:id, /cashier/delete/:id   (search — проблемный)
- /category/* (все image операции включительно)
- /customer/list, /customer/search, /customer/create
- /return/all, /return/create
- /main/product, /main/six-month, /main/diagram

**Вызываются фронтом, но отсутствуют на бэкенде:**
- /sale/total-sales
- /sale/current-month-sales
- /sale/product-statistics
- /debt/delete/:id   (определён в debtApi, но почти не используется)

**Несоответствие в пути/параметрах:**
- Кассиры: фронт `/cashier/search?q=` vs бэкенд `/cashier/search-cashier?name=`

## Дополнительные наблюдения

- **Токен**: фронт всегда шлёт Bearer, бэкенд его не валидирует (нет Guards).
- **Bulk операции**: sale/create и debt/create принимают массивы — фронт именно так и шлёт корзину.
- **Изображения**: везде используется FormData + специальный заголовок.
- **Пагинация**: почти везде используется `{page, pageSize}` + ответ с `data` + `pagination`.
- **Неиспользуемые на фронте роуты бэкенда** (пример): большинство роутов в `/notification`, некоторые старые search-методы в sale, PATCH в product (закомментирован).

---

**Файл создан**: `pos-backend/docs/FRONTEND_CONNECTED_ROUTES.md` (краткая версия)

**Более детальная версия** (с примерами тел запросов/ответов, **всеми местами вызовов** во фронтенде из 27+ файлов, и полным разбором):  
`pos-backend/docs/DETAILED_FRONTEND_BACKEND_ROUTES.md`

**Предлагаемые исправления (код не изменён)**:  
`pos-backend/docs/FIXES_APPLIED_AND_TODO.md`

См. подробности и список предложенных правок (без применения к коду) в `FIXES_APPLIED_AND_TODO.md`.

Если нужно доработать (реализовать missing endpoints на бэкенде, добавить Postman collection, больше примеров ответов и т.д.) — обращайся.