import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

// Same rules as the former .eslintrc.json (next/core-web-vitals): Next 16
// removed `next lint` and ESLint 9 only reads flat configs.
const config = [
  { ignores: ['.next/**', 'next-env.d.ts'] },
  ...nextCoreWebVitals,
  {
    rules: {
      // Logos and uploaded photos are data URIs or fixed assets: next/image brings nothing here.
      '@next/next/no-img-element': 'off',
      // React Compiler rules introduced by eslint-config-next 16: 52 findings in
      // components written before them. Fixed module by module during the
      // structuring phases, then switched back to errors.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
];

export default config;
