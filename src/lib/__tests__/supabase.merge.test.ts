import { describe, it, expect } from "vitest";
import { mergeGlobalWithPersonal, PERSONAL_LABEL_FIELDS } from "../supabase";

/**
 * 🔒 Task 2: Test di regressione per applyGlobalDataToStore / mergeGlobalWithPersonal.
 *
 * Garantisce che i campi personali (isFavorite, emails, notes, ecc.) vengano
 * SEMPRE preservati quando arriva un REPLACE globale delle classifiche Beatport.
 *
 * Questo test previene il bug del 2026-07-02 dove isFavorite veniva azzerato
 * ad ogni update globale perché non era nella lista dei campi preservati.
 */
describe("Sync State — mergeGlobalWithPersonal", () => {
  it("deve preservare isFavorite quando riceve un REPLACE globale", () => {
    const mockExistingLabel = {
      id: "label-123",
      name: "Global Name",
      isFavorite: true,
      notes: "My custom note",
    };

    const mockNewGlobalUpdate = {
      id: "label-123",
      name: "Updated Global Name",
      rankByGenre: { techno: 5 },
      // isFavorite non è presente qui perché arriva dal cloud globale
    };

    const result = mergeGlobalWithPersonal(mockExistingLabel, mockNewGlobalUpdate);

    expect(result.name).toBe("Updated Global Name"); // Il dato globale si aggiorna
    expect(result.isFavorite).toBe(true); // Il dato personale rimane intatto
    expect(result.notes).toBe("My custom note"); // Anche le note rimangono
    expect(result.rankByGenre).toEqual({ techno: 5 }); // Il dato Beatport arriva dal cloud
  });

  it("deve ritornare newGlobalData invariato se existingLabel è null", () => {
    const mockNewGlobalUpdate = {
      id: "label-456",
      name: "New Label",
      rankByGenre: { house: 10 },
    };

    const result = mergeGlobalWithPersonal(null, mockNewGlobalUpdate);

    expect(result).toEqual(mockNewGlobalUpdate);
  });

  it("deve preservare TUTTI i campi personali definiti in PERSONAL_LABEL_FIELDS", () => {
    const mockExistingLabel: Record<string, any> = {
      id: "label-789",
      name: "Test Label",
    };

    // Popola ogni campo personale con un valore di test
    for (const field of PERSONAL_LABEL_FIELDS) {
      if (field === "emails" || field === "customLinks") {
        mockExistingLabel[field] = ["test-value"];
      } else if (field === "isFavorite" || field === "isCustom") {
        mockExistingLabel[field] = true;
      } else {
        mockExistingLabel[field] = "test-value";
      }
    }

    const mockNewGlobalUpdate = {
      id: "label-789",
      name: "Updated Name",
      rankByGenre: { techno: 1 },
    };

    const result = mergeGlobalWithPersonal(mockExistingLabel, mockNewGlobalUpdate);

    // Verifica che ogni campo personale sia preservato
    for (const field of PERSONAL_LABEL_FIELDS) {
      expect(result[field]).toEqual(mockExistingLabel[field]);
    }

    // Verifica che i campi Beatport arrivino dal globale
    // Nota: name viene preservato dal locale quando isCustom === true
    // (la label è manuale, il nome globale non è autoritativo)
    expect(result.name).toBe("Test Label"); // isCustom=true → local name preserved
    expect(result.rankByGenre).toEqual({ techno: 1 });
  });

  it("deve sovrascrivere i campi Beatport con i dati globali", () => {
    const mockExistingLabel = {
      id: "label-999",
      name: "Old Name",
      rankByGenre: { techno: 50 }, // Vecchio rank
      isFavorite: true,
    };

    const mockNewGlobalUpdate = {
      id: "label-999",
      name: "New Name",
      rankByGenre: { techno: 5 }, // Nuovo rank migliore
    };

    const result = mergeGlobalWithPersonal(mockExistingLabel, mockNewGlobalUpdate);

    expect(result.name).toBe("New Name"); // Globale vince
    expect(result.rankByGenre).toEqual({ techno: 5 }); // Globale vince
    expect(result.isFavorite).toBe(true); // Personale preservato
  });
});
