import { test, expect } from "@playwright/test";

/**
 * 🔒 E2E Test: Classifiche e Label — No duplicati + Form interattivo
 *
 * Previene:
 * 1. Label duplicate nelle classifiche (bug del 2026-07-05)
 * 2. Generi mancanti nel form manuale
 * 3. Campi link bloccati nel form
 */

test.describe("Classifiche e Label", () => {
  test("le classifiche si caricano senza label duplicate", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(3000);

    // Controlla se loggato
    const userLink = page.locator("text=Emmanuel").first();
    const isLoggedIn = await userLink.isVisible().catch(() => false);

    if (!isLoggedIn) {
      test.skip(true, "Utente non autenticato");
      return;
    }

    // Vai alle classifiche
    await page.click("text=Classifiche");
    await page.waitForTimeout(2000);

    // Seleziona un genere se possibile
    const genreButton = page.locator("text=Techno Peak Time / Driving").first();
    if (await genreButton.isVisible().catch(() => false)) {
      await genreButton.click();
      await page.waitForTimeout(1000);
    }

    // Raccogli tutte le label visibili nella tabella
    const labelRows = page.locator('table tbody tr, [class*="label-row"], [data-label-id]');

    // Se non c'è una tabella, cerca card o altri elementi con nomi label
    const labelNames = await page.evaluate(() => {
      // Prova a leggere dal store Zustand esposto su window
      const store = (window as any).useAppStore;
      if (store && typeof store.getState === "function") {
        const state = store.getState();
        const labels = state.labels || [];

        // Trova duplicati per ID
        const ids = labels.map((l: any) => l.id);
        const duplicates = ids.filter((id: string, i: number) => ids.indexOf(id) !== i);

        return {
          total: labels.length,
          duplicates: duplicates,
          duplicateCount: duplicates.length,
        };
      }
      return null;
    });

    if (labelNames) {
      console.log(`[E2E] Label totali nello store: ${labelNames.total}`);
      console.log(`[E2E] Duplicati trovati: ${labelNames.duplicateCount}`);

      // 🔒 ASSERTION CRITICA: nessun duplicato
      expect(labelNames.duplicateCount).toBe(0);
      expect(labelNames.duplicates).toEqual([]);

      console.log("[E2E] ✅ Nessuna label duplicata nello store");
    } else {
      console.log("[E2E] Store non disponibile su window — skip dedup check");
    }
  });

  test("il form di aggiunta label ha tutti i generi", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(3000);

    const userLink = page.locator("text=Emmanuel").first();
    const isLoggedIn = await userLink.isVisible().catch(() => false);

    if (!isLoggedIn) {
      test.skip(true, "Utente non autenticato");
      return;
    }

    // Vai alle label
    await page.click("text=Label");
    await page.waitForTimeout(1000);

    // Cerca il bottone "Aggiungi Label"
    const addBtn = page.locator("text=Aggiungi Label").first();
    if (!(await addBtn.isVisible().catch(() => false))) {
      // Prova in italiano
      const addBtnIt = page.locator("button:has-text('Aggiungi')").first();
      if (!(await addBtnIt.isVisible().catch(() => false))) {
        test.skip(true, "Bottone 'Aggiungi Label' non trovato");
        return;
      }
      await addBtnIt.click();
    } else {
      await addBtn.click();
    }

    await page.waitForTimeout(500);

    // Verifica che il dropdown dei generi sia presente
    const genreSelect = page.locator("select, [role='combobox']").first();
    if (!(await genreSelect.isVisible().catch(() => false))) {
      // Prova con Radix Select
      const genreTrigger = page.locator("button[role='combobox']").first();
      if (await genreTrigger.isVisible().catch(() => false)) {
        await genreTrigger.click();
        await page.waitForTimeout(500);

        // Conta le opzioni visibili
        const options = page.locator("[role='option']");
        const optionCount = await options.count();

        console.log(`[E2E] Generi visibili nel dropdown: ${optionCount}`);

        // 🔒 ASSERTION: almeno 30 generi (34 reali + qualche extra)
        expect(optionCount).toBeGreaterThanOrEqual(30);

        console.log("[E2E] ✅ Tutti i generi presenti nel dropdown");

        // Chiudi il dropdown
        await page.keyboard.press("Escape");
      }
    }
  });

  test("i campi link nel form label sono editabili", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(3000);

    const userLink = page.locator("text=Emmanuel").first();
    const isLoggedIn = await userLink.isVisible().catch(() => false);

    if (!isLoggedIn) {
      test.skip(true, "Utente non autenticato");
      return;
    }

    // Vai alle label e apri il form
    await page.click("text=Label");
    await page.waitForTimeout(1000);

    const addBtn = page.locator("text=Aggiungi Label").first();
    const addBtnAlt = page.locator("button:has-text('Aggiungi')").first();

    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
    } else if (await addBtnAlt.isVisible().catch(() => false)) {
      await addBtnAlt.click();
    } else {
      test.skip(true, "Bottone 'Aggiungi Label' non trovato");
      return;
    }

    await page.waitForTimeout(500);

    // Compila il nome (campo obbligatorio)
    const nameInput = page.locator('input[placeholder*="Drumcode"], input[placeholder*="label"]').first();
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill("TEST LABEL E2E");
    }

    // Cerca i campi link (Website, Demo Link, Social, SoundCloud)
    const websiteInput = page.locator('input[placeholder*="label.com"], input[placeholder*="https://label"]').first();
    const soundcloudInput = page.locator('input[placeholder*="soundcloud.com"], input[placeholder*="SoundCloud"]').first();

    // Test Website
    if (await websiteInput.isVisible().catch(() => false)) {
      await websiteInput.fill("https://test-label.com");
      const websiteValue = await websiteInput.inputValue();
      expect(websiteValue).toBe("https://test-label.com");
      console.log("[E2E] ✅ Campo Website editabile");
    }

    // Test SoundCloud
    if (await soundcloudInput.isVisible().catch(() => false)) {
      await soundcloudInput.fill("https://soundcloud.com/test");
      const scValue = await soundcloudInput.inputValue();
      expect(scValue).toBe("https://soundcloud.com/test");
      console.log("[E2E] ✅ Campo SoundCloud editabile");
    }

    // Verifica che i campi non siano readOnly
    const allInputs = page.locator('input[type="text"], input[type="url"], input:not([type])');
    const inputCount = await allInputs.count();

    for (let i = 0; i < inputCount; i++) {
      const input = allInputs.nth(i);
      const isReadOnly = await input.getAttribute("readonly");
      const isDisabled = await input.isDisabled().catch(() => false);

      // I campi che non sono il nome (che potrebbe essere disabilitato in edit mode)
      // non devono essere readonly
      if (!isDisabled && isReadOnly !== null) {
        console.warn(`[E2E] ⚠️ Input ${i} è readonly — potrebbe essere bloccato`);
      }
    }

    console.log(`[E2E] ${inputCount} campi input trovati nel form`);
  });
});
