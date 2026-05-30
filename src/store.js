import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './paths.js';

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA_DIR, file), 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await ensureDataDir();
  await fs.writeFile(path.join(DATA_DIR, file), JSON.stringify(value, null, 2), 'utf8');
}

export async function loadCheckResults() {
  return readJson('check-results.json', null);
}

export async function saveCheckResults(results, summary) {
  const payload = { results, summary, timestamp: Date.now() };
  await writeJson('check-results.json', payload);
  return payload;
}

export async function loadTasks() {
  return readJson('tasks.json', []);
}

export async function saveTasks(tasks) {
  await writeJson('tasks.json', tasks);
}

export async function updateTask(id, patch) {
  const tasks = await loadTasks();
  const index = tasks.findIndex((task) => task.id === id);
  if (index < 0) return null;
  tasks[index] = { ...tasks[index], ...patch, updated_at: new Date().toISOString() };
  await saveTasks(tasks);
  return tasks[index];
}
