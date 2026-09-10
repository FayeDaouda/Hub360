// Affiché automatiquement par Next.js pendant que PortailPage (async) va
// chercher les sociétés — évite un flash blanc/spinner le temps de l'appel API.
export default function PortailLoading() {
  return (
    <main className="portal">
      <div className="portal-inner">
        <header className="portal-header">
          <img
            src="/logos/hub-icon-2.png"
            alt="hub360°"
            className="portal-logo"
            width={152}
            height={80}
          />
        </header>
        <div className="societe-grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="societe-card societe-card--skeleton">
              <div className="skeleton skeleton-avatar" />
              <div className="societe-card-body">
                <div className="skeleton skeleton-line" style={{ width: '70%' }} />
                <div className="skeleton skeleton-line" style={{ width: '45%' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
