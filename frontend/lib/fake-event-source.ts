// Doublure d'EventSource pour les tests (flux SSE) : garde chaque instance
// créée, ses écouteurs, et permet d'émettre open / error / un événement nommé.
type Ecouteur = (ev: { data?: string }) => void;

export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly ecouteurs = new Map<string, Ecouteur[]>();
  ferme = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, f: Ecouteur) {
    this.ecouteurs.set(type, [...(this.ecouteurs.get(type) ?? []), f]);
  }

  close() {
    this.ferme = true;
  }

  emettre(type: string, data?: string) {
    for (const f of this.ecouteurs.get(type) ?? []) f({ data });
  }

  static derniere(): FakeEventSource {
    const es = FakeEventSource.instances.at(-1);
    if (!es) throw new Error('Aucun EventSource ouvert');
    return es;
  }
}
