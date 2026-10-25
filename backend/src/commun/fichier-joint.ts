import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength, ValidateBy } from 'class-validator';

// Fichier joint transmis en data URI base64 (stocké en base tant que le
// stockage objet n'est pas branché). Seul ce schéma est accepté : le front
// ouvre les fichiers par un lien, et une URL `javascript:…` y exécuterait du
// code dans la session de la personne qui télécharge (audit du 24/10/2026, C1).
export const DATA_URI_BASE64 = /^data:[^,;]*(;[^,;]+)*;base64,[A-Za-z0-9+/]*={0,2}$/;

// Types acceptés par usage (décision du 25/10/2026). Le type est reconnu par
// le contenu du fichier, jamais par son extension ni par le type déclaré par
// le navigateur. Refusés partout : SVG et HTML (scripts), ZIP (contenu
// incontrôlable) et tout ce qui n'est pas reconnu.
export type TypeFichier = 'pdf' | 'jpeg' | 'png' | 'heic' | 'webp' | 'dwg' | 'dxf' | 'docx' | 'xlsx' | 'pptx';
export type UsageFichier = 'rh' | 'projet' | 'contrat';

export const TYPES_PAR_USAGE: Record<UsageFichier, readonly TypeFichier[]> = {
  // Justificatifs, pièces du dossier, bulletins, attestations.
  rh: ['pdf', 'jpeg', 'png', 'heic'],
  // Livrables de projet. Formats BIM (Revit, ArchiCAD, SketchUp) à ajouter
  // après confirmation de l'équipe.
  projet: ['pdf', 'jpeg', 'png', 'heic', 'webp', 'dwg', 'dxf', 'docx', 'xlsx', 'pptx'],
  // Contrats (document, annexes, scan signé) et factures des bureaux d'études.
  contrat: ['pdf', 'jpeg', 'png', 'heic', 'docx', 'xlsx'],
};

const LIBELLES: Record<TypeFichier, string> = {
  pdf: 'PDF',
  jpeg: 'JPG',
  png: 'PNG',
  heic: 'HEIC',
  webp: 'WEBP',
  dwg: 'DWG',
  dxf: 'DXF',
  docx: 'DOCX',
  xlsx: 'XLSX',
  pptx: 'PPTX',
};

// Marques HEIF/HEIC (photos d'iPhone) à l'octet 8, après « ftyp ».
const MARQUES_HEIC = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);
// Les documents Office récents sont des ZIP : on les reconnaît à leur
// manifeste et au dossier propre à chaque application.
const DOSSIERS_OFFICE: [string, TypeFichier][] = [
  ['word/', 'docx'],
  ['xl/', 'xlsx'],
  ['ppt/', 'pptx'],
];
// Assez pour lire les premiers en-têtes d'un ZIP Office (manifeste et
// premières parties), sans décoder un fichier de 15 Mo.
const OCTETS_ANALYSES = 48 * 1024;

function commencePar(octets: Buffer, signature: string | number[], decalage = 0): boolean {
  const motif = typeof signature === 'string' ? Buffer.from(signature, 'latin1') : Buffer.from(signature);
  return octets.subarray(decalage, decalage + motif.length).equals(motif);
}

export function typeDuContenu(octets: Buffer): TypeFichier | null {
  if (commencePar(octets, '%PDF-')) return 'pdf';
  if (commencePar(octets, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (commencePar(octets, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (commencePar(octets, 'RIFF') && commencePar(octets, 'WEBP', 8)) return 'webp';
  if (commencePar(octets, 'ftyp', 4) && MARQUES_HEIC.has(octets.subarray(8, 12).toString('latin1'))) return 'heic';
  if (/^AC10[0-3]\d/.test(octets.subarray(0, 6).toString('latin1'))) return 'dwg';
  if (
    commencePar(octets, 'AutoCAD Binary DXF') ||
    /^\s*0\s*\r?\n\s*SECTION\b/.test(octets.subarray(0, 64).toString('latin1'))
  )
    return 'dxf';
  if (commencePar(octets, [0x50, 0x4b, 0x03, 0x04])) {
    const contenu = octets.toString('latin1');
    if (!contenu.includes('[Content_Types].xml')) return null;
    return DOSSIERS_OFFICE.find(([dossier]) => contenu.includes(dossier))?.[1] ?? null;
  }
  return null;
}

// Début du fichier décodé depuis sa data URI (base64 décodé par blocs de 4).
function debutDuFichier(dataUri: string): Buffer {
  const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
  const longueur = Math.min(base64.length, Math.ceil((OCTETS_ANALYSES * 4) / 3 / 4) * 4);
  return Buffer.from(base64.slice(0, longueur), 'base64');
}

export const messageTypesAcceptes = (usage: UsageFichier) =>
  `Type de fichier refusé : ${TYPES_PAR_USAGE[usage].map((t) => LIBELLES[t]).join(', ')} uniquement.`;

// Champ `url` d'un fichier joint : data URI base64 d'au plus `longueurMax`
// caractères, dont le contenu est l'un des types acceptés pour cet usage.
export function UrlFichierJoint(longueurMax: number, usage: UsageFichier) {
  return applyDecorators(
    IsString(),
    MaxLength(longueurMax),
    Matches(DATA_URI_BASE64, { message: 'Fichier invalide.' }),
    ValidateBy({
      name: 'typeFichierAccepte',
      validator: {
        validate: (valeur: unknown) => {
          if (typeof valeur !== 'string' || !DATA_URI_BASE64.test(valeur)) return true; // déjà signalé par Matches
          const type = typeDuContenu(debutDuFichier(valeur));
          return type !== null && TYPES_PAR_USAGE[usage].includes(type);
        },
        defaultMessage: () => messageTypesAcceptes(usage),
      },
    }),
  );
}
