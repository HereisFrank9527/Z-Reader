import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const RULES_DIR = path.join(ROOT, 'rules');
export const STATIC_DIR = path.join(ROOT, 'static');
export const TEMPLATES_DIR = path.join(ROOT, 'templates');
export const DATA_DIR = path.join(ROOT, 'data');
export const DOWNLOAD_DIR = path.join(ROOT, 'downloads');
