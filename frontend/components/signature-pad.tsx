'use client';

import { useEffect, useRef } from 'react';

type Props = {
  // PNG (data URI) à chaque trait terminé ; null quand le pavé est vide.
  onChange: (png: string | null) => void;
};

// Pavé de signature (contrat, étape G) — canvas + pointer events : souris,
// doigt et stylet avec le même code. Pas de bibliothèque : le besoin est un
// tracé à main levée exporté en PNG, rien de plus.
export function SignaturePad({ onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trace = useRef(false);
  const vide = useRef(true);

  // Résolution réelle = taille affichée × densité de pixels (trait net sur
  // écran Retina / mobile).
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';
  }, []);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function debut(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    trace.current = true;
    const ctx = e.currentTarget.getContext('2d')!;
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function suite(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!trace.current) return;
    const ctx = e.currentTarget.getContext('2d')!;
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    vide.current = false;
  }

  function fin() {
    if (!trace.current) return;
    trace.current = false;
    onChange(vide.current ? null : canvasRef.current!.toDataURL('image/png'));
  }

  function effacer() {
    const c = canvasRef.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    vide.current = true;
    onChange(null);
  }

  return (
    <div className="signature-pad">
      <canvas
        ref={canvasRef}
        className="signature-pad-zone"
        onPointerDown={debut}
        onPointerMove={suite}
        onPointerUp={fin}
        onPointerLeave={fin}
        aria-label="Zone de signature — signez avec la souris ou le doigt"
      />
      <button type="button" className="lien-inline" onClick={effacer}>
        Effacer
      </button>
    </div>
  );
}
