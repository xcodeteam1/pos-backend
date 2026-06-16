import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SaleRepo } from './sale.repository';
import { ProductRepo } from 'src/product/product.repository';
import { CreateSaleDto } from './dto/create-sale.dto';
import { OrdersQueryDto } from './dto/orders-query.dto';
import { resolveRange } from 'src/analytics/analytics.period';

@Injectable()
export class SaleService {
  constructor(
    private readonly saleRepo: SaleRepo,
    private readonly productRepo: ProductRepo,
  ) {}
  async getNetProfit(
    from?: string,
    to?: string,
    branch_id?: number,
    cashier_id?: number,
  ) {
    return this.saleRepo.getNetProfit(from, to, branch_id, cashier_id);
  }

  async getSales(
    page: number,
    pageSize: number,
    q?: string,
    branch_id?: number,
    cashier_id?: number,
    from?: Date,
    to?: Date,
    payment_type?: 'cash' | 'terminal' | 'online',
  ) {
    return this.saleRepo.getSales(
      page,
      pageSize,
      q,
      branch_id,
      cashier_id,
      from,
      to,
      payment_type,
    );
  }

  /** Список заказов (чеков) со временем, кассиром, суммой и числом позиций. */
  async getOrders(dto: OrdersQueryDto) {
    const range = resolveRange(dto.period, dto.from, dto.to);
    const filter = {
      from: range.from,
      to: range.to,
      branch_id: dto.branch_id,
      cashier_id: dto.cashier_id,
      payment_type: dto.payment_type,
    };

    const [rows, total] = await Promise.all([
      this.saleRepo.ordersList(filter, dto.page, dto.pageSize),
      this.saleRepo.ordersCount(filter),
    ]);

    const data = rows.map((r) => ({
      receipt_id: r.receipt_id,
      created_at: r.created_at,
      cashier_id: r.cashier_id === null ? null : Number(r.cashier_id),
      cashier_name: r.cashier_name ?? null,
      branch_name: r.branch_name ?? null,
      payment_type: r.payment_type ?? null,
      items_count: Number(r.items_count ?? 0),
      total_quantity: Number(r.total_quantity ?? 0),
      total_amount: Number(r.total_amount ?? 0),
    }));

    const totalPages = Math.ceil(total / dto.pageSize) || 0;

    return {
      data,
      pagination: {
        total_records: total,
        current_page: dto.page,
        total_pages: totalPages,
        next_page: dto.page < totalPages ? dto.page + 1 : null,
        prev_page: dto.page > 1 ? dto.page - 1 : null,
      },
    };
  }

  /** Позиции конкретного заказа (чека) + итоги. */
  async getOrderItems(receiptId: string) {
    const rows = await this.saleRepo.orderItems(receiptId);

    if (rows.length === 0) {
      throw new NotFoundException(`order not found: ${receiptId}`);
    }

    const items = rows.map((r) => ({
      id: Number(r.id),
      item_barcode: r.item_barcode,
      product_name: r.product_name ?? r.description ?? null,
      price: Number(r.price ?? 0),
      quantity: Number(r.quantity ?? 0),
      amount: Number(r.amount ?? 0),
      is_debt: Boolean(r.is_debt),
    }));

    const head = rows[0];
    const totalAmount = items.reduce((sum, i) => sum + i.amount, 0);
    const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);

    return {
      receipt_id: receiptId,
      created_at: head.created_at,
      cashier_id: head.cashier_id === null ? null : Number(head.cashier_id),
      cashier_name: head.cashier_name ?? null,
      branch_name: head.branch_name ?? null,
      payment_type: head.payment_type ?? null,
      items_count: items.length,
      total_quantity: totalQuantity,
      total_amount: totalAmount,
      items,
    };
  }

  async selectDailySale() {
    const result = await this.saleRepo.selectDailySale();
    let sum = 0;

    for (const res of result) {
      sum += Number(res.cashier_price);
    }

    return {
      data: result,
      total_price: sum,
    };
  }

  async searchNameBarcode(q: string) {
    const result = await this.saleRepo.searchNameBarcode(q);
    return result;
  }

  async searchNameBranch(q: string, branch_id: number) {
    const result = await this.saleRepo.searchNameBarBranch(q, branch_id);
    return result;
  }
  async searchBranchCashier(q: string, branch_id: number, cashier_id: number) {
    if (!branch_id) {
      throw new BadRequestException(
        'send branch_id, without branch_id is not working this search query ',
      );
    }
    const result = await this.saleRepo.searchBranchCashier(
      q,
      branch_id,
      cashier_id,
    );
    return result;
  }
  async searchDate(
    q: string,
    branch_id: number,
    cashier_id: number,
    from: Date,
    to: Date,
  ) {
    if (!branch_id) {
      throw new BadRequestException(
        'send branch_id, without branch_id is not working this search query ',
      );
    }
    if (!cashier_id) {
      throw new BadRequestException(
        'send cashier, without cashier is not working this search query ',
      );
    }
    const result = await this.saleRepo.searchDate(
      q,
      branch_id,
      cashier_id,
      from,
      to,
    );
    return result;
  }
  async createSale(data: CreateSaleDto[]) {
    for (const sale of data) {
      const product = await this.productRepo.selectByIDProduct(
        sale.item_barcode,
      );
      const cashier = await this.saleRepo.selectByIDCashier(sale.cashier_id);
      if (cashier.length == 0) {
        throw new NotFoundException(
          `cashier not found with id: ${sale.cashier_id}`,
        );
      }
      if (!product) {
        throw new NotFoundException(
          `Product not found with barcode: ${sale.item_barcode}`,
        );
      }
    }

    const result = await this.saleRepo.createSales(data);
    return result;
  }
}
