// Playground 角色元数据(全部带配音的 19 个角色)
// 素材来源:ClipClashPixel → web/public/assets/sprites 与 audio
// 注意 id ↔ sprite 前缀不一致坑,一律经此表查

export type Role =
  | "orchestrator"
  | "planner"
  | "coder"
  | "reviewer"
  | "explorer";

export type Action = "Idle" | "Opposed" | "Speaking" | "Supported";

export interface PetMeta {
  id: string;
  name: string; // displayName
  desc: string; // role 描述
  sprite: string; // sprite 前缀(PetClawd 等)
  voice: string; // /assets/audio/<voice>.mp3 文件名(也是登场语音)
  catchphrase: string; // 激活/登场台词
  role: Role; // 默认舰种映射
  tint: string; // 角色主题色
}

// 全部带配音的 19 个角色(按类别分组)
export const PETS: PetMeta[] = [
  // —— 圆桌常驻 ——
  { id: "claude", name: "Claude", desc: "逻辑裁判", sprite: "PetClawd",
    voice: "claude_clear_logic.mp3", catchphrase: "先把变量放在桌面上。",
    role: "orchestrator", tint: "#895bff" },
  { id: "zhangxuefeng", name: "张雪峰", desc: "教育观察员", sprite: "PetZhangXuefeng",
    voice: "zhangxuefeng_run_faster.mp3", catchphrase: "我跟你说,这事得看出路。",
    role: "orchestrator", tint: "#ffd23f" },
  { id: "doubao", name: "豆包", desc: "生活助理", sprite: "PetDoubaoHuman",
    voice: "doubao_catch_you.mp3", catchphrase: "我先稳稳接住。",
    role: "planner", tint: "#46d86b" },
  { id: "trump", name: "Trump", desc: "气氛型辩手", sprite: "PetTrump",
    voice: "trump_make_america_great_again.mp3", catchphrase: "Make America Great Again!",
    role: "reviewer", tint: "#ff6b4a" },
  // —— 商业科技 ——
  { id: "leijun", name: "雷军", desc: "硬件 / 发布会", sprite: "PetLeiJun",
    voice: "leijun_are_you_ok.mp3", catchphrase: "Are you OK?",
    role: "planner", tint: "#39b2ff" },
  { id: "zhangyiming", name: "张一鸣", desc: "产品 / 平台", sprite: "PetZhangYiming",
    voice: "zhangyiming_life_30000_days.mp3", catchphrase: "少装一点。",
    role: "coder", tint: "#2fdc72" },
  { id: "musk", name: "Musk", desc: "科技冒险家", sprite: "PetMuskie",
    voice: "musk_go_to_mars.mp3", catchphrase: "先把物理约束算清楚。",
    role: "coder", tint: "#3fe1e8" },
  { id: "sam-altman", name: "Sam Altman", desc: "AI 产品", sprite: "PetSam",
    voice: "sam_too_cheap_to_meter.mp3", catchphrase: "Too cheap to meter.",
    role: "planner", tint: "#7ad0a0" },
  { id: "einstein", name: "Einstein", desc: "科学脑洞", sprite: "PetEinstein",
    voice: "einstein_emc2.mp3", catchphrase: "先做一个思想实验。",
    role: "explorer", tint: "#c8a8ff" },
  { id: "newton", name: "Newton", desc: "基础原理", sprite: "PetNewton",
    voice: "newton_first_principle.mp3", catchphrase: "先看力从哪里来。",
    role: "reviewer", tint: "#9ab0d8" },
  { id: "jensen-huang", name: "黄仁勋", desc: "芯片 / AI 算力", sprite: "PetJensenHuang",
    voice: "jensen_more_you_buy_more_you_save.mp3", catchphrase: "The more you buy, the more you save.",
    role: "coder", tint: "#74ff58" },
  // —— 动漫推理 ——
  { id: "conan", name: "柯南", desc: "证据派侦探", sprite: "PetConan",
    voice: "conan_shinjitsu_hitotsu.mp3", catchphrase: "真相永远只有一个。",
    role: "reviewer", tint: "#5ca8ff" },
  { id: "luffy", name: "路飞", desc: "热血乐观派", sprite: "PetLuffy",
    voice: "luffy_kaizoku_ou_ore_wa_naru.mp3", catchphrase: "我要成为海贼王!",
    role: "explorer", tint: "#ff4f4f" },
  { id: "misa", name: "Misa", desc: "戏剧化观点", sprite: "PetMisa",
    voice: "misa_misamisa_kira_desu.mp3", catchphrase: "弥海砂最棒!",
    role: "explorer", tint: "#ff9ec7" },
  { id: "l-lawliet", name: "L", desc: "冷静推理", sprite: "PetL",
    voice: "l_i_want_to_tell_you_i_am_l.mp3", catchphrase: "我大约有7%的怀疑。",
    role: "reviewer", tint: "#d8d8e8" },
  // —— 有趣角色 ——
  { id: "usachi", name: "乌萨奇", desc: "气氛破坏王", sprite: "PetUsachi",
    voice: "usachi_yaha.mp3", catchphrase: "ヤハーッ!",
    role: "explorer", tint: "#fff0a0" },
  { id: "hachiware", name: "小八", desc: "可爱共情派", sprite: "PetXiaoba",
    voice: "xiaoba_nantoka_nare.mp3", catchphrase: "也就是说……!?",
    role: "planner", tint: "#8ec4ff" },
  { id: "nailong", name: "奶龙", desc: "大笑气氛位", sprite: "PetHappyNailong",
    voice: "nailoong_i_am_nailoong.mp3", catchphrase: "哈哈哈哈哈哈哈",
    role: "explorer", tint: "#ffe066" },
  { id: "rilakkuma", name: "Rilakkuma", desc: "轻松熊替代", sprite: "PetRilakkuma",
    voice: "rilakkuma_uh.mp3", catchphrase: "嗯?",
    role: "planner", tint: "#d4a06a" },
];

export const PET_BY_ID: Record<string, PetMeta> = Object.fromEntries(
  PETS.map((p) => [p.id, p]),
);

/** 生成某角色某动作某帧的 sprite 路径 */
export function spritePath(sprite: string, action: Action, frame: number): string {
  return `/assets/sprites/${sprite}${action}${String(frame).padStart(2, "0")}.png`;
}

export const VOICE_BASE = "/assets/audio/";

/** 舰种 → 中文名/图标/颜色(对齐首页 ROLE) */
export const ROLE_INFO: Record<Role, { name: string; icon: string; color: string }> = {
  orchestrator: { name: "旗舰", icon: "👑", color: "#ffb84d" },
  planner: { name: "导航舰", icon: "🧭", color: "#5ca8ff" },
  coder: { name: "工程舰", icon: "⚡", color: "#3ae0ff" },
  reviewer: { name: "监察舰", icon: "🔍", color: "#8b5cff" },
  explorer: { name: "斥候舰", icon: "💡", color: "#ff5cc8" },
};

/** 场景化任务类型(与角色正交:任何角色可承担任何任务)
 *  节点定制时选一个,保存舰队时 AI 美化会据此定制人设 */
export interface TaskType {
  key: string;
  name: string;        // 中文名
  icon: string;
  duty: string;        // 一句话职责
}

export const TASK_TYPES: TaskType[] = [
  { key: "analysis", name: "需求分析", icon: "🔍", duty: "理解目标、拆解约束、明确验收标准" },
  { key: "design", name: "方案设计", icon: "📐", duty: "架构 / 数据流 / 接口 / 技术选型" },
  { key: "coding", name: "编码实现", icon: "⚙️", duty: "写出可运行代码、处理边界情况" },
  { key: "review", name: "代码审查", icon: "🛡️", duty: "找缺陷、给返工意见、质量把关" },
  { key: "ideation", name: "创意发散", icon: "💡", duty: "跳出常规、非显然方案" },
  { key: "testing", name: "测试验证", icon: "🧪", duty: "构造用例、验证正确性、压测" },
  { key: "docs", name: "文档撰写", icon: "📝", duty: "把产出整理成清晰文档/说明" },
  { key: "research", name: "调研总结", icon: "📚", duty: "搜集信息、比较、总结结论" },
];

export const TASK_TYPE_BY_KEY: Record<string, TaskType> = Object.fromEntries(
  TASK_TYPES.map((t) => [t.key, t]),
);
