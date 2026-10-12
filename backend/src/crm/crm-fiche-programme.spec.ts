import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DevisService } from '../devis/devis.service';
import { FacturationService } from '../projets/facturation/facturation.service';
import { SeuilCeoService } from '../finances/seuil-ceo.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CrmService } from './crm.service';

// modifierFiche avec la Fiche Programme : le programme (résumé) et les
// planches se déduisent de la fiche, jamais saisis quand ils se calculent.
function svc(dossier: object = { statut: 'nouveau_projet', archiveLe: null, nbPlanches: 0, categorie: 'conception' }) {
  const update = jest.fn().mockRejectedValue(new Error('arrêt du test après l’écriture'));
  const prisma = {
    dossierCrm: { findFirst: jest.fn().mockResolvedValue(dossier), update },
    devis: { count: jest.fn().mockResolvedValue(0) },
  };
  const s = new CrmService(prisma as unknown as PrismaService, {} as DevisService, {} as FacturationService, {} as NotificationsService, {} as SeuilCeoService);
  return { s, update };
}
const acteur = { userId: 'U', role: 'CIO (transverse)', permissions: {} };

describe('CrmService.modifierFiche · Fiche Programme', () => {
  it('villa : programme résumé et planches calculées (RDC + étages + sous-sols)', async () => {
    const { s, update } = svc();
    await s
      .modifierFiche('S1', acteur, 'D1', {
        nbPlanches: 9, // ignoré : les planches se calculent
        ficheProgramme: { usage: 'residentiel', forme: 'villa', gabarit: 1, sousSols: 1, typologieVilla: 'F5', suiteParentale: true },
      })
      .catch(() => undefined);
    const data = update.mock.calls[0][0].data;
    expect(data.nbPlanches).toBe(3);
    expect(data.programme).toBe('Villa R+1 · 1 sous-sol · F5 · suite parentale');
    expect(data.ficheProgramme).toMatchObject({ forme: 'villa', gabarit: 1 });
  });

  it('immeuble incomplet : programme vide, planches saisies acceptées', async () => {
    const { s, update } = svc();
    await s.modifierFiche('S1', acteur, 'D1', { nbPlanches: 4, ficheProgramme: { usage: 'mixte', forme: 'immeuble', gabarit: 3 } }).catch(() => undefined);
    const data = update.mock.calls[0][0].data;
    expect(data.programme).toBe('');
    expect(data.nbPlanches).toBe(4);
  });

  it('valeur inconnue dans la fiche → 400, rien écrit', async () => {
    const { s, update } = svc();
    await expect(s.modifierFiche('S1', acteur, 'D1', { ficheProgramme: { forme: 'chateau' } })).rejects.toThrow(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });
});
