// Vérifications lisibles sur le DOM (toBeInTheDocument, toHaveFocus…) et
// démontage des composants entre deux tests.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());
