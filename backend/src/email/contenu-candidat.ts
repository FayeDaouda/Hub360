import { CandidatEmail } from './email.service';
import { escapeHtml, formatTime, formatWeekdayDayMonth } from '@hub/domain';

// E-mails au candidat d'un appel à candidatures (01/11/2026), au nom de la
// société. Pur (aucune I/O) — même motif que contenu-contrat.ts. Ton
// professionnel et sobre ; une réponse négative ne donne jamais le motif
// interne.
export function contenuCandidat(c: CandidatEmail): { sujet: string; texte: string; html: string } {
  const marque = process.env.MAIL_MARQUE || 'hub360°';
  let sujet: string;
  let corps: string[];
  if (c.type === 'accuse') {
    sujet = `Candidature reçue — ${c.poste} — ${c.societeNom}`;
    corps = [
      `Nous avons bien reçu votre candidature au poste de ${c.poste} et vous remercions de l’intérêt que vous portez à ${c.societeNom}.`,
      'Notre équipe l’étudie avec attention. Si votre profil est retenu pour la suite, nous vous contacterons pour convenir d’un entretien.',
    ];
  } else if (c.type === 'convocation') {
    const quand = `${formatWeekdayDayMonth(c.debut)}, de ${formatTime(c.debut)} à ${formatTime(c.fin)}`;
    sujet = `Entretien — ${c.poste} — ${c.societeNom}`;
    corps = [
      `Suite à votre candidature au poste de ${c.poste}, nous avons le plaisir de vous convier à un entretien.`,
      `Date : ${quand}${c.lieu ? `\nLieu : ${c.lieu}` : ''}`,
      'Si ce créneau ne vous convient pas, merci de nous le faire savoir en répondant à ce message.',
    ];
  } else if (c.retenu) {
    sujet = `Votre candidature — ${c.poste} — ${c.societeNom}`;
    corps = [
      `Nous avons le plaisir de vous annoncer que votre candidature au poste de ${c.poste} a été retenue.`,
      'Notre équipe vous contactera très prochainement pour les prochaines étapes de votre arrivée.',
    ];
  } else {
    sujet = `Votre candidature — ${c.poste} — ${c.societeNom}`;
    corps = [
      `Nous vous remercions pour votre candidature au poste de ${c.poste} et pour le temps que vous nous avez consacré.`,
      'Après étude attentive, nous ne sommes pas en mesure d’y donner une suite favorable. Nous vous souhaitons pleine réussite dans vos projets.',
    ];
  }
  const signature = `L’équipe de ${c.societeNom}`;
  const pied = `Référence de votre candidature : ${c.reference}. Envoyé via ${marque}.`;

  const texte = [`Bonjour ${c.prenom},`, '', ...corps.flatMap((p) => [p, '']), signature, '', pied].join('\n');
  const html = [
    `<p>Bonjour ${escapeHtml(c.prenom)},</p>`,
    ...corps.map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`),
    `<p>${escapeHtml(signature)}</p>`,
    `<p style="color:#6c6960;font-size:13px">${escapeHtml(pied)}</p>`,
  ].join('');
  return { sujet, texte, html };
}
