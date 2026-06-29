// Markdown 渲染:marked 解析 + DOMPurify 防 XSS
import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ breaks: false, gfm: true });

export function renderMarkdown(md: string): string {
  if (!md) return "";
  const html = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(html);
}
