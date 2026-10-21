import { ForbiddenException } from '@nestjs/common';
import { ConfirmationIdentiteService } from '../../auth/confirmation-identite.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ParametresFacturationService, type Profil } from './parametres-facturation.service';

const CFO = { userId: 'U-CFO', societeId: 'S1', role: 'CFO' };
const PROFIL: Profil = {
  raisonSociale: 'GREY CONCRETE SARL', adresse: '', ninea: '', rccm: '', cofi: '', capital: '', telephone: '', email: '',
  banque: 'BICIS', rib: 'SN01', wave: '', orangeMoney: '', conditionsPaiement: '', mentionsPied: '',
};

describe('ParametresFacturationService · coordonnées de paiement', () => {
  function svc(preuveValide: boolean) {
    const prisma = {
      profilFacturation: { findFirst: jest.fn().mockResolvedValue({ ...PROFIL, logoDocument: null, cgvAnnexe: 'premiere_facture' }), create: jest.fn() },
    } as unknown as PrismaService;
    const notifications = { envoyer: jest.fn(), titulairesRole: jest.fn().mockResolvedValue(['U-CEO']) } as unknown as NotificationsService;
    const confirmation = {
      verifier: jest.fn(() => (preuveValide ? Promise.resolve('mot_de_passe') : Promise.reject(new ForbiddenException('Mot de passe incorrect.')))),
    } as unknown as ConfirmationIdentiteService;
    const s = new ParametresFacturationService(prisma, notifications, confirmation);
    jest.spyOn(s, 'lire').mockResolvedValue({} as never);
    return { s, prisma, notifications, confirmation };
  }

  it('RIB changé sans bonne preuve : rien n’est enregistré, le CEO n’est pas prévenu', async () => {
    const { s, prisma, notifications } = svc(false);
    await expect(s.modifierProfil(CFO, { ...PROFIL, rib: 'SN99', confirmation: 'faux' })).rejects.toThrow(ForbiddenException);
    expect(prisma.profilFacturation.create).not.toHaveBeenCalled();
    expect(notifications.envoyer).not.toHaveBeenCalled();
  });

  it('RIB changé avec la bonne preuve : enregistré avec le mode de confirmation, CEO prévenu', async () => {
    const { s, prisma, notifications } = svc(true);
    await s.modifierProfil(CFO, { ...PROFIL, rib: 'SN99', confirmation: 'bon' });
    expect(prisma.profilFacturation.create).toHaveBeenCalledWith({ data: expect.objectContaining({ rib: 'SN99', confirmation: 'mot_de_passe' }) });
    expect(notifications.envoyer).toHaveBeenCalledWith(expect.objectContaining({ type: 'coordonnees_paiement_modifiees', destinataireIds: ['U-CEO'] }));
  });

  it('rien de sensible ne change : pas de preuve demandée', async () => {
    const { s, prisma, confirmation } = svc(false);
    await s.modifierProfil(CFO, { ...PROFIL, adresse: 'Dakar' });
    expect(confirmation.verifier).not.toHaveBeenCalled();
    expect(prisma.profilFacturation.create).toHaveBeenCalledWith({ data: expect.objectContaining({ adresse: 'Dakar', confirmation: null }) });
  });
});
