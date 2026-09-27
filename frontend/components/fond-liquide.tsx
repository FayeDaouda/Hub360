// Fond « liquid glass » hub360° (écran de connexion, maquette sept. 2026) —
// 100 % CSS + un SVG inline : aucune image à charger, net sur tout écran,
// re-thémé clair/sombre par les jetons --fl-* de globals.css.
//
// Couches, de l'arrière vers l'avant :
//   1. dégradé de fond + halos de couleur (background du conteneur) ;
//   2. vagues lumineuses (SVG recadré sans déformation, traits d'épaisseur
//      constante) ;
//   3. bulles de verre liquide (5 grandes, 4 perles) — la couleur et le
//      volume (reflet spéculaire, liseré, rebond de lumière) sont posés en
//      CSS, la position/taille aussi (réarrangée en portrait) ;
//   4. éclats scintillants.
// Mouvement : uniquement transform/opacity (composités par le GPU, aucune
// peinture par image), très lent ; coupé sous prefers-reduced-motion.
// Purement décoratif : aria-hidden, aucun événement pointeur.
//
// composition : « duo » = présentation à gauche + carte à droite (connexion),
// « centre » = colonne unique centrée (les bulles s'écartent du logo et de
// la carte). En portrait, les deux partagent le même cadrage en bordure.

const BULLES = ['bleu', 'jaune', 'cyan', 'orange', 'azur'] as const;
const PERLES = ['bleu', 'jaune', 'orange', 'cyan'] as const;
const ECLATS = 8;

type Props = { composition?: 'duo' | 'centre' };

export function FondLiquide({ composition = 'duo' }: Props) {
  return (
    <div className="fond-liquide" data-composition={composition} aria-hidden="true">
      <svg
        className="fond-liquide-vagues"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
      >
        <defs>
          <linearGradient id="fond-liquide-trait" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" className="fond-liquide-stop-vide" />
            <stop offset="0.45" className="fond-liquide-stop-plein" />
            <stop offset="1" className="fond-liquide-stop-vide" />
          </linearGradient>
          <linearGradient id="fond-liquide-voile" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="fond-liquide-stop-voile" />
            <stop offset="1" className="fond-liquide-stop-vide" />
          </linearGradient>
        </defs>
        {/* Nappes translucides (bas-gauche, haut-droite) */}
        <path
          className="fond-liquide-nappe"
          d="M-40 690C160 610 330 640 470 720S760 900 900 940L-40 940Z"
        />
        <path
          className="fond-liquide-nappe"
          d="M760 -40C900 90 1080 150 1260 120S1480 60 1500 40L1500 -40Z"
        />
        {/* Filets lumineux */}
        <path
          className="fond-liquide-filet"
          d="M-60 640C180 560 360 610 520 700S840 880 1060 860"
        />
        <path
          className="fond-liquide-filet fond-liquide-filet--doux"
          d="M-60 420C220 360 380 520 640 560S1080 470 1500 580"
        />
        <path
          className="fond-liquide-filet"
          d="M700 -20C860 110 1040 190 1240 160S1440 90 1520 70"
        />
        <path
          className="fond-liquide-filet fond-liquide-filet--doux"
          d="M980 940C1100 820 1240 760 1500 780"
        />
      </svg>

      {BULLES.map((teinte) => (
        <span key={teinte} className={`fl-bulle fl-bulle--${teinte}`} />
      ))}
      {PERLES.map((teinte) => (
        <span key={teinte} className={`fl-perle fl-perle--${teinte}`} />
      ))}
      <div className="fl-eclats">
        {Array.from({ length: ECLATS }, (_, i) => (
          <span key={i} className="fl-eclat" />
        ))}
      </div>
    </div>
  );
}
