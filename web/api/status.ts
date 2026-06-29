// 健康检查 GET /api/status
export interface StatusInfo {
  backend: string;
  endpointsRegistered: number | null; // null=字段不存在
  online: boolean;
}

export async function fetchStatus(): Promise<StatusInfo> {
  const res = await fetch("/api/status");
  const d = await res.json();
  const backend =
    d.backend && d.backend.includes("real")
      ? "REAL"
      : (d.backend || "").includes("MOCK")
        ? "MOCK"
        : d.backend || "—";
  return {
    backend,
    endpointsRegistered: d.endpoints_registered ?? null,
    online: true,
  };
}
