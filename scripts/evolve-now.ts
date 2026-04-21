/**
 * One-time script: Trigger initial framework evolution.
 * Merges existing learnings with ROYA Standard into the evolved framework.
 * Run with: npx tsx scripts/evolve-now.ts
 */

import fs from 'fs';
import path from 'path';

// Load .env.local manually  
const envLocal = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envLocal)) {
  for (const line of fs.readFileSync(envLocal, 'utf-8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}
const envFile = path.join(process.cwd(), '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim();
  }
}
import { evolveFramework, loadEvolvedFramework } from '../src/lib/framework-evolution';

async function main() {
  console.log('[ROYA] Triggering initial framework evolution...');
  
  const existing = await loadEvolvedFramework();
  if (existing) {
    console.log(`[ROYA] Existing evolved framework found: v${existing.version} (${existing.learningsUsed} learnings)`);
  }

  try {
    const evolved = await evolveFramework();
    console.log(`[ROYA] ✓ Framework evolved to v${evolved.version}`);
    console.log(`[ROYA]   Learnings used: ${evolved.learningsUsed}`);
    console.log(`[ROYA]   Writer instructions: ${evolved.writerInstructions.length} chars`);
    console.log(`[ROYA]   Strategist instructions: ${evolved.strategistInstructions.length} chars`);
    console.log(`[ROYA]   Examples: ${evolved.exampleMessages.length}`);
    console.log(`[ROYA]   Rules: ${evolved.rules.length}`);
    console.log(`[ROYA]   Forbidden phrases: ${evolved.forbiddenPhrases.length}`);
    console.log(`[ROYA]   Temperature: ${evolved.temperature}`);
    console.log(`[ROYA]   Log:`, evolved.evolutionLog);
  } catch (err) {
    console.error('[ROYA] ✗ Evolution failed:', err);
    process.exit(1);
  }
}

main();
