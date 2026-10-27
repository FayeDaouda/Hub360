import type { PaymentMode } from './types';

// Moyens de paiement du salaire (libellés affichés ; RH comprise).
export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  virement: 'Virement',
  wave: 'Wave',
  orange_money: 'Orange Money',
};
