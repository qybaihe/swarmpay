#!/usr/bin/env python3
"""Normalize downloaded benchmark datasets into JSONL evalsets.

The TypeScript runner reads only JSONL so it does not need parquet/csv
dependencies at runtime. Parquet inputs require pyarrow:

  python3 -m pip install --target /tmp/evoship-pydeps pyarrow pandas
  PYTHONPATH=/tmp/evoship-pydeps python3 benchmarks/scripts/bench-normalize.py
"""

from __future__ import annotations

import ast
import csv
import gzip
import json
import re
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "benchmarks" / "datasets"
OUT = ROOT / "benchmarks" / "evalsets"


def read_parquet(path: Path) -> list[dict[str, Any]]:
    try:
        import pyarrow.parquet as pq  # type: ignore
    except Exception as exc:  # pragma: no cover - environment message
        raise SystemExit(
            "pyarrow is required for parquet normalization. "
            "Run: python3 -m pip install --target /tmp/evoship-pydeps pyarrow pandas "
            "and then PYTHONPATH=/tmp/evoship-pydeps python3 benchmarks/scripts/bench-normalize.py"
        ) from exc
    return pq.read_table(path).to_pylist()


def write_jsonl(name: str, rows: Iterable[dict[str, Any]]) -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.jsonl"
    count = 0
    with path.open("w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
            count += 1
    return count


def letters(n: int) -> list[str]:
    return [chr(ord("A") + i) for i in range(n)]


def mcq_prompt(question: str, choices: list[dict[str, str]]) -> str:
    choice_text = "\n".join(f"({c['label']}) {c['text']}" for c in choices)
    return f"{question.strip()}\n\n{choice_text}"


def item(
    suite: str,
    item_id: str,
    task_type: str,
    question: str,
    answer: str,
    *,
    subset: str | None = None,
    choices: list[dict[str, str]] | None = None,
    aliases: list[str] | None = None,
    tests: list[str] | None = None,
    test: str | None = None,
    entry_point: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "id": item_id,
        "suite": suite,
        "subset": subset or suite,
        "type": task_type,
        "question": question,
        "choices": choices,
        "answer": answer,
        "aliases": aliases or [],
        "tests": tests or [],
        "test": test,
        "entry_point": entry_point,
        "metadata": metadata or {},
    }


def normalize_aime() -> int:
    path = DATA / "aime" / "aime90.jsonl"
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        q = json.loads(line)
        rows.append(item("aime", f"aime/{q['id']}", "math_int", q["problem"], str(q["answer"]), metadata={"url": q.get("url")}))
    return write_jsonl("aime", rows)


def normalize_math500() -> int:
    rows = []
    path = DATA / "math500" / "math500.jsonl"
    for i, line in enumerate(path.read_text(encoding="utf-8").splitlines()):
        q = json.loads(line)
        rows.append(item(
            "math500",
            q.get("unique_id") or f"math500/{i}",
            "math_expr",
            q["problem"],
            q["answer"],
            subset=q.get("subject"),
            metadata={"level": q.get("level"), "subject": q.get("subject"), "solution": q.get("solution")},
        ))
    return write_jsonl("math500", rows)


def normalize_gsm8k() -> int:
    rows = []
    path = DATA / "gsm8k" / "test.jsonl"
    for i, line in enumerate(path.read_text(encoding="utf-8").splitlines()):
        q = json.loads(line)
        m = re.search(r"####\s*([-+]?\d[\d,]*(?:\.\d+)?)", q["answer"])
        answer = m.group(1).replace(",", "") if m else q["answer"].strip().splitlines()[-1]
        rows.append(item("gsm8k", f"gsm8k/test/{i}", "math_number", q["question"], answer, metadata={"solution": q["answer"]}))
    return write_jsonl("gsm8k", rows)


def normalize_bbh() -> int:
    rows = []
    for path in sorted((DATA / "bbh" / "tasks").glob("*.json")):
        if path.name == "README.md":
            continue
        task = path.stem
        data = json.loads(path.read_text(encoding="utf-8"))
        for i, ex in enumerate(data.get("examples", [])):
            rows.append(item("bbh", f"bbh/{task}/{i}", "short_exact", ex["input"], str(ex["target"]), subset=task))
    return write_jsonl("bbh", rows)


def parse_boxed_letter(text: str) -> str:
    m = re.search(r"\\boxed\{\s*([A-Z])\s*\}", text)
    return m.group(1) if m else text.strip()


def normalize_gpqa() -> dict[str, int]:
    counts: dict[str, int] = {}
    for name, rel in {
        "gpqa_diamond": "gpqa_diamond_mc.parquet",
        "gpqa_main": "gpqa_main_mc.parquet",
        "gpqa_diamond_freeform": "gpqa_diamond_freeform.parquet",
    }.items():
        rows = []
        for i, q in enumerate(read_parquet(DATA / "gpqa" / rel)):
            task_type = "mcq" if name != "gpqa_diamond_freeform" else "short_exact"
            answer = parse_boxed_letter(q["solution"]) if task_type == "mcq" else q["solution"]
            rows.append(item(
                name,
                f"{name}/{i}",
                task_type,
                q["problem"],
                answer,
                subset=q.get("domain"),
                metadata={"domain": q.get("domain"), "solution": q.get("solution")},
            ))
        counts[name] = write_jsonl(name, rows)
    return counts


def normalize_mmlu_pro() -> int:
    rows = []
    for q in read_parquet(DATA / "mmlu_pro" / "test.parquet"):
        labels = letters(len(q["options"]))
        choices = [{"label": labels[i], "text": str(opt)} for i, opt in enumerate(q["options"])]
        rows.append(item(
            "mmlu_pro",
            f"mmlu_pro/{q['question_id']}",
            "mcq",
            mcq_prompt(q["question"], choices),
            q["answer"],
            subset=q.get("category"),
            choices=choices,
            metadata={"category": q.get("category"), "src": q.get("src"), "answer_index": q.get("answer_index")},
        ))
    return write_jsonl("mmlu_pro", rows)


def normalize_mmlu() -> int:
    rows = []
    for i, q in enumerate(read_parquet(DATA / "mmlu" / "all_test.parquet")):
        labels = letters(len(q["choices"]))
        choices = [{"label": labels[j], "text": str(opt)} for j, opt in enumerate(q["choices"])]
        answer = labels[int(q["answer"])]
        rows.append(item(
            "mmlu",
            f"mmlu/{q['subject']}/{i}",
            "mcq",
            mcq_prompt(q["question"], choices),
            answer,
            subset=q.get("subject"),
            choices=choices,
            metadata={"subject": q.get("subject"), "answer_index": q.get("answer")},
        ))
    return write_jsonl("mmlu", rows)


def normalize_arc() -> int:
    rows = []
    for q in read_parquet(DATA / "arc_challenge" / "test.parquet"):
        choices = [{"label": label, "text": text} for label, text in zip(q["choices"]["label"], q["choices"]["text"])]
        rows.append(item("arc_challenge", q["id"], "mcq", mcq_prompt(q["question"], choices), q["answerKey"], choices=choices))
    return write_jsonl("arc_challenge", rows)


def normalize_truthfulqa() -> int:
    rows = []
    for i, q in enumerate(read_parquet(DATA / "truthfulqa" / "multiple_choice_validation.parquet")):
        targets = q["mc1_targets"]
        labels = letters(len(targets["choices"]))
        choices = [{"label": labels[j], "text": str(opt)} for j, opt in enumerate(targets["choices"])]
        answer_index = list(targets["labels"]).index(1)
        rows.append(item("truthfulqa", f"truthfulqa/{i}", "mcq", mcq_prompt(q["question"], choices), labels[answer_index], choices=choices))
    return write_jsonl("truthfulqa", rows)


def normalize_hellaswag() -> int:
    rows = []
    for q in read_parquet(DATA / "hellaswag" / "validation.parquet"):
        labels = letters(len(q["endings"]))
        choices = [{"label": labels[j], "text": str(opt)} for j, opt in enumerate(q["endings"])]
        rows.append(item(
            "hellaswag",
            f"hellaswag/{q['ind']}",
            "mcq",
            mcq_prompt(f"Choose the most plausible continuation:\n{q['ctx']}", choices),
            labels[int(q["label"])],
            subset=q.get("activity_label"),
            choices=choices,
        ))
    return write_jsonl("hellaswag", rows)


def normalize_commonsenseqa() -> int:
    rows = []
    for q in read_parquet(DATA / "commonsenseqa" / "validation.parquet"):
        choices = [{"label": label, "text": text} for label, text in zip(q["choices"]["label"], q["choices"]["text"])]
        rows.append(item("commonsenseqa", q["id"], "mcq", mcq_prompt(q["question"], choices), q["answerKey"], choices=choices))
    return write_jsonl("commonsenseqa", rows)


def normalize_winogrande() -> int:
    rows = []
    for i, q in enumerate(read_parquet(DATA / "winogrande" / "validation.parquet")):
        choices = [{"label": "A", "text": q["option1"]}, {"label": "B", "text": q["option2"]}]
        answer = "A" if str(q["answer"]) == "1" else "B"
        rows.append(item("winogrande", f"winogrande/{i}", "mcq", mcq_prompt(q["sentence"], choices), answer, choices=choices))
    return write_jsonl("winogrande", rows)


def normalize_strategyqa() -> int:
    data = json.loads((DATA / "strategyqa" / "train.json").read_text(encoding="utf-8"))
    rows = []
    for q in data:
        answer = "yes" if bool(q["answer"]) else "no"
        rows.append(item("strategyqa", q.get("qid") or f"strategyqa/{len(rows)}", "boolean", q["question"], answer, metadata={"term": q.get("term"), "description": q.get("description")}))
    return write_jsonl("strategyqa", rows)


def normalize_musr() -> int:
    rows = []
    with (DATA / "musr" / "all.csv").open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for i, q in enumerate(reader):
            raw_choices = ast.literal_eval(q["choices"])
            labels = letters(len(raw_choices))
            choices = [{"label": labels[j], "text": str(opt)} for j, opt in enumerate(raw_choices)]
            answer = labels[int(q["answer_index"])]
            prompt = f"{q['narrative']}\n\nQuestion: {q['question']}"
            rows.append(item("musr", f"musr/{i}", "mcq", mcq_prompt(prompt, choices), answer, choices=choices, metadata={"answer_choice": q.get("answer_choice")}))
    return write_jsonl("musr", rows)


def normalize_drop() -> int:
    rows = []
    for q in read_parquet(DATA / "drop" / "validation.parquet"):
        aliases = [str(s) for s in q["answers_spans"]["spans"]]
        answer = aliases[0] if aliases else ""
        prompt = f"Passage:\n{q['passage']}\n\nQuestion: {q['question']}"
        rows.append(item("drop", q["query_id"], "qa_exact", prompt, answer, aliases=aliases, subset=q.get("section_id")))
    return write_jsonl("drop", rows)


def normalize_humaneval() -> int:
    rows = []
    with gzip.open(DATA / "human_eval" / "HumanEval.jsonl.gz", "rt", encoding="utf-8") as fh:
        for line in fh:
            q = json.loads(line)
            rows.append(item(
                "humaneval",
                q["task_id"],
                "code_python",
                q["prompt"],
                q.get("canonical_solution", ""),
                test=q.get("test"),
                entry_point=q.get("entry_point"),
            ))
    return write_jsonl("humaneval", rows)


def normalize_mbpp() -> int:
    rows = []
    for q in read_parquet(DATA / "mbpp" / "test.parquet"):
        rows.append(item(
            "mbpp",
            f"mbpp/{q['task_id']}",
            "code_python",
            q["prompt"],
            q.get("code", ""),
            tests=[str(t) for t in q.get("test_list", [])],
            metadata={"source_file": q.get("source_file"), "test_imports": q.get("test_imports")},
        ))
    return write_jsonl("mbpp", rows)


def main() -> None:
    counts: dict[str, int] = {
        "aime": normalize_aime(),
        "math500": normalize_math500(),
        "gsm8k": normalize_gsm8k(),
        "bbh": normalize_bbh(),
        "mmlu_pro": normalize_mmlu_pro(),
        "mmlu": normalize_mmlu(),
        "arc_challenge": normalize_arc(),
        "truthfulqa": normalize_truthfulqa(),
        "hellaswag": normalize_hellaswag(),
        "commonsenseqa": normalize_commonsenseqa(),
        "winogrande": normalize_winogrande(),
        "strategyqa": normalize_strategyqa(),
        "musr": normalize_musr(),
        "drop": normalize_drop(),
        "humaneval": normalize_humaneval(),
        "mbpp": normalize_mbpp(),
    }
    counts.update(normalize_gpqa())
    manifest = {
        "schema": "evoship-benchmark-evalset-v1",
        "fields": ["id", "suite", "subset", "type", "question", "choices", "answer", "aliases", "tests", "test", "entry_point", "metadata"],
        "counts": dict(sorted(counts.items())),
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    for name, count in sorted(counts.items()):
        print(f"{name}: {count}")
    print(f"manifest: {OUT / 'manifest.json'}")


if __name__ == "__main__":
    main()
