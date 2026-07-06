/**
 * 🔒 Script per salvare la sessione di login di Playwright.
 *
 * USAGE:
 *   npx playwright codegen --save-storage=.playwright-auth.json https://my-project-ivory-nine.vercel.app
 *
 * Oppure (più semplice):
 *   1. Esegui: npx tsx tests/save-auth.ts
 *   2. Si apre un browser Chrome
 *   3. Fai login con Google normalmente
 *   4. Premi Invio nel terminale quando hai finito
 *   5. La sessione viene salvata in .playwright-auth.json
 */

import { chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("🔓 Apro un browser Chrome...");
  console.log("   Fai login con Google su LabelPulse.");
  console.log("   Quando vedi 'Benvenuto Emmanuel', torna qui e premi INVIO.\n");

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    locale: "it-IT",
  });
  const page = await context.newPage();

  await page.goto("https://my-project-ivory-nine.vercel.app");

  // Aspetta che l'utente faccia login (max 5 minuti)
  console.log("⏳ Aspetto che tu faccia login (hai 5 minuti)...");
  await page.waitForSelector("text=Profilo", { timeout: 300000 }).catch(() => {
    console.log("⚠️ Timeout: non ho visto 'Profilo' entro 5 minuti.");
  });

  // Aspetta un extra per assicurarsi che la sessione sia stabile
  await page.waitForTimeout(3000);

  // Salva lo storage state (cookie + localStorage)
  const authFile = path.join(process.cwd(), ".playwright-auth.json");
  await context.storageState({ path: authFile });

  console.log(`\n✅ Sessione salvata in: ${authFile}`);
  console.log("   Ora puoi lanciare i test con: npm run test:e2e\n");

  await browser.close();
}

main().catch(console.error);
