import { PROCESSUS, PROCESSUS_NOMENCLATURE } from '@/lib/equipes';

// Nomenclature des cellules · ISO 9001 (maquette « Équipes »).
export function Nomenclature({ prefixe }: { prefixe: string }) {
  return (
    <section className="panel glass-panel eq-nomenclature" aria-labelledby="eq-nomenclature-titre">
      <h2 id="eq-nomenclature-titre">Nomenclature des cellules · ISO 9001</h2>
      <p>
        Format <strong className="eq-format">SOCIÉTÉ-PROCESSUS-NN</strong>. Le code est stable et jamais réutilisé ; le
        nom d’usage et la clientèle peuvent évoluer.
      </p>
      <dl>
        {PROCESSUS_NOMENCLATURE.map((p) => (
          <div key={p}>
            <dt className="eq-code">
              {prefixe}-{p}-nn
            </dt>
            <dd>
              <strong>{PROCESSUS[p].libelle}</strong>
              <small>ISO 9001 {PROCESSUS[p].iso}</small>
            </dd>
          </div>
        ))}
      </dl>
      <p className="eq-aide">
        Chaque cellule a un pilote (§5.3), une fiche de mission et ses indicateurs (§9.1) : respect des délais des
        livrables, reprises (devis TS), heures passées.
      </p>
    </section>
  );
}
