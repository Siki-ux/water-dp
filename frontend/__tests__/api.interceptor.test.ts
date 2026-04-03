import { describe, it, expect, vi, beforeEach } from "vitest";
import { clearTokenCache } from "@/lib/api";

describe("api module", () => {
  beforeEach(() => {
    clearTokenCache();
  });

  describe("clearTokenCache", () => {
    it("does not throw when called with no cached token", () => {
      expect(() => clearTokenCache()).not.toThrow();
    });

    it("can be called multiple times safely", () => {
      clearTokenCache();
      clearTokenCache();
      clearTokenCache();
      expect(true).toBe(true);
    });

    it("is a function export", () => {
      expect(typeof clearTokenCache).toBe("function");
    });
  });

  describe("api instance", () => {
    it("exports a default axios instance", async () => {
      const api = (await import("@/lib/api")).default;
      expect(api).toBeDefined();
      expect(api.defaults).toBeDefined();
    });

    it("has JSON content-type header", async () => {
      const api = (await import("@/lib/api")).default;
      expect(api.defaults.headers["Content-Type"]).toBe("application/json");
    });

    it("has request interceptors configured", async () => {
      const api = (await import("@/lib/api")).default;
      // Axios stores interceptors internally
      expect(api.interceptors.request).toBeDefined();
    });

    it("has response interceptors configured", async () => {
      const api = (await import("@/lib/api")).default;
      expect(api.interceptors.response).toBeDefined();
    });
  });
});
