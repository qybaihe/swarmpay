# 07 · 部署与运行

## 1. 环境变量（.env 追加，纯加法）

```bash
# ── Injective 链上通道（新增）──
INJECTIVE_ENABLED=false              # 默认关，原服务零变化；开 demo 时 true
INJECTIVE_NETWORK=mock               # mock | testnet | mainnet（demo 用 mock 或 testnet）
INJECTIVE_CHAIN_ID=injective-888
INJECTIVE_RPC=https://sentry.lcd.injective.network
INJECTIVE_REST=https://sentry.lcd.injective.network
INJECTIVE_DENOM=inj
INJECTIVE_SPLIT_CONTRACT_ADDR=       # M2 部署后填；mock 模式可空
INJECTIVE_DEMO_KEY=                  # 测试网代签私钥（仅 testnet，主网禁用）
INJECTIVE_ARCHETYPE_ADDRS={}         # 各角色钱包地址 JSON

# ── 原有配置保持不动 ──
# OPENAI_BASE_URL / OPENAI_API_KEY / ... 全部沿用
```

## 2. 安装与运行

```bash
cd evoship-injective

# 装依赖（含新增 Injective SDK）
npm install

# 后端（原 + 新 /api/injective 路由）
npm run dev          # http://localhost:4000

# 前端（另一终端）
npm run dev:web      # http://localhost:5173（或 vite 默认端口）

# 或一体构建+启动
npm run build:web && npm run start
```

## 3. 三种运行模式

| 模式 | INJECTIVE_NETWORK | 说明 | 适用 |
|---|---|---|---|
| **mock** | `mock` | 链层全假，txHash 假，不连网 | 开发、录 demo 兜底、本地演示 |
| **testnet** | `testnet` | 连 Injective injective-888 测试网真链 | 加分项、评委验证 |
| **mainnet** | `mainnet` | 真金白银 | 比赛阶段不用 |

> **录 demo 推荐先用 mock** 保证不黑屏，再切 testnet 录一段"真链交易回执"作为亮点补充镜头。

## 4. 测试网钱包准备（testnet 模式）

```bash
# 1. 用 injectived 或 Injective 官方工具生成 7 个测试网地址（5 角色 + treasurer + 用户）
# 2. 到 https://injective.tools/faucet 领测试 INJ 给用户地址
# 3. 把 7 个地址填入 INJECTIVE_ARCHETYPE_ADDRS
# 4. （P2）部署分润合约，把 contract_addr 填入 INJECTIVE_SPLIT_CONTRACT_ADDR
```

## 5. 合约部署（P2，可选）

见 `03-SPLIT-REWARDS-CONTRACT.md` §7。

## 6. 健康检查

```bash
curl http://localhost:4000/api/injective/status
# { enabled:true, network:"mock", contractAddr:null, chainId:"injective-888" }

curl "http://localhost:4000/api/injective/balance?addr=inj1test&denom=inj"
# { amount:"10000000000000000000", denom:"inj" }   （mock 固定 10 INJ）
```

## 7. 原服务回归验证（确保没改坏）

```bash
# 原积分通道应仍可用
# 1. 注册用户拿 sk-evoship key（原流程）
# 2. POST /v1/chat/completions 仍走 credits 扣减（INJECTIVE_ENABLED=false 时）
# 3. npm run typecheck 通过
# 4. npm run build:web 通过
```
