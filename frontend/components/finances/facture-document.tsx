import { formatAmount } from '@/lib/format';
import { montantEnLettres } from '@/lib/montant-lettres';
import type { ProfilFacturation } from '@/lib/facturation';
import type { LigneDocument } from '@/components/document-facturation';
import type { Cgv } from '@/lib/cgv';

// Document de facture et d'avoir (lot 6) — sobre, aéré, A4, dans l'esprit des
// factures Zervant, avec les mentions attendues au Sénégal : identité de
// l'émetteur (NINEA, COFI, RCCM, capital), client (adresse, NINEA), ce que le
// client reconnaît (projet nommé, tranche, offre acceptée), lignes avec unité,
// totaux HT / TVA / TTC, somme en toutes lettres, règlement, cachet et
// signature, conditions (CGV citées en page 1, jointes en annexe — demande du
// CEO), pénalités et mentions en pied, pages numérotées à l'impression. Tout
// ce qui est vide dans le profil n'est pas imprimé.

export type LigneFacture = LigneDocument & { unite?: string };

export type FactureDocumentProps = {
  estAvoir: boolean;
  reference: string | null; // null = brouillon, numéro attribué à l'émission
  factureOrigine: string | null; // avoir : la facture qu'il annule
  dateEmission: string | null; // déjà formatée
  dateEcheance: string | null;
  aReception: boolean; // payable à réception : l'échéance est la date d'émission
  projet: { nom: string | null; code: string | null } | null; // « Villa — Yoff » + code interne
  tranche: string | null; // « F2 · 2 sur 3 »
  offre: { reference: string; accepteeLe: string | null } | null; // date déjà formatée
  objet: string | null;
  client: {
    nom: string;
    adresse?: string | null;
    ninea?: string | null;
    email?: string | null;
    telephone?: string | null;
  };
  lignes: LigneFacture[];
  montantHt: number;
  tauxTva: number;
  montantTva: number;
  montantTtc: number;
  emetteur: ProfilFacturation & { logoUrl: string | null };
  penaliteRetardMensuelle: number | null;
  essai: boolean; // préfixe TEST : facture d'essai, sans valeur
  cgv: Cgv | null; // CGV de la société, citées sur la facture (pas sur l'avoir)
  // CGV complètes : jointes à ce document, déjà remises avec la 1re facture du
  // projet, ou non jointes (réglage du CFO).
  annexeCgv: 'jointe' | 'deja_remise' | 'non_jointe';
  // Récapitulatif d'une facture de tranche (HT) ; null sinon.
  echeancier: {
    libelle: string; // « Honoraires totaux (offre DIO_NGO.26-OF1) »
    total: number;
    deja: { tranches: string[]; ht: number };
    presente: { tranche: string; ht: number };
    reste: { tranches: string[]; ht: number };
  } | null;
};

// Articles des CGV rappelés en page 1 : ceux qui jouent au moment de payer
// (la pénalité de l'art. 13 est déjà dans le pied).
const ARTICLES_RAPPELES = [9, 15];

const ligne = (...parts: (string | null | undefined | false)[]) =>
  parts.filter((p): p is string => !!p && !!p.trim()).join(' · ');
// Montant d'avoir : imprimé en négatif, comme dans le journal des ventes.
const montant = (n: number) => formatAmount(n);

export function FactureDocument(p: FactureDocumentProps) {
  const e = p.emetteur;
  const titre = p.estAvoir ? 'Avoir' : 'Facture';
  const logo = e.logoDocument || e.logoUrl;
  const reglement = [
    e.banque || e.rib ? { libelle: 'Virement bancaire', valeur: ligne(e.banque, e.rib && `RIB ${e.rib}`) } : null,
    e.wave ? { libelle: 'Wave', valeur: e.wave } : null,
    e.orangeMoney ? { libelle: 'Orange Money', valeur: e.orangeMoney } : null,
  ].filter((x): x is { libelle: string; valeur: string } => !!x);
  const fiscal = ligne(e.ninea && `NINEA ${e.ninea}`, e.cofi && `COFI ${e.cofi}`, e.rccm && `RCCM ${e.rccm}`);
  // Pied légal composé des champs du profil (dans l'ordre des CGV), puis les mentions libres.
  const legal = ligne(e.raisonSociale, fiscal, e.capital && `Capital ${e.capital}`);
  const cgv = p.estAvoir ? null : p.cgv;
  const annexe = !!cgv && p.annexeCgv === 'jointe';
  const echeance = p.aReception
    ? p.dateEcheance
      ? `à réception, le ${p.dateEcheance}`
      : 'à réception'
    : p.dateEcheance;
  const offre =
    p.offre &&
    `${p.offre.reference}${p.offre.accepteeLe ? ` du\u00a0${p.offre.accepteeLe.replace(/ /g, '\u00a0')}` : ''}`;

  return (
    <>
      <article className="fd" aria-label={`${titre} ${p.reference ?? 'brouillon'}`}>
        {p.essai && (
          <p className="fd-essai" role="note">
            {p.estAvoir ? 'Avoir d’essai' : 'Facture d’essai'} (préfixe TEST) : sans valeur comptable
          </p>
        )}
        <header className="fd-tete">
          <div className="fd-emetteur">
            {logo && <img className="fd-logo" src={logo} alt={e.raisonSociale} />}
            <p className="fd-raison">{e.raisonSociale}</p>
            {e.adresse && <p>{e.adresse}</p>}
            {ligne(e.telephone, e.email) && <p>{ligne(e.telephone, e.email)}</p>}
            {fiscal && <p>{fiscal}</p>}
          </div>
          <div className="fd-titre">
            <h1>{titre}</h1>
            <p className="fd-numero">{p.reference ?? 'Brouillon · numéro attribué à l’émission'}</p>
            <dl className="fd-dates">
              {p.dateEmission && (
                <div>
                  <dt>Date d’émission</dt>
                  <dd>{p.dateEmission}</dd>
                </div>
              )}
              {!p.estAvoir && echeance && (
                <div>
                  <dt>Échéance</dt>
                  <dd>{echeance}</dd>
                </div>
              )}
            </dl>
          </div>
        </header>

        <section className="fd-blocs">
          <div className="fd-client">
            <p className="fd-etiquette">Facturé à</p>
            <p className="fd-client-nom">{p.client.nom}</p>
            {p.client.adresse && <p className="fd-adresse">{p.client.adresse}</p>}
            {ligne(p.client.telephone, p.client.email) && <p>{ligne(p.client.telephone, p.client.email)}</p>}
            {p.client.ninea && <p>NINEA {p.client.ninea}</p>}
          </div>
          <dl className="fd-refs">
            {p.estAvoir && p.factureOrigine && (
              <div>
                <dt>Avoir sur la facture</dt>
                <dd>{p.factureOrigine}</dd>
              </div>
            )}
            {p.projet && (p.projet.nom || p.projet.code) && (
              <div>
                <dt>Projet</dt>
                <dd>
                  {p.projet.nom ?? p.projet.code}
                  {p.projet.nom && p.projet.code && <span className="fd-code">Réf. {p.projet.code}</span>}
                </dd>
              </div>
            )}
            {p.tranche && (
              <div>
                <dt>Tranche</dt>
                <dd>{p.tranche}</dd>
              </div>
            )}
            {offre && (
              <div>
                <dt>Offre acceptée</dt>
                <dd>{offre}</dd>
              </div>
            )}
          </dl>
        </section>

        {/* L'objet n'est rappelé que s'il dit autre chose que l'unique ligne. */}
        {p.objet && !(p.lignes.length === 1 && p.lignes[0].designation === p.objet) && (
          <p className="fd-objet">{p.objet}</p>
        )}

        <table className="fd-table">
          <thead>
            <tr>
              <th>Désignation</th>
              <th className="num">Qté</th>
              <th>Unité</th>
              <th className="num">P.U. HT</th>
              <th className="num">Total HT</th>
            </tr>
          </thead>
          <tbody>
            {p.lignes.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.designation}
                  {l.detail && <span className="fd-detail">{l.detail}</span>}
                </td>
                <td className="num">{l.quantite.toLocaleString('fr-FR')}</td>
                <td>{l.unite ?? 'Forfait'}</td>
                <td className="num">{montant(l.prixUnitaire)}</td>
                <td className="num">{montant(l.montantHt)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Échéancier de l'offre à gauche des totaux : le client voit où il en
            est sans ressortir son contrat. */}
        <div className="fd-chiffres">
          {p.echeancier && <RecapEcheancier r={p.echeancier} />}
          <div className="fd-totaux">
            <dl>
              <div>
                <dt>Total HT</dt>
                <dd>{montant(p.montantHt)}</dd>
              </div>
              <div>
                <dt>TVA {String(p.tauxTva).replace('.', ',')} %</dt>
                <dd>{montant(p.montantTva)}</dd>
              </div>
              <div className="fd-ttc">
                <dt>{p.estAvoir ? 'Total TTC de l’avoir' : 'Total TTC'}</dt>
                <dd>{montant(p.montantTtc)}</dd>
              </div>
            </dl>
          </div>
        </div>
        <p className="fd-lettres">
          {p.estAvoir ? 'Arrêté le présent avoir' : 'Arrêtée la présente facture'} à la somme de{' '}
          <strong>{montantEnLettres(p.montantTtc)} TTC</strong>
          {p.estAvoir ? `, à déduire${p.factureOrigine ? ` de la facture ${p.factureOrigine}` : ''}.` : '.'}
        </p>

        <div className="fd-bas">
          <section className="fd-reglement">
            {p.estAvoir ? (
              <>
                <p className="fd-etiquette">Effet de l’avoir</p>
                <p>
                  Cet avoir annule {p.factureOrigine ? `la facture ${p.factureOrigine}` : 'la facture d’origine'} pour
                  le montant indiqué. Il vient en déduction des sommes dues ou fait l’objet d’un remboursement.
                </p>
              </>
            ) : (
              (echeance || e.conditionsPaiement || reglement.length > 0) && (
                <>
                  <p className="fd-etiquette">Règlement</p>
                  {echeance && (
                    <p>
                      {p.aReception ? (
                        <>
                          À régler à réception
                          {p.dateEcheance && (
                            <>
                              , le <strong>{p.dateEcheance}</strong>
                            </>
                          )}
                          .
                        </>
                      ) : (
                        <>
                          À régler au plus tard le <strong>{p.dateEcheance}</strong>.
                        </>
                      )}
                    </p>
                  )}
                  {e.conditionsPaiement && <p>{e.conditionsPaiement}</p>}
                  {reglement.length > 0 && (
                    <dl>
                      {reglement.map((r) => (
                        <div key={r.libelle}>
                          <dt>{r.libelle}</dt>
                          <dd>{r.valeur}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <p className="fd-rappel">
                    Merci de rappeler le numéro {p.reference ?? 'de la facture'} avec votre règlement.
                  </p>
                </>
              )
            )}
          </section>
          <div className="fd-cachet">
            <p className="fd-etiquette">Cachet et signature</p>
          </div>
        </div>

        {cgv && (
          <section className="fd-conditions">
            <p className="fd-etiquette">Conditions</p>
            <p>
              Prestations régies par les conditions générales de vente de {e.raisonSociale}, édition {cgv.edition}
              {p.offre ? `, acceptées avec l’offre ${p.offre.reference}` : ''}
              {annexe
                ? ', jointes en annexe.'
                : p.annexeCgv === 'deja_remise'
                  ? ', remises en annexe de la première facture du projet.'
                  : '.'}
            </p>
            {cgv.articles
              .filter((a) => ARTICLES_RAPPELES.includes(a.numero))
              .map((a) => (
                <p key={a.numero}>
                  <strong>
                    Art. {a.numero} · {a.titre}.
                  </strong>{' '}
                  {a.paragraphes.join(' ')}
                </p>
              ))}
          </section>
        )}

        <footer className="fd-pied">
          {!p.estAvoir && p.penaliteRetardMensuelle != null && (
            <p>
              Tout retard de paiement au-delà de l’échéance entraîne de plein droit des pénalités de{' '}
              {String(p.penaliteRetardMensuelle).replace('.', ',')} % par mois sur les sommes dues.
            </p>
          )}
          {legal && <p>{legal}</p>}
          {e.mentionsPied && <p>{e.mentionsPied}</p>}
        </footer>
      </article>

      {/* Annexe hors de la facture : la grille de .fd se découpe mal entre
          les pages à l'impression (page blanche, pied superposé). */}
      {annexe && cgv && (
        <section className="fd fd-annexe" aria-label="Conditions générales de vente">
          <header>
            <p className="fd-etiquette">Annexe · {p.reference ?? 'facture'}</p>
            <h2>Conditions générales de vente · édition {cgv.edition}</h2>
          </header>
          <div className="fd-articles">
            {cgv.articles.map((a) => (
              <section key={a.numero}>
                <h3>
                  {a.numero}. {a.titre}
                </h3>
                {a.paragraphes.map((x, i) => (
                  <p key={i}>{x}</p>
                ))}
              </section>
            ))}
          </div>
          {legal && <p className="fd-annexe-pied">{legal}</p>}
        </section>
      )}
    </>
  );
}

// Récapitulatif HT de l'échéancier, sous le total : total de l'offre, déjà
// facturé, présente facture, reste à facturer (avec la part de chaque ligne).
function RecapEcheancier({ r }: { r: NonNullable<FactureDocumentProps['echeancier']> }) {
  const part = (ht: number) => (r.total > 0 ? `, ${Math.round((ht / r.total) * 100)} %` : '');
  const detail = (t: string[], ht: number) => (t.length ? ` (${t.join(', ')}${part(ht)})` : '');
  return (
    <section className="fd-recap" aria-label="Échéancier de l’offre">
      <p className="fd-etiquette">Échéancier de l’offre</p>
      <table>
        <tbody>
          <tr>
            <th scope="row">{r.libelle}</th>
            <td className="num">{montant(r.total)}</td>
          </tr>
          <tr>
            <th scope="row">Déjà facturé{detail(r.deja.tranches, r.deja.ht)}</th>
            <td className="num">{montant(r.deja.ht)}</td>
          </tr>
          <tr className="fd-recap-presente">
            <th scope="row">Présente facture{detail([r.presente.tranche], r.presente.ht)}</th>
            <td className="num">{montant(r.presente.ht)}</td>
          </tr>
          <tr>
            <th scope="row">Reste à facturer{detail(r.reste.tranches, r.reste.ht)}</th>
            <td className="num">{montant(r.reste.ht)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
