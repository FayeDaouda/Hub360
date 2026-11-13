// Calendrier au format iCalendar (RFC 5545), lu par Google Agenda, Apple
// Calendrier et Outlook (12/11/2026). Deux usages : l'abonnement personnel
// (METHOD:PUBLISH, relu par l'agenda de la personne) et l'invitation jointe à
// un e-mail (REQUEST à l'envoi, CANCEL à l'annulation). Pur, sans dépendance.

export type PersonneIcal = { nom: string; email: string };

export type EvenementIcal = {
  // Identifiant stable : c'est lui qui fait qu'une mise à jour remplace
  // l'événement au lieu d'en ajouter un second.
  uid: string;
  titre: string;
  // Horodaté (Date, écrit en UTC) ou journée entière (« AAAA-MM-JJ »).
  debut: Date | string;
  // Journée entière : le dernier jour, INCLUS (le format veut le lendemain).
  fin: Date | string;
  lieu?: string | null;
  description?: string | null;
  url?: string | null;
  // Ne bloque pas le temps de la personne (une échéance).
  libre?: boolean;
  annule?: boolean;
  // Incrémentée à chaque nouvelle version envoyée d'une invitation.
  sequence?: number;
  // Alerte de l'agenda, ces minutes avant le début (12/11/2026).
  rappelMinutes?: number | null;
  organisateur?: PersonneIcal | null;
  invites?: PersonneIcal[];
};

export type MethodeIcal = 'PUBLISH' | 'REQUEST' | 'CANCEL';

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

// Texte d'une propriété : barre oblique inverse, point-virgule, virgule et
// retour à la ligne échappés (RFC 5545 §3.3.11).
export function echapperTexte(v: string): string {
  return (
    v
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n|\r|\n/g, '\\n')
      // Aucun autre caractère de contrôle (§3.3.11), la tabulation exceptée.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
  );
}

// Paramètre CN : entre guillemets, sans guillemet ni caractère de contrôle.
// eslint-disable-next-line no-control-regex
const nomParametre = (nom: string) => `"${nom.replace(/["\u0000-\u001f\u007f]/g, '').trim()}"`;

// Une adresse dans « mailto: » : rien qui casse la ligne.
// eslint-disable-next-line no-control-regex
const adresse = (email: string) => email.replace(/[\s;:,"<>\u0000-\u001f\u007f]/g, '');

// Lignes de 75 octets au plus, la suite commence par une espace (§3.1), sans
// jamais couper un caractère UTF-8 en deux.
export function plierLigne(ligne: string): string {
  const morceaux: string[] = [];
  let courant = '';
  let octets = 0;
  for (const car of ligne) {
    const taille = Buffer.byteLength(car, 'utf8');
    const max = morceaux.length ? 74 : 75; // la suite porte l'espace de tête
    if (octets + taille > max) {
      morceaux.push(courant);
      courant = '';
      octets = 0;
    }
    courant += car;
    octets += taille;
  }
  morceaux.push(courant);
  return morceaux.join('\r\n ');
}

const horodatage = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
const jourCompact = (j: string) => j.replace(/-/g, '');
const lendemain = (j: string) => {
  const d = new Date(`${j}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

function dates(e: EvenementIcal): string[] {
  if (typeof e.debut === 'string' || typeof e.fin === 'string') {
    const debut = String(e.debut);
    const fin = String(e.fin);
    if (!JOUR.test(debut) || !JOUR.test(fin)) throw new Error(`Journée entière invalide : ${debut} → ${fin}`);
    return [`DTSTART;VALUE=DATE:${jourCompact(debut)}`, `DTEND;VALUE=DATE:${jourCompact(lendemain(fin))}`];
  }
  return [`DTSTART:${horodatage(e.debut)}`, `DTEND:${horodatage(e.fin)}`];
}

function evenement(e: EvenementIcal, methode: MethodeIcal, maintenant: Date): string[] {
  const lignes = [
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${horodatage(maintenant)}`,
    ...dates(e),
    `SUMMARY:${echapperTexte(e.titre)}`,
  ];
  if (e.lieu) lignes.push(`LOCATION:${echapperTexte(e.lieu)}`);
  if (e.description) lignes.push(`DESCRIPTION:${echapperTexte(e.description)}`);
  if (e.url) lignes.push(`URL:${e.url}`);
  if (e.organisateur) {
    lignes.push(`ORGANIZER;CN=${nomParametre(e.organisateur.nom)}:mailto:${adresse(e.organisateur.email)}`);
  }
  for (const p of e.invites ?? []) {
    const reponse = methode === 'REQUEST' ? ';PARTSTAT=NEEDS-ACTION;RSVP=TRUE' : '';
    lignes.push(`ATTENDEE;CN=${nomParametre(p.nom)};ROLE=REQ-PARTICIPANT${reponse}:mailto:${adresse(p.email)}`);
  }
  lignes.push(
    `SEQUENCE:${e.sequence ?? 0}`,
    `STATUS:${e.annule || methode === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    `TRANSP:${e.libre ? 'TRANSPARENT' : 'OPAQUE'}`,
  );
  // L'alerte vient après les propriétés de l'événement (§3.6.1).
  if (e.rappelMinutes && methode !== 'CANCEL') {
    lignes.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${echapperTexte(e.titre)}`,
      `TRIGGER:-PT${Math.round(e.rappelMinutes)}M`,
      'END:VALARM',
    );
  }
  lignes.push('END:VEVENT');
  return lignes;
}

export function calendrierIcal(c: {
  nom: string;
  methode: MethodeIcal;
  evenements: EvenementIcal[];
  maintenant?: Date;
}): string {
  const maintenant = c.maintenant ?? new Date();
  const lignes = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//hub360//Agenda//FR',
    'CALSCALE:GREGORIAN',
    `METHOD:${c.methode}`,
    `X-WR-CALNAME:${echapperTexte(c.nom)}`,
    'X-WR-TIMEZONE:Africa/Dakar',
    // Fréquence de relecture conseillée (Apple et Outlook la suivent ; Google
    // garde son propre rythme, de quelques heures).
    ...(c.methode === 'PUBLISH' ? ['REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'] : []),
    // Toujours un composant, même sans événement (RFC 5545 §3.6) : le fuseau
    // de Dakar, UTC toute l'année.
    'BEGIN:VTIMEZONE',
    'TZID:Africa/Dakar',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0000',
    'TZOFFSETTO:+0000',
    'TZNAME:GMT',
    'END:STANDARD',
    'END:VTIMEZONE',
    ...c.evenements.flatMap((e) => evenement(e, c.methode, maintenant)),
    'END:VCALENDAR',
  ];
  return lignes.map(plierLigne).join('\r\n') + '\r\n';
}
