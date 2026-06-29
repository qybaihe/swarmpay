// Pinia store:Injective 链上钱包会话。
// 持有 { connected, address, balance, chainId }，封装 Keplr 连接 / 手动粘贴地址 / 余额查询。
//
// 契约见 docs/injective-plan/05-API-CONTRACT.md §5 与 06-FRONTEND-WALLET.md §2。
// 后端接口可能尚未完全实现，故 balance / status 用宽松但带形状的类型对接，避免被卡住。

import { defineStore } from "pinia";
import { computed, ref } from "vue";

/** 链上余额（最小单位字符串，避免精度丢失）。 */
export interface InjectiveBalance {
  amount: string; // 最小单位，如 "5000000000000000000" = 5 INJ
  denom: string; // "inj" / "peggy0x..." 等
}

/** GET /api/injective/status 返回。 */
export interface InjectiveStatus {
  enabled: boolean;
  network: "testnet" | "mainnet" | "mock";
  contractAddr: string | null;
  chainId: string;
}

/** Keplr 注入的全局对象（可能不存在 → 降级到手动粘贴地址）。 */
interface KeplrWindow extends Window {
  keplr?: {
    enable(chainId: string): Promise<void>;
    key(chainId: string): Promise<{ bech32Address: string }>;
  };
  getOfflineSigner?(chainId: string): {
    getAccounts(): Promise<{ address: string }[]>;
  };
}

// 默认连 Injective 测试网 chainId（dorado-1）。Keplr 没装时这里仅做展示用。
const DEFAULT_CHAIN_ID = "dorado-1";

export const useInjectiveStore = defineStore("injective", () => {
  const connected = ref(false);
  const address = ref<string | null>(null);
  /** 连接方式：keplr 真实扩展 / manual 手动粘贴地址。 */
  const connectMode = ref<"none" | "keplr" | "manual">("none");
  const balance = ref<InjectiveBalance | null>(null);
  const chainId = ref<string | null>(null);
  const status = ref<InjectiveStatus | null>(null);

  const loading = ref(false);
  const error = ref<string | null>(null);

  /** 是否已检测到 Keplr 扩展。 */
  const hasKeplr = computed(() => typeof (window as KeplrWindow).keplr !== "undefined");

  const isMock = computed(() => status.value?.network === "mock");

  /**
   * 连接 Keplr。未安装则抛出可识别错误，调用方据此降级到手动粘贴。
   * MVP 阶段后端代签，这里仅用于"展示用户地址"，不强求签名。
   */
  async function connect(): Promise<void> {
    error.value = null;
    const w = window as KeplrWindow;
    if (!w.keplr) {
      error.value = "未检测到 Keplr 扩展，请手动粘贴测试网地址";
      throw new Error("keplr-not-installed");
    }
    loading.value = true;
    try {
      await w.keplr.enable(DEFAULT_CHAIN_ID);
      // 优先用 offline signer 取账户（含地址）；兜底用 keplr.key
      let addr = "";
      if (w.getOfflineSigner) {
        const signer = w.getOfflineSigner(DEFAULT_CHAIN_ID);
        const accounts = await signer.getAccounts();
        addr = accounts[0]?.address || "";
      }
      if (!addr) {
        const key = await w.keplr.key(DEFAULT_CHAIN_ID);
        addr = key.bech32Address;
      }
      if (!addr) throw new Error("Keplr 未返回地址");
      address.value = addr;
      chainId.value = DEFAULT_CHAIN_ID;
      connectMode.value = "keplr";
      connected.value = true;
      // 连上后顺便拉余额（失败不阻断连接）
      await fetchBalance().catch(() => { /* 余额拉取失败不报错 */ });
    } catch (e) {
      connected.value = false;
      connectMode.value = "none";
      error.value = e instanceof Error ? e.message : "Keplr 连接失败";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  /**
   * 手动粘贴地址模式（Keplr 未装时的降级路径）。
   * 仅记录地址 + 标记连接态，不调任何扩展 API。
   */
  async function connectManual(addr: string): Promise<void> {
    const trimmed = addr.trim();
    if (!trimmed) {
      error.value = "地址不能为空";
      throw new Error("empty-address");
    }
    address.value = trimmed;
    connectMode.value = "manual";
    connected.value = true;
    chainId.value = DEFAULT_CHAIN_ID;
    error.value = null;
    await fetchBalance().catch(() => { /* 静默 */ });
  }

  /** 断开：清空所有钱包态。 */
  function disconnect(): void {
    connected.value = false;
    address.value = null;
    balance.value = null;
    chainId.value = null;
    connectMode.value = "none";
    error.value = null;
  }

  /** GET /api/injective/balance?addr=...&denom=inj → { amount, denom } */
  async function fetchBalance(denom = "inj"): Promise<InjectiveBalance | null> {
    if (!address.value) {
      error.value = "未连接钱包";
      return null;
    }
    try {
      const res = await fetch(
        `/api/injective/balance?addr=${encodeURIComponent(address.value)}&denom=${encodeURIComponent(denom)}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || `余额查询失败 (${res.status})`);
      }
      const data = (await res.json()) as InjectiveBalance;
      balance.value = { amount: String(data.amount ?? "0"), denom: data.denom || denom };
      return balance.value;
    } catch (e) {
      // 余额拉取失败不致命（mock 模式可能未实现），仅记 error 但保留余额为占位
      error.value = e instanceof Error ? e.message : "余额查询失败";
      balance.value = { amount: "0", denom };
      return balance.value;
    }
  }

  /** GET /api/injective/status → { enabled, network, contractAddr, chainId } */
  async function fetchStatus(): Promise<InjectiveStatus | null> {
    try {
      const res = await fetch("/api/injective/status");
      if (!res.ok) return null;
      const data = (await res.json()) as Partial<InjectiveStatus>;
      status.value = {
        enabled: !!data.enabled,
        network: (data.network as InjectiveStatus["network"]) || "mock",
        contractAddr: data.contractAddr ?? null,
        chainId: data.chainId || DEFAULT_CHAIN_ID,
      };
      return status.value;
    } catch {
      // 后端可能还没挂路由，降级为 mock 占位
      status.value = { enabled: false, network: "mock", contractAddr: null, chainId: DEFAULT_CHAIN_ID };
      return status.value;
    }
  }

  return {
    // state
    connected,
    address,
    connectMode,
    balance,
    chainId,
    status,
    loading,
    error,
    // getters
    hasKeplr,
    isMock,
    // actions
    connect,
    connectManual,
    disconnect,
    fetchBalance,
    fetchStatus,
  };
});

// ── 单位换算辅助：INJ ↔ 最小单位（18 decimals）──
// 后端要求 budgetAmount 用最小单位字符串，如 5 INJ = "5000000000000000000"。

const INJ_DECIMALS = 18;

/** 把以 INJ 为单位的浮点数字符串转成最小单位整数字符串。 */
export function injToBaseUnits(injAmount: string | number): string {
  const n = typeof injAmount === "number" ? injAmount : Number(injAmount);
  if (!Number.isFinite(n) || n <= 0) return "0";
  // 用字符串运算避免 JS number 精度丢失：n * 10^18
  const [intPart, fracPart = ""] = String(n).split(".");
  const fracPadded = (fracPart + "0".repeat(INJ_DECIMALS)).slice(0, INJ_DECIMALS);
  const combined = `${intPart}${fracPadded}`.replace(/^0+(?=\d)/, "");
  return combined || "0";
}

/** 把最小单位字符串转回以 INJ 为单位的可读字符串（保留至多 6 位小数）。 */
export function baseUnitsToInj(baseAmount: string | number): string {
  const s = String(baseAmount || "0");
  if (s === "0") return "0";
  const neg = s.startsWith("-");
  const digits = neg ? s.slice(1) : s;
  const padded = digits.padStart(INJ_DECIMALS + 1, "0");
  const intPart = padded.slice(0, padded.length - INJ_DECIMALS);
  let fracPart = padded.slice(padded.length - INJ_DECIMALS).replace(/0+$/, "");
  if (fracPart.length > 6) fracPart = fracPart.slice(0, 6);
  const readable = fracPart ? `${intPart}.${fracPart}` : intPart;
  return neg ? `-${readable}` : readable;
}

/** 截断钱包地址用于展示：inj1abc...xyz */
export function shortAddr(addr: string | null, head = 8, tail = 6): string {
  if (!addr) return "—";
  if (addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}
