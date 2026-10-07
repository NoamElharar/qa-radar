import { fileURLToPath } from 'node:url';

/** Where the generated fixture data lives (git-ignored). */
export const DATA_DIR = fileURLToPath(new URL('./.data', import.meta.url));
