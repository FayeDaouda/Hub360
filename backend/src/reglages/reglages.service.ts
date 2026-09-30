import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { PartsFactures } from '../projets/domaine/config';
import { appliquer, type Changement, type ContenuGabarit, decrire, ErreurGabarit, libelleVersion } from './gabarit';
import { type DefinitionReglage, GABARITS_PAR_SOCIETE, normaliser, OBJECTIFS, REGLES } from './definitions';

type Section = 'regles' | 'objectifs';
const DEFINITIONS: Record<Section, DefinitionReglage[]> = { regles: REGLES, objectifs: OBJECTIFS };
const jjmmaaaa = (iso: string) => iso.split('-').reverse().join('/');

// Rendu lisible d'une valeur pour le journal.
function afficher(def: DefinitionReglage, v: unknown): string {
  if (v === null || v === undefined) return 'à fixer';
  const t = def.valeur;
  if (t.type === 'parts') return t.cles.map((k) => (v as Record<string, number>)[k]).join(' / ') + ' %';
  if (t.type === 'heures') return t.cles.map((k) => `${k} ${(v as Record<string, number>)[k]} h`).join(' · ');
  if (t.type === 'choix') return t.options.find((o) => o.valeur === v)?.libelle ?? String(v);
  if (t.type === 'dates') return (v as string[]).length ? (v as string[]).map(jjmmaaaa).join(', ') : 'aucun';
  if (t.type === 'zone') return `${(v as { de: number }).de} à ${(v as { a: number }).a} %`;
  if (t.type === 'pourcentage') return `${v} %`;
  if (t.type === 'entier' && t.unite) return `${Number(v).toLocaleString('fr-FR')} ${t.unite}`;
  return String(v);
}

// Réglages du HUB (maquette du boss) : gabarit versionné, règles et délais,
// objectifs des indicateurs, journal. Toute modification exige un motif et
// entre au journal (qui alimentera le registre des décisions, Pilotage).
@Injectable()
export class ReglagesService {
  constructor(private prisma: PrismaService) {}

  async lire(societeId: string) {
    const gabarits = await this.gabaritsDe(societeId);
    if (!gabarits) return { disponible: false as const };
    const [versions, valeurs, modifications] = await Promise.all([
      Promise.all(gabarits.map((g) => this.versionEnService(societeId, g.code, g.contenu))),
      this.valeurs(societeId),
      this.prisma.journalReglage.count({ where: { societeId } }),
    ]);
    const vue = (d: DefinitionReglage) => ({
      cle: d.cle,
      libelle: d.libelle,
      valeur: d.valeur,
      aide: d.aide,
      appliquee: d.appliquee,
      propose: d.propose ?? null,
      enService: valeurs.has(d.cle) ? valeurs.get(d.cle) : d.defaut,
    });
    return {
      disponible: true as const,
      gabarits: versions.map((v) => ({
        code: v.code,
        numero: v.numero,
        libelle: v.libelle,
        contenu: v.contenu as unknown as ContenuGabarit,
        creeLe: v.createdAt,
        // Aucun projet n'est encore ouvert sur une version : l'instanciation
        // du gabarit dans les projets est l'étape suivante.
        projets: 0,
      })),
      regles: REGLES.map(vue),
      objectifs: OBJECTIFS.map(vue),
      modifications,
    };
  }

  async journal(societeId: string) {
    const lignes = await this.prisma.journalReglage.findMany({
      where: { societeId },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: { id: true, lot: true, section: true, libelle: true, motif: true, parId: true, createdAt: true },
    });
    // parId est un audit sans FK : nom résolu à la lecture (compte supprimé → null).
    const ids = [...new Set(lignes.flatMap((l) => (l.parId ? [l.parId] : [])))];
    const comptes = await this.prisma.utilisateur.findMany({ where: { id: { in: ids } }, select: { id: true, prenom: true, nom: true } });
    const noms = new Map(comptes.map((c) => [c.id, `${c.prenom} ${c.nom}`.trim()]));
    return lignes.map(({ parId, ...l }) => ({ ...l, par: parId ? noms.get(parId) ?? null : null }));
  }

  // Un enregistrement = une nouvelle version (jamais de réécriture).
  async majGabarit(societeId: string, userId: string, code: string, corps: { depuis: number; motif: string; changements: Changement[] }) {
    const g = (await this.gabaritsDe(societeId))?.find((x) => x.code === code);
    if (!g) throw new NotFoundException('Gabarit inconnu.');
    const actuelle = await this.versionEnService(societeId, code, g.contenu);
    if (corps.depuis !== actuelle.numero) {
      throw new ConflictException(`Le gabarit est passé en ${actuelle.libelle} entre-temps : recharge la page.`);
    }
    let resultat: ReturnType<typeof appliquer>;
    try {
      resultat = appliquer(actuelle.contenu as unknown as ContenuGabarit, corps.changements);
    } catch (e) {
      if (e instanceof ErreurGabarit) throw new BadRequestException(e.message);
      throw e;
    }
    if (!resultat.appliques.length) throw new BadRequestException('Aucune modification à enregistrer.');

    const numero = actuelle.numero + 1;
    const libelle = libelleVersion(numero);
    const lot = randomUUID();
    const motif = corps.motif.trim();
    try {
      await this.prisma.$transaction([
        this.prisma.gabaritVersion.create({
          data: { societeId, code, numero, libelle, contenu: resultat.contenu as unknown as Prisma.InputJsonValue, motif, creeParId: userId },
        }),
        this.prisma.journalReglage.createMany({
          data: resultat.appliques.map((ch) => ({
            societeId,
            lot,
            section: 'gabarit',
            cle: `${code}:${ch.carte}${ch.tache ? `:${ch.tache}` : ''}:${ch.champ}`,
            libelle: `${code} ${libelle} · ${decrire(ch)}`,
            avant: ch.avant,
            apres: ch.valeur,
            motif,
            parId: userId,
          })),
        }),
      ]);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Le gabarit a été modifié entre-temps : recharge la page.');
      }
      throw e;
    }
    return this.lire(societeId);
  }

  async majValeurs(societeId: string, userId: string, section: Section, corps: { motif: string; valeurs: Record<string, unknown> }) {
    if (!(await this.gabaritsDe(societeId))) throw new NotFoundException('Réglages non définis pour cette société.');
    const defs = DEFINITIONS[section];
    const actuelles = await this.valeurs(societeId);
    const changements: { def: DefinitionReglage; avant: unknown; apres: unknown }[] = [];
    for (const [cle, brute] of Object.entries(corps.valeurs)) {
      const def = defs.find((d) => d.cle === cle);
      if (!def) throw new BadRequestException(`Réglage inconnu : ${cle}.`);
      let apres: unknown;
      try {
        apres = normaliser(def, brute);
      } catch (e) {
        throw new BadRequestException(e instanceof Error ? e.message : 'Valeur invalide.');
      }
      const avant = actuelles.has(cle) ? actuelles.get(cle) : def.defaut;
      if (JSON.stringify(avant) !== JSON.stringify(apres)) changements.push({ def, avant, apres });
    }
    if (!changements.length) throw new BadRequestException('Aucune modification à enregistrer.');

    const lot = randomUUID();
    const motif = corps.motif.trim();
    const json = (v: unknown) => (v === null ? Prisma.JsonNull : (v as Prisma.InputJsonValue));
    await this.prisma.$transaction([
      ...changements.map((c) =>
        this.prisma.reglageSociete.upsert({
          where: { societeId_cle: { societeId, cle: c.def.cle } },
          create: { societeId, cle: c.def.cle, valeur: json(c.apres), majParId: userId },
          update: { valeur: json(c.apres), majParId: userId },
        }),
      ),
      this.prisma.journalReglage.createMany({
        data: changements.map((c) => ({
          societeId,
          lot,
          section,
          cle: c.def.cle,
          libelle: `${c.def.libelle} : ${afficher(c.def, c.avant)} → ${afficher(c.def, c.apres)}`,
          avant: json(c.avant),
          apres: json(c.apres),
          motif,
          parId: userId,
        })),
      }),
    ]);
    return this.lire(societeId);
  }

  // --- Lecture par les autres modules --------------------------------------------
  // Jours fériés en service par société (vide si la société n'en a pas).
  async joursFeries(societeIds: string[]): Promise<Map<string, Set<string>>> {
    const lignes = await this.prisma.reglageSociete.findMany({
      where: { societeId: { in: [...new Set(societeIds)] }, cle: 'jours_feries' },
    });
    const parSociete = new Map(lignes.map((l) => [l.societeId, new Set(l.valeur as string[])]));
    return new Map(societeIds.map((id) => [id, parSociete.get(id) ?? new Set<string>()]));
  }

  // Parts F1 / F2 / F3 en service (réglage, sinon valeur par défaut).
  async partsFactures(societeId: string): Promise<PartsFactures> {
    const l = await this.prisma.reglageSociete.findUnique({ where: { societeId_cle: { societeId, cle: 'parts_factures' } } });
    return (l?.valeur ?? REGLES.find((d) => d.cle === 'parts_factures')!.defaut) as PartsFactures;
  }

  // --- internes ---------------------------------------------------------------------
  private async gabaritsDe(societeId: string) {
    const s = await this.prisma.societe.findUnique({ where: { id: societeId }, select: { slug: true } });
    return s ? GABARITS_PAR_SOCIETE[s.slug] ?? null : null;
  }

  private async valeurs(societeId: string): Promise<Map<string, unknown>> {
    const lignes = await this.prisma.reglageSociete.findMany({ where: { societeId } });
    return new Map(lignes.map((l) => [l.cle, l.valeur]));
  }

  // Version la plus récente ; bêta 1.0 est créée à la première lecture depuis
  // le gabarit par défaut (course entre deux lectures : contrainte d'unicité).
  private async versionEnService(societeId: string, code: string, defaut: ContenuGabarit) {
    const derniere = () => this.prisma.gabaritVersion.findFirst({ where: { societeId, code }, orderBy: { numero: 'desc' } });
    const v = await derniere();
    if (v) return v;
    try {
      return await this.prisma.gabaritVersion.create({
        data: { societeId, code, numero: 0, libelle: libelleVersion(0), contenu: defaut as unknown as Prisma.InputJsonValue, motif: 'Mise en service' },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return (await derniere())!;
      throw e;
    }
  }
}
