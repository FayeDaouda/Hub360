import { ErrorReporter } from './error-reporter.service';
import { TrackingLogger } from './tracking-logger';

describe('TrackingLogger', () => {
  const report = jest.fn();
  let sortie: jest.SpyInstance;
  beforeEach(() => {
    report.mockClear();
    sortie = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });
  afterEach(() => jest.restoreAllMocks());

  const logger = () => {
    const l = new TrackingLogger();
    l.attach({ report } as unknown as ErrorReporter);
    return l;
  };

  it('une erreur du journal est suivie, avec son contexte et sa pile', () => {
    logger().error('Tournée des rappels interrompue : délai dépassé', 'Error: x\n    at y', 'RappelsService');
    expect(report).toHaveBeenCalledWith({
      source: 'serveur',
      route: 'RappelsService',
      message: 'Tournée des rappels interrompue : délai dépassé',
      stack: 'Error: x\n    at y',
    });
    expect(sortie).toHaveBeenCalled(); // la sortie habituelle du journal est gardée
  });

  it('les 5xx (contexte « Exception ») sont laissées au filtre global', () => {
    logger().error('GET /api/x → 500', 'Error: x\n    at y', 'Exception');
    expect(report).not.toHaveBeenCalled();
  });

  it('avertissements et informations : pas suivis', () => {
    const l = logger();
    l.warn('attention', 'Email');
    l.log('démarrée', 'NestApplication');
    expect(report).not.toHaveBeenCalled();
  });
});
