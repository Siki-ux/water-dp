export const queryKeys = {
  projects: {
    all: ["projects"] as const,
    list: (groupId?: string) =>
      [...queryKeys.projects.all, { groupId }] as const,
    detail: (id: string) => [...queryKeys.projects.all, id] as const,
    sensors: (id: string) =>
      [...queryKeys.projects.all, id, "sensors"] as const,
    permissions: (id: string) =>
      [...queryKeys.projects.all, id, "permissions"] as const,
    dashboards: (id: string) =>
      [...queryKeys.projects.all, id, "dashboards"] as const,
    alertDefs: (id: string) =>
      [...queryKeys.projects.all, id, "alert-definitions"] as const,
    alertHistory: (id: string) =>
      [...queryKeys.projects.all, id, "alert-history"] as const,
    computations: (id: string) =>
      [...queryKeys.projects.all, id, "computations"] as const,
    simulations: (id: string) =>
      [...queryKeys.projects.all, id, "simulations"] as const,
    grafanaFolder: (id: string) =>
      [...queryKeys.projects.all, id, "grafana-folder"] as const,
  },
  groups: {
    all: ["groups"] as const,
    list: () => [...queryKeys.groups.all, "list"] as const,
    mine: () => [...queryKeys.groups.all, "mine"] as const,
    detail: (id: string) => [...queryKeys.groups.all, id] as const,
    members: (id: string) =>
      [...queryKeys.groups.all, id, "members"] as const,
  },
  sms: {
    sensors: (params: Record<string, unknown>) =>
      ["sms-sensors", params] as const,
    sensorDetail: (uuid: string) => ["sms-sensors", uuid] as const,
    deviceTypes: (params?: Record<string, unknown>) =>
      ["sms-device-types", params] as const,
    parsers: (params?: Record<string, unknown>) =>
      ["sms-parsers", params] as const,
    ingestTypes: () => ["sms-ingest-types"] as const,
    apiTypes: () => ["sms-api-types"] as const,
  },
  qaqc: {
    schemas: () => ["qaqc-schemas"] as const,
    configs: (schemaName: string) =>
      ["qaqc", schemaName, "configs"] as const,
    thingQAQC: (uuid: string) => ["qaqc", "thing", uuid] as const,
    functions: () => ["qaqc-functions"] as const,
    projectConfigs: (projectId: string) =>
      ["qaqc", "project", projectId] as const,
  },
  layers: {
    all: ["layers"] as const,
    list: () => [...queryKeys.layers.all, "list"] as const,
    detail: (name: string) => [...queryKeys.layers.all, name] as const,
  },
  dashboards: {
    detail: (id: string) => ["dashboards", id] as const,
  },
  things: {
    detail: (uuid: string) => ["things", uuid] as const,
    datastreams: (uuid: string) =>
      ["things", uuid, "datastreams"] as const,
  },
};
