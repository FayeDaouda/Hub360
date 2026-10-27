import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { formatDateTime } from '@hub/domain';
import { ErrorReporter } from './error-reporter.service';

const HEURE_MS = 3_600_000;
// Sauvegarde chaque nuit : au-delà de 26 heures, la dernière a manqué.
const AGE_MAX_SAUVEGARDE_MS = 26 * HEURE_MS;
// Test de restauration chaque dimanche : au-delà de 8 jours, il a manqué.
const AGE_MAX_TEST_MS = 8 * 24 * HEURE_MS;

// Surveillance des sauvegardes (piste Exploitation) : chaque matin, une alerte
// du suivi des erreurs si la dernière sauvegarde est trop ancienne, ou si le
// test de restauration hebdomadaire (deploy/tester-restauration.sh) a échoué
// ou manqué. Active quand SAUVEGARDES_DOSSIER est renseigné (le dossier des
// sauvegardes, monté en lecture seule par deploy/docker-compose.yml).
@Injectable()
export class BackupWatch {
  constructor(private readonly reporter: ErrorReporter) {}

  @Cron('0 9 * * *', { timeZone: 'Africa/Dakar' })
  async check(now = new Date()): Promise<string[]> {
    const dossier = process.env.SAUVEGARDES_DOSSIER;
    if (!dossier) return [];
    const problemes = await backupProblems(dossier, now);
    for (const message of problemes) this.reporter.report({ source: 'serveur', route: 'Sauvegardes', message });
    return problemes;
  }
}

// Problèmes constatés dans le dossier des sauvegardes, en clair ; liste vide
// si tout va bien.
export async function backupProblems(dossier: string, now: Date): Promise<string[]> {
  const noms = (await readdir(dossier).catch(() => [] as string[])).filter((n) => /^hub-.*\.dump$/.test(n));
  if (noms.length === 0) return [`Aucune sauvegarde dans ${dossier}.`];
  const dates = await Promise.all(noms.map(async (n) => (await stat(join(dossier, n))).mtime));
  const derniere = new Date(Math.max(...dates.map((d) => d.getTime())));
  const premiere = new Date(Math.min(...dates.map((d) => d.getTime())));
  const problemes: string[] = [];
  if (now.getTime() - derniere.getTime() > AGE_MAX_SAUVEGARDE_MS) {
    problemes.push(`Dernière sauvegarde le ${formatDateTime(derniere.toISOString())} : celle de la nuit a manqué.`);
  }
  const ligne = (await readFile(join(dossier, 'derniere-verification.txt'), 'utf8').catch(() => '')).trim();
  if (!ligne) {
    // Installation récente : le premier test n'a pas encore eu lieu.
    if (now.getTime() - premiere.getTime() > AGE_MAX_TEST_MS) problemes.push('Aucun test de restauration enregistré.');
    return problemes;
  }
  const [date, resultat, , ...message] = ligne.split(' ');
  const quand = Date.parse(date);
  if (resultat !== 'ok') {
    problemes.push(`Test de restauration en échec le ${formatDateTime(date)} : ${message.join(' ')}`);
  } else if (Number.isNaN(quand) || now.getTime() - quand > AGE_MAX_TEST_MS) {
    problemes.push(`Restauration non testée depuis le ${formatDateTime(date)}.`);
  }
  return problemes;
}
