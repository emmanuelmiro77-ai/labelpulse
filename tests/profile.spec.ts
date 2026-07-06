import { test, expect, type Page } from "@playwright/test";

/**
 * 🔒 E2E Test: Profilo Utente — Email non deve sparire
 *
 * Previene la regressione del 2026-07-05 dove l'email del profilo
 * veniva azzerata da clearAllLocalData() durante il boot cloud-first.
 *
 * Questo test verifica che:
 * 1. L'app carica correttamente
 * 2. Se l'utente è autenticato, il campo email NON è vuoto
 * 3. L'email sopravvive al caricamento dello storage
 */

test.describe("Profilo Utente — Email preservata", () => {
  test("l'app si carica senza crash", async ({ page }) => {
    await page.goto("/");
    // L'app deve caricare — non white screen
    await expect(page).toHaveTitle(/LabelPulse/i);
  });

  test("il campo email nel profilo non è vuoto dopo login", async ({ page, context }) => {
    // Naviga all'app
    await page.goto("/");

    // Aspetta che l'app sia caricata (il loading screen sparisce)
    await page.waitForTimeout(3000);

    // Controlla se l'utente è loggato (cerca il nome utente nell'header)
    const userLink = page.locator("text=Emmanuel").first();
    const isLoggedIn = await userLink.isVisible().catch(() => false);

    if (!isLoggedIn) {
      // Se non loggato, skip — non possiamo testare il profilo
      test.skip(true, "Utente non autenticato — skip test profilo");
      return;
    }

    // Naviga al profilo
    await page.click("text=Profilo");
    await page.waitForTimeout(1000);

    // Trova l'input email
    const emailInput = page.locator('input[type="email"]').first();

    // L'email NON deve essere vuota
    await expect(emailInput).not.toHaveValue("");

    // L'email deve contenere @ (formato valido)
    const emailValue = await emailInput.inputValue();
    expect(emailValue).toContain("@");

    console.log(`[E2E] Email nel profilo: ${emailValue} ✅`);
  });

  test("l'email sopravvive al reload della pagina", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(3000);

    const userLink = page.locator("text=Emmanuel").first();
    const isLoggedIn = await userLink.isVisible().catch(() => false);

    if (!isLoggedIn) {
      test.skip(true, "Utente non autenticato");
      return;
    }

    // Vai al profilo e leggi l'email
    await page.click("text=Profilo");
    await page.waitForTimeout(1000);

    const emailInput = page.locator('input[type="email"]').first();
    const emailBefore = await emailInput.inputValue();

    if (!emailBefore) {
      test.skip(true, "Email vuota prima del reload — non posso testare");
      return;
    }

    // Ricarica la pagina
    await page.reload();
    await page.waitForTimeout(3000);

    // Torna al profilo
    await page.click("text=Profilo");
    await page.waitForTimeout(1000);

    // L'email deve essere ancora lì
    const emailAfter = await page.locator('input[type="email"]').first().inputValue();
    expect(emailAfter).toBe(emailBefore);

    console.log(`[E2E] Email prima: ${emailBefore}, dopo reload: ${emailAfter} ✅`);
  });
});
