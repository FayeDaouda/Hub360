import { ThrottleParCompteGuard } from './throttle-par-compte.guard';

describe('ThrottleParCompteGuard', () => {
  const tracker = (req: Record<string, unknown>) =>
    (
      Object.create(ThrottleParCompteGuard.prototype) as { getTracker(r: Record<string, unknown>): Promise<string> }
    ).getTracker(req);

  it('compte connecté : sa propre limite, quelle que soit l’IP', async () => {
    await expect(tracker({ user: { userId: 'U1' }, ip: '1.2.3.4' })).resolves.toBe('compte:U1');
  });

  it('sans compte : l’adresse IP', async () => {
    await expect(tracker({ ip: '1.2.3.4' })).resolves.toBe('1.2.3.4');
  });
});
