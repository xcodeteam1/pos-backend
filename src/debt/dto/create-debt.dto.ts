import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDefined,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateDebtDto {
  @ApiProperty()
  @IsDefined({ message: 'item_barcode property mavjud bolishi shart' })
  @IsString()
  @IsNotEmpty({ message: 'item_barcode bosh bolmasligi kerak' })
  item_barcode: string;

  @ApiProperty()
  @IsDefined({ message: 'quantity property mavjud bolishi shart' })
  @IsNumber()
  @IsNotEmpty({ message: 'quantity bosh bolmasligi kerak' })
  quantity: number;

  @ApiProperty()
  @IsDefined({ message: 'customer_id property mavjud bolishi shart' })
  @IsNumber()
  @IsNotEmpty({ message: 'customer_id bosh bolmasligi kerak' })
  customer_id: number;

  @ApiProperty()
  @IsDefined({ message: 'amount property mavjud bolishi shart' })
  @IsNumber()
  @IsNotEmpty({ message: 'amount bosh bolmasligi kerak' })
  amount: number;

  @ApiProperty()
  @IsDefined({ message: 'description property mavjud bolishi shart' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ description: 'Qarzni rasmiylashtirgan kassir id' })
  @IsOptional()
  @IsNumber()
  cashier_id?: number;
}
