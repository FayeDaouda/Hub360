// Sortie « standalone » : l'image Docker de production n'embarque que le
// serveur Next et ses dépendances réelles (cf. deploy/frontend.Dockerfile).
// Sans effet en développement (next dev).
module.exports = {
  output: 'standalone',
};
