import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MembreSocieteGuard } from '../commun/membre-societe.guard';
import { GroupScope } from '../tenancy/tenant-scope.decorators';
import { ContactDetailsDto, PaymentChangeDto } from './my-space.dto';
import { DownloadDto, MyCellViewDto, MySpaceViewDto } from './my-space-view.dto';
import { MySpaceService } from './my-space.service';

type R = { user: { userId: string; societeId: string } };

// « Mon espace » (lot 5) : tout compte connecté, sur son propre dossier.
@GroupScope()
@Controller('societes/:slug/mon-espace')
@UseGuards(JwtAuthGuard, MembreSocieteGuard)
export class MySpaceController {
  constructor(private mySpace: MySpaceService) {}

  @Get()
  profile(@Req() req: R): Promise<MySpaceViewDto> {
    return this.mySpace.profile(req.user);
  }

  @Patch('coordonnees')
  updateContactDetails(@Req() req: R, @Body() dto: ContactDetailsDto): Promise<MySpaceViewDto> {
    return this.mySpace.updateContactDetails(req.user, dto);
  }

  @Post('paiement')
  requestPaymentChange(@Req() req: R, @Body() dto: PaymentChangeDto): Promise<MySpaceViewDto> {
    return this.mySpace.requestPaymentChange(req.user, dto);
  }

  @Post('attestations')
  requestCertificate(@Req() req: R): Promise<MySpaceViewDto> {
    return this.mySpace.requestCertificate(req.user);
  }

  @Get('attestations/:id')
  certificate(@Req() req: R, @Param('id', ParseUUIDPipe) id: string): Promise<DownloadDto> {
    return this.mySpace.certificate(req.user, id);
  }

  @Get('bulletins/:mois')
  payslip(@Req() req: R, @Param('mois') month: string): Promise<DownloadDto> {
    return this.mySpace.payslip(req.user, month);
  }

  @Get('cellule')
  myCell(@Req() req: R): Promise<MyCellViewDto> {
    return this.mySpace.myCell(req.user);
  }

  @Get('documents/:type')
  document(@Req() req: R, @Param('type') type: string): Promise<DownloadDto> {
    return this.mySpace.document(req.user, type);
  }
}
