/** FleetPicker 选中项的共享类型(组件 + PlaygroundView 共用) */
export interface SelectedFleet {
  /** 选中标识,与 modelValue 同值 */
  id: string;
  /** 来源:用户端点 / 官方舰队 */
  source: "endpoint" | "official";
  /** 显示名 */
  label: string;
  /** 端点 id(仅 source=endpoint) */
  endpointId?: number;
  /** 端点绑定的上游模型名(仅 source=endpoint) */
  upstreamModel?: string;
  /** 官方舰队的 model_id(user:xxx),后端用它路由 topology(仅 source=official) */
  modelId?: string;
  /** 官方舰队 id,用于拉取 topology(仅 source=official) */
  fleetId?: number;
}
