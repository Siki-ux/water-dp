import { describe, it, expect } from "vitest";
import { queryKeys } from "@/hooks/queries/keys";

describe("queryKeys", () => {
  describe("projects", () => {
    it("generates stable list keys", () => {
      expect(queryKeys.projects.all).toEqual(["projects"]);
      expect(queryKeys.projects.list()).toEqual(["projects", { groupId: undefined }]);
      expect(queryKeys.projects.list("g1")).toEqual(["projects", { groupId: "g1" }]);
    });

    it("generates stable detail keys", () => {
      expect(queryKeys.projects.detail("p1")).toEqual(["projects", "p1"]);
    });

    it("generates nested sensor keys under project", () => {
      expect(queryKeys.projects.sensors("p1")).toEqual(["projects", "p1", "sensors"]);
    });

    it("generates dashboard keys", () => {
      expect(queryKeys.projects.dashboards("p1")).toEqual(["projects", "p1", "dashboards"]);
    });

    it("generates computation keys", () => {
      expect(queryKeys.projects.computations("p1")).toEqual(["projects", "p1", "computations"]);
    });

    it("generates alert keys", () => {
      expect(queryKeys.projects.alertDefs("p1")).toEqual(["projects", "p1", "alert-definitions"]);
      expect(queryKeys.projects.alertHistory("p1")).toEqual(["projects", "p1", "alert-history"]);
    });

    it("generates simulation keys", () => {
      expect(queryKeys.projects.simulations("p1")).toEqual(["projects", "p1", "simulations"]);
    });

    it("generates grafana folder keys", () => {
      expect(queryKeys.projects.grafanaFolder("p1")).toEqual(["projects", "p1", "grafana-folder"]);
    });

    it("generates permission keys", () => {
      expect(queryKeys.projects.permissions("p1")).toEqual(["projects", "p1", "permissions"]);
    });
  });

  describe("groups", () => {
    it("generates group keys", () => {
      expect(queryKeys.groups.all).toEqual(["groups"]);
      expect(queryKeys.groups.list()).toEqual(["groups", "list"]);
      expect(queryKeys.groups.mine()).toEqual(["groups", "mine"]);
      expect(queryKeys.groups.detail("g1")).toEqual(["groups", "g1"]);
      expect(queryKeys.groups.members("g1")).toEqual(["groups", "g1", "members"]);
    });
  });

  describe("sms", () => {
    it("generates sensor keys with params", () => {
      expect(queryKeys.sms.sensors({ page: 1 })).toEqual(["sms-sensors", { page: 1 }]);
    });

    it("generates sensor detail key", () => {
      expect(queryKeys.sms.sensorDetail("abc")).toEqual(["sms-sensors", "abc"]);
    });

    it("generates config list keys", () => {
      expect(queryKeys.sms.ingestTypes()).toEqual(["sms-ingest-types"]);
      expect(queryKeys.sms.apiTypes()).toEqual(["sms-api-types"]);
    });
  });

  describe("qaqc", () => {
    it("generates qaqc keys", () => {
      expect(queryKeys.qaqc.schemas()).toEqual(["qaqc-schemas"]);
      expect(queryKeys.qaqc.configs("schema1")).toEqual(["qaqc", "schema1", "configs"]);
      expect(queryKeys.qaqc.thingQAQC("uuid1")).toEqual(["qaqc", "thing", "uuid1"]);
      expect(queryKeys.qaqc.functions()).toEqual(["qaqc-functions"]);
      expect(queryKeys.qaqc.projectConfigs("p1")).toEqual(["qaqc", "project", "p1"]);
    });
  });

  describe("layers", () => {
    it("generates layer keys", () => {
      expect(queryKeys.layers.all).toEqual(["layers"]);
      expect(queryKeys.layers.list()).toEqual(["layers", "list"]);
      expect(queryKeys.layers.detail("rivers")).toEqual(["layers", "rivers"]);
    });
  });

  describe("things", () => {
    it("generates thing keys", () => {
      expect(queryKeys.things.detail("uuid1")).toEqual(["things", "uuid1"]);
      expect(queryKeys.things.datastreams("uuid1")).toEqual(["things", "uuid1", "datastreams"]);
    });
  });

  describe("dashboards", () => {
    it("generates dashboard detail key", () => {
      expect(queryKeys.dashboards.detail("d1")).toEqual(["dashboards", "d1"]);
    });
  });

  describe("key uniqueness", () => {
    it("different params produce different keys", () => {
      const k1 = queryKeys.projects.list("group-a");
      const k2 = queryKeys.projects.list("group-b");
      expect(k1).not.toEqual(k2);
    });

    it("list and detail keys do not collide", () => {
      const listKey = queryKeys.projects.list();
      const detailKey = queryKeys.projects.detail("some-id");
      expect(listKey).not.toEqual(detailKey);
    });
  });
});
