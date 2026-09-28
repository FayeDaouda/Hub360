// Squelette de la carte de connexion, même gabarit que le vrai formulaire :
// rien ne saute quand la page arrive.
export default function ChargementConnexion() {
  return (
    <section className="auth-carte auth-carte--squelette" aria-busy="true" aria-label="Chargement">
      <div className="auth-carte-entete">
        <div className="auth-squelette" style={{ width: '48%', height: '2rem' }} />
        <div className="auth-squelette" style={{ width: '78%', height: '1rem', marginTop: '0.75rem' }} />
      </div>
      <div className="auth-formulaire">
        <div className="auth-squelette" style={{ height: '60px' }} />
        <div className="auth-squelette" style={{ height: '60px' }} />
        <div className="auth-squelette" style={{ width: '60%', height: '1.25rem' }} />
        <div className="auth-squelette" style={{ height: '56px', marginTop: '0.35rem' }} />
      </div>
    </section>
  );
}
