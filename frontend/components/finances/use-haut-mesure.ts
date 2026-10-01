import { useLayoutEffect, useRef } from 'react';

// Pose sur l'élément `--fin-haut` = son haut dans la page, pour qu'il occupe
// le reste de la fenêtre et défile en interne (même principe que --po-haut
// des Projets). Remesuré au redimensionnement et quand la page au-dessus
// change de hauteur (bandeau qui apparaît, tuiles qui se replient).
export function useHautMesure<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mesurer = () => el.style.setProperty('--fin-haut', `${el.getBoundingClientRect().top + window.scrollY}px`);
    mesurer();
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(document.body);
    window.addEventListener('resize', mesurer);
    return () => {
      observateur.disconnect();
      window.removeEventListener('resize', mesurer);
    };
  }, []);
  return ref;
}
