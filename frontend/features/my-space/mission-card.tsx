import type { MyFile } from './types';

// Carte de mission du nouvel arrivant (manuel §3.3), rédigée par la RH.
export function MissionCard({ mission }: { mission: NonNullable<MyFile['mission']> }) {
  const sections: [string, string][] = [
    ['Résultat attendu', mission.resultat],
    ['Livrables', mission.livrables],
    ['KPI', mission.kpi],
    ['Signal d’alerte', mission.signalAlerte],
  ];
  return (
    <section className="panel glass-panel pi-fiche">
      <h2>Ma carte de mission</h2>
      <p className="pi-aide">
        Rédigée par la RH à votre arrivée ; elle sert de repère jusqu’à la confirmation de votre intégration (90 jours).
      </p>
      <dl className="pi-rubriques">
        {sections.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value.trim() || '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
