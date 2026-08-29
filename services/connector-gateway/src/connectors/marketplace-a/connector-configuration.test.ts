import { describe, expect, it } from "vitest";

import { readMarketplaceAConnectorId } from "./connector-configuration.js";

describe("readMarketplaceAConnectorId", () => {
    it("uses the connector seeded by the gateway migration", () => {
        expect(readMarketplaceAConnectorId({})).toBe(
            "0199037b-6400-7000-8000-000000000001"
        );
    });

    it("accepts a configured canonical UUID", () => {
        expect(
            readMarketplaceAConnectorId({
                MARKETPLACE_A_CONNECTOR_ID: "0199037b-6400-7000-8000-000000000099"
            })
        ).toBe("0199037b-6400-7000-8000-000000000099");
    });

    it.each(["not-a-uuid", "0199037B-6400-7000-8000-000000000099"])(
        "rejects non-canonical connector ID %s",
        (connectorId) => {
            expect(() =>
                readMarketplaceAConnectorId({ MARKETPLACE_A_CONNECTOR_ID: connectorId })
            ).toThrow("MARKETPLACE_A_CONNECTOR_ID must be a canonical UUID");
        }
    );
});
