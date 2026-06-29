#!/usr/bin/env python3
"""Fetch reusable model/company icons for benchmark visuals."""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "benchmarks" / "assets" / "model-icons"

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"


ICONS: list[dict[str, Any]] = [
    {
        "id": "openai",
        "name": "OpenAI",
        "url": "https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg",
        "file": "openai.svg",
        "source": "Wikimedia Commons",
    },
    {
        "id": "anthropic",
        "name": "Anthropic",
        "url": "https://cdn.simpleicons.org/anthropic/191919",
        "file": "anthropic.svg",
        "source": "Simple Icons CDN",
    },
    {
        "id": "claude",
        "name": "Claude",
        "url": "https://cdn.simpleicons.org/claude/D97757",
        "file": "claude.svg",
        "source": "Simple Icons CDN",
    },
    {
        "id": "gemini",
        "name": "Google Gemini",
        "url": "https://cdn.simpleicons.org/googlegemini/8E75B2",
        "file": "gemini.svg",
        "source": "Simple Icons CDN",
    },
    {
        "id": "qwen",
        "name": "Qwen",
        "url": "https://cdn.simpleicons.org/qwen/6950EF",
        "file": "qwen.svg",
        "source": "Simple Icons CDN",
    },
    {
        "id": "deepseek",
        "name": "DeepSeek",
        "url": "https://cdn.simpleicons.org/deepseek/5786FE",
        "file": "deepseek.svg",
        "source": "Simple Icons CDN",
    },
    {
        "id": "minimax",
        "name": "MiniMax",
        "url": "https://cdn.simpleicons.org/minimax/E73562",
        "file": "minimax.svg",
        "source": "Simple Icons CDN",
    },
    {
        "id": "kimi",
        "name": "Kimi",
        "url": "https://kimi.moonshot.cn/favicon.ico",
        "file": "kimi.ico",
        "source": "Kimi favicon",
    },
    {
        "id": "moonshot",
        "name": "Moonshot AI",
        "url": "https://kimi.moonshot.cn/favicon.ico",
        "file": "moonshot.ico",
        "source": "Kimi favicon",
    },
    {
        "id": "zhipu",
        "name": "Zhipu AI / GLM",
        "url": "https://www.zhipuai.cn/logo.svg",
        "file": "zhipu.svg",
        "source": "Zhipu AI website",
    },
    {
        "id": "stepfun",
        "name": "StepFun",
        "url": "https://www.stepfun.com/step_favicon.svg",
        "file": "stepfun.svg",
        "source": "StepFun website",
    },
    {
        "id": "mistral",
        "name": "Mistral AI",
        "url": "https://cdn.simpleicons.org/mistralai/FA520F",
        "file": "mistral.svg",
        "source": "Simple Icons CDN",
    },
    {
        "id": "perplexity",
        "name": "Perplexity",
        "url": "https://cdn.simpleicons.org/perplexity/1FB8CD",
        "file": "perplexity.svg",
        "source": "Simple Icons CDN",
    },
    {
        "id": "meta",
        "name": "Meta / Llama",
        "url": "https://cdn.simpleicons.org/meta/0467DF",
        "file": "meta.svg",
        "source": "Simple Icons CDN",
    },
    {
        "id": "ollama",
        "name": "Ollama",
        "url": "https://cdn.simpleicons.org/ollama/000000",
        "file": "ollama.svg",
        "source": "Simple Icons CDN",
    },
    {
        "id": "google",
        "name": "Google",
        "url": "https://cdn.simpleicons.org/google/4285F4",
        "file": "google.svg",
        "source": "Simple Icons CDN",
    },
]


def download(url: str, dest: Path) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "image/*,*/*"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read()
        content_type = resp.headers.get("content-type", "")
    dest.write_bytes(data)
    return len(data), content_type


def make_png_preview(src: Path, dest: Path) -> bool:
    try:
        from PIL import Image  # type: ignore
    except Exception:
        return False
    try:
        with Image.open(src) as im:
            im = im.convert("RGBA")
            im.save(dest)
        return True
    except Exception:
        return False


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = []
    for icon in ICONS:
        dest = OUT / icon["file"]
        size, content_type = download(icon["url"], dest)
        row = {
            **icon,
            "path": str(dest.relative_to(ROOT)),
            "bytes": size,
            "content_type": content_type,
        }
        if dest.suffix.lower() in {".ico", ".png", ".jpg", ".jpeg", ".webp"}:
            png = dest.with_suffix(".png")
            if make_png_preview(dest, png):
                row["png_path"] = str(png.relative_to(ROOT))
        manifest.append(row)
        print(f"{icon['id']}: {dest} ({size} bytes, {content_type})")

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"manifest: {OUT / 'manifest.json'}")


if __name__ == "__main__":
    main()
