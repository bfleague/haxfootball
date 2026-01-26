import { describe, expect, it } from "vitest";
import {
    legacyStadiumObjectOutput,
    legacyStadiumSchema,
} from "./fixtures/legacy-stadium";
import { defineStadium } from "./stadium-generator";

describe("defineStadium", () => {
    it("reproduces the legacy stadium from the new schema API", () => {
        const { stadium } = defineStadium(legacyStadiumSchema);

        expect(stadium).toEqual(legacyStadiumObjectOutput);
    });
});
