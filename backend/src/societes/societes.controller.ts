import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { SocietesService } from './societes.service';

@Controller('societes')
export class SocietesController {
  constructor(private societesService: SocietesService) {}

  @Get()
  findAll() {
    return this.societesService.findAllActives();
  }

  @Get(':slug')
  async findOne(@Param('slug') slug: string) {
    const societe = await this.societesService.findBySlug(slug);
    if (!societe) throw new NotFoundException('Société introuvable');
    return societe;
  }

  @Get(':slug/modules')
  findModules(@Param('slug') slug: string) {
    return this.societesService.findModulesActifs(slug);
  }
}
