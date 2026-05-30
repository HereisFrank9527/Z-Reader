import fs from 'node:fs/promises';
import path from 'node:path';
import { RULES_DIR } from './paths.js';

let cache = null;

export async function loadRules(file = 'main-rules.json') {
  if (cache) return cache;
  const raw = await fs.readFile(path.join(RULES_DIR, file), 'utf8');
  cache = JSON.parse(raw).filter((rule) => !rule.disabled);
  return cache;
}

export async function getRule(sourceId) {
  const rules = await loadRules();
  const index = Number(sourceId) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= rules.length) {
    throw new Error(`无效的书源 ID: ${sourceId}`);
  }
  return { rule: rules[index], index };
}

export function sourceSummary(rule, id) {
  return {
    id,
    name: rule.name,
    url: rule.url,
    comment: rule.comment || '',
    search_enabled: Boolean(rule.search && !rule.search.disabled),
    has_crawl_config: Boolean(rule.crawl)
  };
}
