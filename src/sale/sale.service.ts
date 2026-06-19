import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SaleRepo } from './sale.repository';
import { ProductRepo } from 'src/product/product.repository';
import { CreateSaleDto } from './dto/create-sale.dto';

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


   async getTotalSales() {
    const result = await this.saleRepo.getTotalSales();
    return {
      total_sales: Number(result.total_sales),
    };
  }

  // 2. Bu oydagi umumiy jami sotuv summasi
  async getCurrentMonthSales() {
    const result = await this.saleRepo.getCurrentMonthSales();
    return {
      current_month_sales: Number(result.current_month_sales),
    };
  }

  // 3. To'liq statistika (qarz va qaytarilganlar bilan)
  async getSalesStatistics() {
    const result = await this.saleRepo.getSalesStatistics();
    
    const totalSales = Number(result.total_sales);
    const totalDebt = Number(result.total_debt);
    const totalPaidDebt = Number(result.total_paid_debt);
    const totalReturns = Number(result.total_returns);
    
    const currentMonthSales = Number(result.current_month_sales);
    const currentMonthDebt = Number(result.current_month_debt);
    const currentMonthPaidDebt = Number(result.current_month_paid_debt);
    const currentMonthReturns = Number(result.current_month_returns);
    
    return {
      total: {
        sales: totalSales,
        debt: totalDebt,
        paid_debt: totalPaidDebt,
        returns: totalReturns,
        net_sales: totalSales + totalPaidDebt - totalReturns,
        pending_debt: totalDebt - totalPaidDebt,
      },
      current_month: {
        sales: currentMonthSales,
        debt: currentMonthDebt,
        paid_debt: currentMonthPaidDebt,
        returns: currentMonthReturns,
        net_sales: currentMonthSales + currentMonthPaidDebt - currentMonthReturns,
        pending_debt: currentMonthDebt - currentMonthPaidDebt,
      },
    };
  }

  // 4. Mahsulotlar statistikasi
  async getProductStatistics() {
    const result = await this.saleRepo.getProductStatistics();
    
    return {
      total_products: Number(result.total_products),
      new_products: Number(result.new_products),
      low_stock_products: Number(result.low_stock_products),
      out_of_stock_products: Number(result.out_of_stock_products),
    };
  }
}
