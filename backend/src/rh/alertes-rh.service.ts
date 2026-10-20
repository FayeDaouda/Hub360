import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';

export type TypeAlerteRh = 'fin_contrat' | 'fin_essai' | 'visite_medicale' | 'piece_identite';
export type AlerteRh = {
  type: TypeAlerteRh;
  dossierId: string;
  prenom: string;
  nom: string;
  poste: string;
  typeContrat: string;
  date: string; // AAAA-MM-JJ
  jours: number; // négatif = dépassée
};

const JOUR = 86_400_000;
const ecart = (de: string, a: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / JOUR);
// Une période d'essai passée sans décision n'appelle plus d'action au-delà.
const ESSAI_PASSE_J = 7;

// Échéances légales (revue RH 20/10/2026) : fins de CDD/stage, fins de
// période d'essai, visites médicales et pièces d'identité qui expirent —
// chacune ce nombre de jours avant (Réglages de la société du salarié) ;
// visite et pièce restent signalées tant qu'elles sont dépassées.
@Injectable()
export class AlertesRhService {
  constructor(
    private prisma: PrismaService,
    private reglages: ReglagesService,
  ) {}

  async alertes(aujourdhui = new Date().toISOString().slice(0, 10)): Promise<AlerteRh[]> {
    const dossiers = await this.prisma.dossierPersonnel.findMany({
      where: { archiveLe: null },
      select: {
        id: true, societeId: true, prenom: true, nom: true, poste: true, typeContrat: true,
        dateFin: true, finEssai: true, visiteMedicale: true, expirationPiece: true,
      },
    });
    const seuils = new Map<string, { cdd: number; essai: number; echeance: number }>();
    for (const s of new Set(dossiers.map((d) => d.societeId))) {
      const [cdd, essai, echeance] = await Promise.all([
        this.reglages.regle<number>(s, 'alerte_fin_cdd_jours'),
        this.reglages.regle<number>(s, 'alerte_fin_essai_jours'),
        this.reglages.regle<number>(s, 'alerte_echeance_rh_jours'),
      ]);
      seuils.set(s, { cdd, essai, echeance });
    }
    const alertes: AlerteRh[] = [];
    for (const d of dossiers) {
      const s = seuils.get(d.societeId)!;
      const ajouter = (type: TypeAlerteRh, date: string | null, garde: (j: number) => boolean) => {
        if (!date) return;
        const jours = ecart(aujourdhui, date);
        if (garde(jours)) alertes.push({ type, dossierId: d.id, prenom: d.prenom, nom: d.nom, poste: d.poste, typeContrat: d.typeContrat, date, jours });
      };
      if (d.typeContrat !== 'cdi') ajouter('fin_contrat', d.dateFin, (j) => j <= s.cdd);
      ajouter('fin_essai', d.finEssai, (j) => j <= s.essai && j >= -ESSAI_PASSE_J);
      ajouter('visite_medicale', d.visiteMedicale, (j) => j <= s.echeance);
      ajouter('piece_identite', d.expirationPiece, (j) => j <= s.echeance);
    }
    return alertes.sort((a, b) => a.date.localeCompare(b.date));
  }
}
