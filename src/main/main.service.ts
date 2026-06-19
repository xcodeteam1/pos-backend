import { Injectable } from '@nestjs/common';
import { MainRepo } from './main.repository';

@Injectable()
export class MainService {
  constructor(private readonly mainRepo: MainRepo) {}
  async selectProductMain() {
    return await this.mainRepo.selectProductMain();
  }
  async selectSixMoth() {
    return await this.mainRepo.selectSixMonth();
  }
  async selectDiagram() {
    return await this.mainRepo.selectDiagram();
  }
}
