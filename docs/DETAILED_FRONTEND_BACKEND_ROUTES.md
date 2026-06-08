# Подробная документация: Роуты бэкенда, используемые фронтендом (с примерами тел и точными вызовами)

## 1. Конфигурация подключения

**Базовый клиент** (`pos-frontend/src/api/api.ts`):
```ts
const API_BASE_URL = import.meta.env.VITE_BASE_URL; // http://213.139.210.248:3017
const apiClient = axios.create({ baseURL: API_BASE_URL, headers: { 'Content-Type': 'application/json' } });

apiClient.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

- Все вызовы идут через `*Api.ts` модули.
- Для multipart: `{ headers: { 'Content-Type': 'multipart/form-data' } }`
- Токен добавляется автоматически.

## 2. Полная карта роутов + примеры тел запросов/ответов + все места вызовов во фронтенде

### Auth

**POST /auth/login**

- Frontend: `authApi.login({ login, password })`
- Пример тела запроса:
  ```json
  { "login": "admin1", "password": "sunshine7575" }
  ```
- Пример успешного ответа (из AuthContext + backend):
  ```json
  {
    "user": { "id": 1, "name": "admin1", "role": "admin", "branch_name": null, ... },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
  ```
- **Места вызовов во фронте**:
  - `src/contexts/AuthContext.tsx:52` — `const response = await authApi.login({ login, password })`
  - Используется в форме логина (`pages/Login.tsx`)

### Sales

#### GET /sale/daily
- Frontend: `saleApi.getDaily()`
- Пример ответа:
  ```json
  {
    "data": [
      { "cashier_price": "125000", "cashier_order": "12", "cashier_name": "Кассир1", "cashier_id": 5, "branch_name": "Главный" }
    ],
    "total_price": 125000
  }
  ```
- **Места вызовов**:
  - `pages/Sales.tsx:17` — `await saleApi.getDaily()`
  - Используется для таблицы ежедневных продаж.

#### GET /sale/search
- Frontend: `saleApi.search({ q?, branch_id?, cashier_id?, from?, to?, payment_type?, page, pageSize })`
- Пример запроса: `GET /sale/search?page=1&pageSize=10&q=iphone&branch_id=1`
- Пример ответа (SaleSearchResponse):
  ```json
  {
    "data": [ { "id": 123, "item_barcode": "123456", "product_name": "iPhone", "cashier_name": "...", "price": "500000", "final_quantity": 2, "created_at": "..." } ],
    "total_price": 1000000
  }
  ```
- **Места вызовов**:
  - `pages/Sales.tsx:31` — `await saleApi.search(searchParams)`
  - `components/sales/SaleDetailsModal.tsx:62` — аналогичный поиск для деталей
  - `pages/Sales.tsx` + `SalesFilters.tsx` загружают cashier/branch для фильтров.

#### POST /sale/create
- Frontend: `saleApi.create( CreateSaleRequest )` где `CreateSaleRequest = SaleItemRequest[]`
- Пример тела (из `useCartCheckout.ts:129`):
  ```json
  [
    {
      "item_barcode": "123456789",
      "price": 500000,
      "cashier_id": 5,
      "quantity": 2,
      "description": "iPhone 15",
      "payment_type": "cash"
    }
  ]
  ```
- **Места вызовов**:
  - `components/sales/cart/hooks/useCartCheckout.ts:138` — `await saleApi.create(request)` (в handleSaleClick для cash/terminal/online)

#### GET /sale/net-profit
- Frontend: `saleApi.getNetProfit({ from?, to?, branch_id?, cashier_id? })`
- Пример ответа: `{ "net_profit": "125000.50" }`
- **Места вызовов**:
  - `pages/AdminDashboard.tsx:86`
  - `components/dashboard/NetProfitFilters.tsx:86` (передаёт фильтры)

**Несуществующие (вызывают 404):**
- `saleApi.getTotalSales()` → `/sale/total-sales`
- `saleApi.getCurrentMonthSales()` → `/sale/current-month-sales`
- `saleApi.getProductStatistics()` → `/sale/product-statistics`
  - **Вызовы**: `pages/AdminDashboard.tsx:50,59,68` — используются для карточек "Total sales", "Current month", статистики товаров на дашборде админа.

### Products

#### GET /product/list + search (переиспользует list)
- `productApi.getAll(page, pageSize, { q?, category_id?, min_price?, max_price?, tegs? })`
- `productApi.search({ q })` → вызывает list с pageSize=5
- Пример: `GET /product/list?page=1&pageSize=24&q=iphone&category_id=3&min_price=100000`
- **Места вызовов** (много):
  - `pages/Products.tsx:44`
  - `components/sales/ProductSearchPanel.tsx:40`
  - `components/common/BarcodeInput.tsx:72`
  - `pages/Products.tsx:171` (getByBarcode fallback)
  - `components/products/components/ProductForm.tsx:92,142,164` (для проверки существующего)

#### GET /product/:barcode
- Используется для lookup перед возвратом/продажей/редактированием.
- **Места**:
  - `pages/Scaner.tsx:73`
  - `components/returns/ReturnForm.tsx:83,69`
  - `pages/Returns.tsx:26,69`
  - `components/products/components/ProductForm.tsx` (несколько)
  - `components/sales/cart/...` (косвенно)

#### POST /product/create (multipart FormData)
- Пример FormData (из `toFormData` в productFormUtils.ts + ProductForm):
  - name, barcode, price, real_price, stock, branch_id, category_id?, description?, tegs (несколько append), images (файлы + иногда JSON существующих)
- **Места**:
  - `components/products/components/ProductForm.tsx:198`

#### PUT /product/update/:barcode (JSON partial)
- Пример: только changedFields (name, price и т.д.)
- **Места**: `ProductForm.tsx:244`

#### DELETE /product/delete/:barcode
- **Места**: `pages/Products.tsx:131`

**Image endpoints** (все multipart):
- PUT /product/images/add/:barcode — `ImageUploadField.tsx:57`
- PUT /product/image/replace/:barcode — `ImageUploadField.tsx:132`
- PUT /product/images/delete/:barcode — `ImageUploadField.tsx:180`
- **Места**: только в Product image management.

### Debts

- `debtApi.getAll(page, pageSize)` → `/debt/list`
- `debtApi.search({ name, page, pageSize })` → `/debt/search`
- `debtApi.getPending()`, `getOldest()`, `getRecent()`
- `debtApi.getCustomerHistory(customerId)` → `/debt/debt-history/:id`
- `debtApi.create(DebtItemRequest[])` 
  - Пример тела (из useCartCheckout:79):
    ```json
    [{
      "item_barcode": "...",
      "quantity": 1,
      "customer_id": 42,
      "amount": 500000,
      "description": "iPhone"
    }]
    ```
  - **Вызов**: `useCartCheckout.ts:86`
- `debtApi.updateAllAmount(customerId, {amount})` / `markAsPaid`
  - **Вызовы**: `pages/Debts.tsx:131` (markAsPaid)
- `debtApi.update(id, data)`
- `debtApi.delete(id)` — **определён, но не вызывается в UI** (только в api файле). Backend не имеет DELETE /debt/delete.

**Места вызовов долгов**:
- `pages/Debts.tsx` (много: getAll, search, pending, recent, oldest, history, markAsPaid)
- `components/debts/DebtHistoryDialog.tsx:31`
- `components/sales/CustomerModal.tsx` (косвенно через create debt)
- `useCartCheckout.ts`

### Branches
- `branchApi.getAll(1, 1000)` / `getAll(1,100)` — для селектов
- `branchApi.search({name})` → `/branch/search`
- CRUD: create/update/delete в `pages/Branches.tsx`, `components/branches/BranchForm.tsx:41,43`
- **Много загрузок в**: SalesFilters, NetProfitFilters, Products, CashierForm, Dashboard filters и т.д.

### Cashiers
- Аналогично branches: getAll, getById, create, update, delete
- **Проблемный поиск**:
  - `cashierApi.search({ q: searchValue })` → вызывает `GET /cashier/search?q=...`
  - **Вызов**: `pages/Cashier.tsx:39`
  - Backend: `GET /cashier/search-cashier?name=...` (в AdminController)
- Другие загрузки: SalesFilters.tsx:38, NetProfitFilters, SaleDetailsModal, AdminDashboard косвенно.

### Categories
- getAll (для селектов в ProductFilters, CategorySelectWithCreate)
- CRUD + image ops в `pages/Categories.tsx`, `CategoryForm.tsx`, `CategoryImageUploadField.tsx`, `CategorySelectWithCreate.tsx:71`
- Пример create FormData: просто `name` + images файлы.

### Customers
- `customerApi.getAll()`, `search({ name })`, `create({ customer_name, phone_number, description? })`
- **Места**:
  - `components/sales/CustomerModal.tsx:80,83,91`
  - Используется при выборе клиента для долга.

### Returns
- `returnApi.getAll()` — `pages/Returns.tsx:129`
- `returnApi.create({ item_barcode, quantity, description })` — `ReturnForm.tsx:55`
- Перед create часто `productApi.getByBarcode`

### Dashboard / Main
- `dashboardApi.getStats()` → `/main/product` (total + new)
- `dashboardApi.getSixMonthSales()` → `/main/six-month`
- `dashboardApi.getProductDiagram()` → `/main/diagram`
- **Вызовы**: только `pages/AdminDashboard.tsx:77` + net-profit выше.

## 3. Список исправлений (для устранения 404 и ошибок)

### Критические 404 (ломают дашборд админа)
1. **saleApi.getTotalSales, getCurrentMonthSales, getProductStatistics**
   - Причина: Нет таких роутов в `sale.controller.ts`.
   - Влияние: AdminDashboard карточки "Total sales", "Current month" падают.
   - **Варианты исправления**:
     - **Быстрый (frontend)**: Закомментировать/удалить 3 useQuery в `AdminDashboard.tsx` (строки ~47-72). Использовать только рабочие (net-profit + dashboard /main/* + /sale/daily).
     - **Полноценный (backend + frontend)**: Добавить в `sale.controller.ts` и `sale.service/repository` простые эндпоинты (например, агрегацию по created_at для текущего месяца и total).

2. **debtApi.delete**
   - Определён в `debtApi.ts:88`, но **не вызывается** нигде в UI.
   - Backend: нет DELETE в `debt.controller.ts`.
   - **Исправление**: Удалить метод `delete` из `debtApi.ts` (или добавить бэкенд DELETE /debt/:id с soft delete).

### Несоответствие поиска кассиров
- Frontend: `GET /cashier/search?q=...` (Cashier.tsx:38-39, cashierApi.ts:28)
- Backend: `GET /cashier/search-cashier?name=...` (admin.controller.ts:42-44, repo searchCashier)
- **Исправление (рекомендуемое)**:
  - В `cashierApi.ts` изменить:
    ```ts
    search: (params) => apiClient.get('/cashier/search-cashier', { params: { name: params.q } })
    ```
  - Или добавить в backend новый роут `/cashier/search` с поддержкой `q` (рекомендуется для консистентности с branch/search и product/list).

### Другие мелкие улучшения
- В `sale.repository.getSales` не используется `payment_type` из параметров (хотя DTO и контроллер его передают).
- В net-profit для debtFilter при cashier_id используется `d.customer_id` (ошибка, см. комментарий в коде).
- Добавить обработку ошибок 404 в AdminDashboard для сломанных sale stats (чтобы не падал весь дашборд).
- Убрать неиспользуемые методы из api wrappers (debt.delete, несуществующие sale stats) или пометить как @deprecated.

## 4. Рекомендации по общей документации проекта

- Файл `pos-backend/docs/FRONTEND_CONNECTED_ROUTES.md` (базовая версия) + этот детальный файл.
- Рекомендуется добавить в корень проекта `docs/API.md` или `README.md` ссылки на эти файлы.
- Можно сгенерировать Postman collection или обновить Swagger description на бэкенде с пометкой "Used by frontend".

---

**Этот документ создан на основе полного анализа всех 27+ файлов фронтенда, типов, форм и хуков.**

Если нужно:
- Реализовать исправления через код (search_replace для frontend)
- Добавить больше примеров ответов бэкенда (путём чтения сервисов/репо)
- Создать ER-диаграмму связей или визуальную карту вызовов
- Обновить backend контроллеры для missing endpoints

— скажи, и я сделаю следующие шаги немедленно.