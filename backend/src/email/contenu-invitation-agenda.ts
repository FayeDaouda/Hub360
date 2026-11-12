import { InvitationAgendaEmail } from './email.service';
import { escapeHtml, formatTime, formatWeekdayDayMonth, toIsoDay } from '@hub/domain';

// E-mail d'invitation à une réunion de l'Agenda (12/11/2026), pur (aucune
// I/O) — même motif que contenu-candidat.ts. Le calendrier joint fait le
// travail (ajout à l'agenda, « Oui / Non ») ; le texte reste lisible seul.
export function contenuInvitationAgenda(i: InvitationAgendaEmail): { sujet: string; texte: string; html: string } {
  const marque = process.env.MAIL_MARQUE || 'hub360°';
  const debut = i.debut.toISOString();
  const fin = i.fin.toISOString();
  // Sur plusieurs jours : la date de fin aussi.
  const quand =
    toIsoDay(i.debut) === toIsoDay(i.fin)
      ? `${formatWeekdayDayMonth(debut)}, de ${formatTime(debut)} à ${formatTime(fin)}`
      : `du ${formatWeekdayDayMonth(debut)}, ${formatTime(debut)}, au ${formatWeekdayDayMonth(fin)}, ${formatTime(fin)}`;
  const annulee = i.methode === 'CANCEL';
  const sujet = `${annulee ? 'Annulée' : 'Invitation'} : ${i.titre} · ${formatWeekdayDayMonth(debut)} à ${formatTime(debut)}`;
  const corps = annulee
    ? [`${i.organisateurNom} a annulé cette réunion. Elle est retirée de votre agenda.`]
    : [
        `${i.organisateurNom} vous invite à une réunion.`,
        'Répondez avec « Oui » ou « Non » dans votre messagerie : la réunion s’ajoute à votre agenda.',
      ];
  const details = [`${i.titre}`, `Date : ${quand}`, ...(i.lieu ? [`Lieu : ${i.lieu}`] : [])];
  const pied = `${i.societeNom} · envoyé via ${marque}. Votre agenda du HUB : ${i.lien}`;

  const texte = [`Bonjour ${i.prenom},`, '', ...corps, '', ...details, '', pied].join('\n');
  const html = [
    `<p>Bonjour ${escapeHtml(i.prenom)},</p>`,
    ...corps.map((p) => `<p>${escapeHtml(p)}</p>`),
    `<p><strong>${escapeHtml(i.titre)}</strong><br>${details.slice(1).map(escapeHtml).join('<br>')}</p>`,
    `<p style="color:#6c6960;font-size:13px">${escapeHtml(`${i.societeNom} · envoyé via ${marque}.`)} <a href="${escapeHtml(i.lien)}">Votre agenda du HUB</a></p>`,
  ].join('');
  return { sujet, texte, html };
}
