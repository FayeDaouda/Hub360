// Affiché automatiquement par Next.js pendant que PortailPage (async) va
// chercher les sociétés — même gabarit que les vraies cartes, sous l'en-tête
// déjà en place (layout), pour que rien ne saute à l'arrivée des données.
export default function PortailLoading() {
  return (
    <ul className="portail-societes" aria-busy="true" aria-label="Chargement des sociétés">
      {[0, 1, 2].map((i) => (
        <li key={i}>
          <div className="societe-carte societe-carte--squelette">
            <div className="auth-squelette societe-carte-logo" />
            <div className="societe-carte-corps">
              <div className="auth-squelette" style={{ width: '70%', height: '1rem' }} />
              <div
                className="auth-squelette"
                style={{ width: '50%', height: '0.8rem', marginTop: '0.55rem' }}
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
