# Список исправлений (Frontend ↔ Backend routes)

## Предлагаемые исправления (только предложения, код НЕ изменён)

### 1. Поиск кассиров (cashier search mismatch)
**Проблема**: 
- Фронтенд вызывает `cashierApi.search({ q: '...' })` → `GET /cashier/search?q=...`
- Бэкенд реализует `GET /cashier/search-cashier?name=...` (admin/admin.controller.ts + repo)

**Предлагаемое исправление**:
- В `pos-frontend/src/api/cashierApi.ts` изменить search на:
  `apiClient.get('/cashier/search-cashier', { params: { name: params.q } })`
- Или добавить на бэкенде поддержку `/cashier/search` с параметром q/name для консистентности.

**Файлы для правки**: `pos-frontend/src/api/cashierApi.ts` и/или бэкенд контроллер.

### 2. Несуществующие эндпоинты (404 в AdminDashboard)
**Проблема**:
- `saleApi.getTotalSales()` → `/sale/total-sales`
- `saleApi.getCurrentMonthSales()` → `/sale/current-month-sales`
- `saleApi.getProductStatistics()` → `/sale/product-statistics`
- Эти вызовы в `pages/AdminDashboard.tsx` вызывают 404.

**Предлагаемое исправление**:
- Вариант A (быстрый): удалить/закомментировать три useQuery в AdminDashboard.tsx и связанные карточки/переменные.
- Вариант B: реализовать недостающие эндпоинты в `sale.controller.ts` / service / repository.
- Для карточки продуктов можно переключить на `dashboardApi.getStats()` (`/main/product`).

**Файлы**: `pos-frontend/src/pages/AdminDashboard.tsx` и/или бэкенд sale модуль.

### 3. Неиспользуемый debt.delete
**Проблема**:
- `debtApi.delete(id)` определён в api, но **нигде не вызывается** во фронтенде.
- На бэкенде нет DELETE /debt/:id.

**Предлагаемое исправление**:
- Удалить метод `delete` из `pos-frontend/src/api/debtApi.ts`.
- Или (если нужно) добавить реализацию на бэкенде.

**Файл**: `pos-frontend/src/api/debtApi.ts`

## TODO / Рекомендуемые следующие исправления

1. **Реализовать отсутствующие sale stats на бэкенде** (или полностью убрать карточки):
   - Добавить в `sale.controller.ts` + service + repository:
     - GET /sale/total-sales
     - GET /sale/current-month-sales
     - GET /sale/product-statistics
   - Примеры агрегаций можно взять из daily / net-profit / main repo.

2. **Выровнять поиск по кассирам на бэкенде** (альтернатива):
   - Добавить в `admin.controller.ts` (или cashier) роут `GET /cashier/search` с поддержкой `?q=...` или `?name=...` для консистентности с `/branch/search`.

3. **Долги — DELETE**:
   - Либо добавить на бэкенде `DELETE /debt/:id` (с проверками), либо оставить удалённым на фронте (текущий статус).

4. **Платёжный тип в поиске продаж**:
   - В `sale.repository.getSales` добавить фильтр по `payment_type` (параметр уже приходит из DTO и контроллера, но игнорируется в WHERE).

5. **Баг в net-profit**:
   - В `sale.repository.getNetProfit` при `cashier_id` для debtFilter используется `d.customer_id = ?` (явная ошибка по комментарию в коде). Исправить на осмысленную связь (если есть) или убрать фильтр по кассиру для долгов.

6. **Общая уборка**:
   - Удалить/закомментировать неиспользуемые методы в api wrappers.
   - Добавить try/catch + error handling в AdminDashboard для оставшихся запросов.
   - Обновить типы ответов в `types/api.ts` если бэкенд вернёт другие структуры.

## Документация
- Основная детальная карта: `pos-backend/docs/DETAILED_FRONTEND_BACKEND_ROUTES.md`
- Краткая карта: `pos-backend/docs/FRONTEND_CONNECTED_ROUTES.md`
- Этот файл: `pos-backend/docs/FIXES_APPLIED_AND_TODO.md`
- Корневой указатель: `docs/API_AND_ROUTES.md`

Код проекта оставлен в оригинальном состоянии (все правки только в документации как предложения).
