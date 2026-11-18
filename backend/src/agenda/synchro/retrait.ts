import type { Logger } from '@nestjs/common';
import { dechiffrer } from './chiffrement';
import { ErreurGoogle, type ClientGoogle } from './google.client';

// Une connexion qui quitte le HUB (déconnexion, autre compte Google, compte
// ou sessions coupés) : les réunions que le HUB avait écrites chez Google en
// sont retirées — sinon elles y resteraient figées, jamais plus mises à
// jour —, puis l'accès est révoqué (16/11/2026).
// « fait » : retirées et révoqué, ou rien à faire (accès déjà retiré chez
// Google, ou illisible) ; « injoignable » : Google ne répond pas alors que
// l'accès vaut encore — à l'appelant de décider (réessayer, ou abandonner).
export async function retirerDeGoogle(
  google: ClientGoogle,
  c: { id: string; accesChiffre: string; liens: { agendaId: string; idExterne: string }[] },
  cle: Buffer,
  log: Logger,
  // Pause (18/11/2026) : retirer les réunions sans révoquer l'accès.
  options: { revoquer?: boolean } = {},
): Promise<'fait' | 'injoignable'> {
  let rafraichissement: string;
  try {
    rafraichissement = dechiffrer(c.accesChiffre, cle);
  } catch {
    return 'fait'; // illisible (clé changée) : rien à révoquer d'ici
  }
  let acces: string;
  try {
    acces = await google.acces(rafraichissement);
  } catch (e) {
    if (e instanceof ErreurGoogle && e.accesRevoque) return 'fait'; // déjà retiré chez Google
    return 'injoignable';
  }
  for (const l of c.liens) {
    try {
      await google.supprimer(acces, l.agendaId, l.idExterne);
    } catch {
      // Un événement déjà parti chez Google : on continue.
    }
  }
  if (options.revoquer === false) return 'fait';
  try {
    await google.revoquer(rafraichissement);
  } catch (e) {
    log.warn(`révocation ${c.id} : ${e instanceof Error ? e.message : e}`);
  }
  return 'fait';
}
