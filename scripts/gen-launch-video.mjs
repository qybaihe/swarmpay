// scripts/gen-launch-video.mjs
// 用 MiniMax 图生视频 API,把 public/bg-starship.png 变成火箭发射动态视频。
// 流程: 读图→base64 data URI→submit task→poll→下载 mp4→存 public/bg-launch.mp4
//
// 用法: node scripts/gen-launch-video.mjs

import fs from "node:fs";
import path from "node:path";
import https from "node:https";

const KEY = "sk-cp-6P9f9Qp4v_hpn5qjb77X74rpEkzOIlhHJ_zMfqQVgryZJwbXL-uBiXj6mT8398sNpexOsxUV2jCFQGmC7P9nPxwS3LHj_aGcYlkLBjjP-LhYOQ8ye1jyWm0";
const ROOT = path.resolve(process.cwd());
const IMG = path.join(ROOT, "public", "bg-starship.png");
const OUT = path.join(ROOT, "public", "bg-launch.mp4");

const PROMPT =
  "A cinematic SpaceX-style rocket launch. The colossal stainless-steel starship stands on the launch pad, " +
  "then ignition: massive clouds of white steam and exhaust burst outward at the base, multiple Raptor engines " +
  "ignite with blinding orange-white Mach diamond flames shooting downward. The rocket slowly lifts off, " +
  "rising majestically, flames and smoke billowing dramatically, the sky darkens as it ascends. " +
  "Volumetric light, intense heat haze, slow epic motion, hyper-realistic, the whole frame trembles slightly " +
  "from the thrust power. Camera holds steady as the giant vehicle powers skyward. Dark space background, " +
  "cinematic 4k, photorealistic.";

// ── HTTP fetch helper ──
function fetchJSON(url, opts) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        method: opts.method,
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers: opts.headers,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try { resolve({ status: res.statusCode, json: JSON.parse(data), raw: data }); }
          catch { resolve({ status: res.statusCode, json: null, raw: data }); }
        });
      },
    );
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(); fs.unlinkSync(dest);
        return download(res.headers.location, dest).then(resolve, reject);
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", reject);
  });
}

async function main() {
  console.log("🎬 EvoShip 火箭发射视频生成\n" + "═".repeat(50));

  // 1. 读图 → base64 data URI
  if (!fs.existsSync(IMG)) { console.error("✗ 找不到图片:", IMG); process.exit(1); }
  const buf = fs.readFileSync(IMG);
  const b64 = buf.toString("base64");
  const dataUri = `data:image/png;base64,${b64}`;
  console.log(`✓ 已读取图片 ${(buf.length / 1024 / 1024).toFixed(2)}MB → base64 ${(b64.length / 1024).toFixed(0)}KB`);

  // 2. submit
  console.log("\n📤 提交图生视频任务…");
  const body = JSON.stringify({
    model: "MiniMax-Hailuo-2.3",
    prompt: PROMPT,
    first_frame_image: dataUri,
  });
  const submit = await fetchJSON("https://api.minimaxi.com/v1/video_generation", {
    method: "POST",
    headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    body,
  });
  console.log("submit resp:", JSON.stringify(submit.json || submit.raw));
  const taskId = submit.json?.task_id;
  if (!taskId) { console.error("✗ 没拿到 task_id"); process.exit(1); }
  console.log(`✓ task_id = ${taskId}`);

  // 3. poll
  console.log("\n⏳ 轮询任务状态(通常 2-5 分钟)…");
  const t0 = Date.now();
  let lastStatus = "";
  while (true) {
    await new Promise((r) => setTimeout(r, 10000));
    const q = await fetchJSON(`https://api.minimaxi.com/v1/query/video_generation?task_id=${taskId}`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${KEY}` },
    });
    const j = q.json;
    const status = j?.status;
    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    if (status !== lastStatus) { console.log(`[${elapsed}s] status: ${status}`); lastStatus = status; }
    else process.stdout.write(".");
    // 成功标志: file_id 非空 或 video url
    if (j?.file_id) {
      console.log(`\n✓ 视频生成成功! file_id=${j.file_id} ${j.video_width}x${j.video_height}`);
      console.log("完整返回:", JSON.stringify(j, null, 2));
      // file_id 需要从 files 接口取 url,或返回里直接有 download url
      const dlUrl = j.download_url || j.video_url;
      if (dlUrl) {
        console.log(`\n📥 下载视频 → ${OUT}`);
        await download(dlUrl, OUT);
        console.log(`✓ 完成! ${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)}MB`);
      } else {
        console.log("\n⚠ 返回里没有直接 download_url,尝试 /v1/files/retrieve…");
        const fr = await fetchJSON(`https://api.minimaxi.com/v1/files/retrieve?file_id=${j.file_id}`, {
          method: "GET", headers: { "Authorization": `Bearer ${KEY}` },
        });
        console.log("files/retrieve:", JSON.stringify(fr.json || fr.raw));
        const url2 = fr.json?.file?.download_url || fr.json?.download_url;
        if (url2) { console.log(`📥 下载 → ${OUT}`); await download(url2, OUT); console.log(`✓ ${(fs.statSync(OUT).size/1024/1024).toFixed(2)}MB`); }
      }
      break;
    }
    if (j?.base_resp?.status_code !== 0) {
      console.log("\n✗ 任务异常:", JSON.stringify(j)); break;
    }
    if (Date.now() - t0 > 600000) { console.log("\n✗ 超时(10分钟)"); break; }
  }
  console.log("\n" + "═".repeat(50) + "\n🎬 全部完成");
}
main().catch((e) => { console.error("fatal:", e); process.exit(1); });
