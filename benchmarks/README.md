# EvoShip Benchmark Runner

本目录提供本地 benchmark runner 的约定说明，以及运行时可复用的模型图标素材。

## 工具

- `benchmarks/scripts/bench-eval.ts`: 通用 baseline vs swarm 成对评测 runner。
- `benchmarks/scripts/bench-normalize.py`: 将本地准备好的原始题库规范化为 JSONL evalsets。
- `benchmarks/scripts/aime-eval.ts`: AIME 专用成对评测脚本。
- `benchmarks/scripts/math-eval.ts`: MATH-500 专用成对评测脚本。
- `benchmarks/assets/model-icons/`: 模型图标素材。

## 数据准备

将原始题库放到 `benchmarks/datasets/`，再生成统一 evalset:

```bash
npm run bench:normalize
```

如果缺少 parquet 依赖，可临时安装到 `/tmp`，避免污染项目依赖:

```bash
python3 -m pip install --target /tmp/evoship-pydeps pyarrow pandas
```

## 运行

通用 runner 默认读取 `benchmarks/evalsets/<suite>.jsonl`，并调用 EvoShip OpenAI-compatible endpoint:

```bash
npm run bench:eval -- <suite> --n 20 --concurrency 1
npm run bench:aime -- 10 3
npm run bench:math -- 20
```

默认端点配置:

```text
SWARM_ENDPOINT=http://localhost:4000/v1
SWARM_API_KEY=eval
```

结果写入 `benchmarks/results/`。
