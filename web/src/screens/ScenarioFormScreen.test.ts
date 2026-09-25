import { describe, expect, it } from "vitest";
import { SCENARIOS } from "../scenarioSpec";
import { scenarioInitialFields } from "./ScenarioFormScreen";

describe("ScenarioFormScreen initial fields", () => {
  it("prefills check-in and checkout client name from the job customer name", () => {
    expect(
      scenarioInitialFields(SCENARIOS.checkin, {
        customerName: "Anna Boblak",
        customerEmail: "anna@example.com",
        customerPhone: "07885381346"
      }).client_name
    ).toBe("Anna Boblak");

    expect(
      scenarioInitialFields(SCENARIOS.checkout, {
        customerName: "Anna Boblak",
        customerEmail: "anna@example.com"
      }).client_name
    ).toBe("Anna Boblak");
  });

  it("falls back to clientNamePostcode when the parsed customer name is missing", () => {
    expect(
      scenarioInitialFields(SCENARIOS.checkin, {
        customerName: "",
        clientNamePostcode: "Nicholas Singer SW18 1HR"
      }).client_name
    ).toBe("Nicholas Singer SW18 1HR");
  });

  it("falls back to the labelled name in raw Calendar description before clientNamePostcode", () => {
    expect(
      scenarioInitialFields(SCENARIOS.checkout, {
        customerName: "",
        rawDescription: "Client name: Suchi S Stark\nPhone: 07885381346",
        clientNamePostcode: "Wrong Fallback SW18"
      }).client_name
    ).toBe("Suchi S Stark");
  });
});
