import { describe, expect, it } from "vitest";
import { mostrarCompilacion, versionRemotaDiferente } from "./actualizaciones";

describe("Actualizaciones PWA de AlFaroCafé", () => {
  it("identifica correctamente una compilación nueva", () => {
    expect(versionRemotaDiferente("2026-11-23T13:20:00.000Z", "2026-11-23T13:21:00.000Z")).toBe(true);
  });

  it("no avisa cuando el servidor ofrece la misma versión", () => {
    expect(versionRemotaDiferente("2026-11-23T13:20:00.000Z", "2026-11-23T13:20:00.000Z")).toBe(false);
  });

  it("ignora respuestas inválidas sin inventar una actualización", () => {
    expect(versionRemotaDiferente("2026-11-23T13:20:00.000Z", undefined)).toBe(false);
    expect(versionRemotaDiferente("2026-11-23T13:20:00.000Z", "")).toBe(false);
  });

  it("muestra una fecha de compilación legible", () => {
    expect(mostrarCompilacion("2026-11-23T13:20:00.000Z")).toContain("2026");
  });
});
