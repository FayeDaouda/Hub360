import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantIsolation } from '../tenancy/tenant-isolation.extension';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super();
    // L'instance injectée partout est le client étendu par l'isolation entre
    // sociétés (ADR 0001) : même API, mêmes types, transactions comprises.
    return this.$extends(tenantIsolation) as this;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
