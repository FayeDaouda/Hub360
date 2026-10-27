// Part arrondie, en pourcentage ; null sans rien à compter.
export const percent = (n: number, total: number) => (total ? Math.round((n / total) * 100) : null);
