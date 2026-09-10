import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { versClient } from '../commun/format-contrat';

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService) {}

  async findAll(societeId: string) {
    const clients = await this.prisma.client.findMany({
      where: { societeId },
      orderBy: { nom: 'asc' },
    });
    return clients.map(versClient);
  }
}
