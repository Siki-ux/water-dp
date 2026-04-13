import { describe, it, expect, vi, beforeEach } from "vitest";
import { clearTokenCache } from "@/lib/api";

// Smoke test for the API module
describe("API module", () => {
    it("clearTokenCache does not throw", () => {
        expect(() => clearTokenCache()).not.toThrow();
    });

    it("clearTokenCache can be called multiple times", () => {
        clearTokenCache();
        clearTokenCache();
        // Should be safe to call repeatedly
    });
});
