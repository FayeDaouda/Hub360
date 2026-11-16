// Chargé avant Nest (voir charger.ts) : les décorateurs de class-transformer
// ont besoin des métadonnées de reflect-metadata, que Nest n'a pas encore importé.
import 'reflect-metadata';
import { existsSync } from 'fs';
import { plainToInstance, Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, IsUrl, Matches, Max, Min, validateSync } from 'class-validator';

// Variables d'environnement de l'API (12-factor) : lues dans backend/.env en
// développement, injectées par docker compose en production, et vérifiées au
// démarrage. Une configuration fausse arrête l'API tout de suite au lieu de
// casser une fonctionnalité plus tard. Rôle de chaque variable :
// backend/.env.example.

export const SECRET_JWT_PAR_DEFAUT = 'change-moi-en-production';
const LONGUEUR_MIN_SECRET_PRODUCTION = 32;

class VariablesEnvironnement {
  @IsOptional() @IsIn(['development', 'production', 'test']) NODE_ENV?: string;
  @Matches(/^postgres(ql)?:\/\//, { message: 'DATABASE_URL doit être une URL PostgreSQL (postgresql://…).' })
  DATABASE_URL!: string;
  @IsOptional() @IsString() JWT_SECRET?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(65_535) PORT?: number;
  @IsOptional() @IsUrl({ require_tld: false }) FRONT_URL?: string;
  @IsOptional() @IsString() CORS_ORIGINS?: string;
  @IsOptional()
  @Matches(/^(log|smtp)$/i, { message: 'EMAIL_TRANSPORT vaut « log » ou « smtp ».' })
  EMAIL_TRANSPORT?: string;
  @IsOptional() @IsString() SMTP_HOST?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(65_535) SMTP_PORT?: number;
  @IsOptional() @IsIn(['true', 'false']) SMTP_SECURE?: string;
  @IsOptional() @IsString() MAIL_FROM?: string;
  @IsOptional() @IsString() MAIL_MARQUE?: string;
  // Destinataire des alertes du suivi des erreurs (src/monitoring) ; absent :
  // les erreurs restent dans les journaux, sans e-mail.
  @IsOptional() @IsEmail() ALERTES_EMAIL?: string;
  // Dossier des sauvegardes, surveillé chaque matin (src/monitoring).
  @IsOptional() @IsString() SAUVEGARDES_DOSSIER?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) HUB_RELAIS?: number;
  @IsOptional() @IsIn(['obligatoire', 'desactive']) HUB_DOUBLE_FACTEUR?: string;
  @IsOptional() @IsIn(['autorise']) HUB_DONNEES_DEMO?: string;
  // Synchronisation de l'Agenda avec Google et Apple (16/11/2026) : clé de
  // chiffrement des accès (32 octets en base64) ; absente, la synchronisation
  // est désactivée. Identifiants de l'application Google (console Cloud).
  @IsOptional()
  @Matches(/^[A-Za-z0-9+/]{43}=$/, { message: 'AGENDA_CLE_CHIFFREMENT : 32 octets en base64 (openssl rand -base64 32).' })
  AGENDA_CLE_CHIFFREMENT?: string;
  @IsOptional() @IsString() GOOGLE_CLIENT_ID?: string;
  @IsOptional() @IsString() GOOGLE_CLIENT_SECRET?: string;
}

// Problèmes de configuration, en clair ; liste vide si tout est bon. Une
// variable vide (`SMTP_HOST=""` dans .env.example) vaut une variable absente.
export function problemesEnvironnement(env: NodeJS.ProcessEnv): string[] {
  const renseignees = Object.fromEntries(
    Object.entries(env).filter(([, valeur]) => valeur !== undefined && valeur !== ''),
  );
  const variables = plainToInstance(VariablesEnvironnement, renseignees);
  const problemes = validateSync(variables).flatMap((erreur) => Object.values(erreur.constraints ?? {}));

  // Un JWT signé par une valeur publiquement connue serait la pire des surprises.
  if (env.NODE_ENV === 'production') {
    const secret = env.JWT_SECRET ?? '';
    if (secret === SECRET_JWT_PAR_DEFAUT || secret.length < LONGUEUR_MIN_SECRET_PRODUCTION) {
      problemes.push(
        `JWT_SECRET doit être une valeur aléatoire d’au moins ${LONGUEUR_MIN_SECRET_PRODUCTION} caractères en production.`,
      );
    }
  }
  return problemes;
}

// Au tout début du démarrage : charge backend/.env s'il existe (sans écraser
// les variables déjà définies, celles de docker compose en production), puis
// refuse de démarrer sur une configuration invalide.
export function chargerEnvironnement(): void {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const problemes = problemesEnvironnement(process.env);
  if (problemes.length) {
    throw new Error(`Configuration invalide :\n${problemes.map((p) => `  - ${p}`).join('\n')}`);
  }
}
