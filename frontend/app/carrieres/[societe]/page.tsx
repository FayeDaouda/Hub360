'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Briefcase, CalendarClock, MapPin } from 'lucide-react';
import { formatLongDate } from '@hub/domain';
import { getCarrieres, type PageCarrieres } from '@/lib/candidature-publique';
import { BanniereMarque, PageIntrouvable, PiedMarque, Reperes } from '@/components/recrutement/public';

type Props = { params: Promise<{ societe: string }> };

// Page Carrières d'une société (publique, 01/11/2026) : ses appels à
// candidatures ouverts, chacun menant à sa page pour postuler.
export default function CarrieresPage(props: Props) {
  const { societe } = use(props.params);
  const [page, setPage] = useState<PageCarrieres | null | undefined>(undefined);

  useEffect(() => {
    getCarrieres(societe)
      .then((p) => {
        setPage(p);
        document.title = `Carrières — ${p.societe.nom}`;
      })
      .catch(() => setPage(null));
  }, [societe]);

  if (page === undefined) {
    return (
      <main className="rp-page">
        <div className="rp-banniere rp-banniere--squelette skeleton" aria-hidden />
      </main>
    );
  }
  if (page === null) {
    return <PageIntrouvable titre="Page introuvable" texte="Cette page Carrières n’existe pas. Vérifiez l’adresse." />;
  }

  return (
    <main className="rp-page">
      <BanniereMarque societe={page.societe} surtitre="Carrières">
        <h1 className="rp-titre">Rejoignez {page.societe.nom}</h1>
        <p className="rp-sous-titre">
          {page.appels.length
            ? `${page.appels.length} offre${page.appels.length > 1 ? 's ouvertes' : ' ouverte'} aujourd’hui`
            : 'Aucune offre ouverte pour le moment'}
        </p>
      </BanniereMarque>

      <div className="rp-offres">
        {page.appels.length === 0 ? (
          <div className="rp-carte rp-vide">
            <h2>Revenez bientôt</h2>
            <p>{page.societe.nom} n’a pas d’offre ouverte en ce moment. Les prochaines seront publiées ici.</p>
          </div>
        ) : (
          page.appels.map((a) => (
            <Link key={a.slug} href={`/candidature/${a.slug}`} className="rp-carte rp-offre">
              <span className="rp-offre-corps">
                <h2>{a.poste}</h2>
                <Reperes
                  items={[
                    a.lieu && (
                      <>
                        <MapPin size={14} aria-hidden /> {a.lieu}
                      </>
                    ),
                    a.typeContrat && (
                      <>
                        <Briefcase size={14} aria-hidden /> {a.typeContrat}
                      </>
                    ),
                    a.dateLimite && (
                      <>
                        <CalendarClock size={14} aria-hidden /> Jusqu’au {formatLongDate(a.dateLimite)}
                      </>
                    ),
                  ]}
                />
                <span className="rp-meta">Publiée le {formatLongDate(a.publieLe.slice(0, 10))}</span>
              </span>
              <span className="rp-offre-action">
                Postuler <ArrowRight size={16} aria-hidden />
              </span>
            </Link>
          ))
        )}
      </div>
      <PiedMarque societe={page.societe} />
    </main>
  );
}
