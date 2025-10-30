import { useSymbolColorStore } from "@/contexts/SymbolColorStore";

function isCompleteHtmlDocument(str: string): boolean {
  const trimmed = str.trim().toLowerCase();
  return trimmed.includes("<!doctype html") || (trimmed.startsWith("<html") && trimmed.includes("</html>"));
}

function detectHtmlTags(str: string): string[] {
  const htmlTagRegex = /<\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/g;
  const selfClosingTagRegex = /<\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/\s*>/g;
  const tags = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = htmlTagRegex.exec(str)) !== null) tags.add(match[1].toLowerCase());
  while ((match = selfClosingTagRegex.exec(str)) !== null) tags.add(match[1].toLowerCase());
  return [...tags];
}

export function convertMarkdown(str: string): string {
  let s = str;
  s = s.replace(/^---$/gm, "");
  s = s.replace(/```[\s\S]*?```/g, (m) => {
    const content = m.replace(/^```\w*\n?/, "").replace(/```$/, "");
    return `<pre>${content}</pre>`;
  });
  s = s.replace(/^>\s*(.+)$/gm, "<blockquote>$1</blockquote>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  // 将引号包裹内容转为 <talk>
  s = s.replace(/(<[^>]+>)|([“”"'][^“”"']+[“”"'])/g, (_m, tag, quote) => {
    if (tag) return tag;
    return `<talk>${quote}</talk>`;
  });
  return s;
}

export function replaceTags(html: string): string {
  const tags = detectHtmlTags(html);
  if (tags.length === 0) return html;
  const { getColorForHtmlTag } = useSymbolColorStore.getState();

  function processHtml(htmlStr: string): string {
    const tagRegex = /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>([\s\S]*?)<\/\1>/g;
    return htmlStr.replace(tagRegex, (match, tagName: string, attributes: string, innerContent: string) => {
      const lower = tagName.toLowerCase();
      const processedInner = processHtml(innerContent);
      let className = "";
      const classMatch = attributes.match(/class\s*=\s*["']([^"']*)["']/i);
      if (classMatch) className = classMatch[1];
      const tagColor = getColorForHtmlTag(lower, className);
      if (tagColor) {
        const preserved = attributes.trim();
        const styleAttr = `style="color:${tagColor}"`;
        const dataAttr = `data-tag="${tagName}"`;
        const classAttr = "class=\"tag-styled\"";
        let finalAttrs = "";
        if (preserved) {
          const styleMatch = preserved.match(/style\s*=\s*["']([^"']*)["']/i);
          const classMatch2 = preserved.match(/class\s*=\s*["']([^"']*)["']/i);
          let modified = preserved;
          if (styleMatch) {
            const existingStyle = styleMatch[1];
            modified = modified.replace(styleMatch[0], `style="${existingStyle}; color:${tagColor}"`);
          } else {
            modified += ` ${styleAttr}`;
          }
          if (classMatch2) {
            const existingClass = classMatch2[1];
            modified = modified.replace(classMatch2[0], `class="${existingClass} tag-styled"`);
          } else {
            modified += ` ${classAttr}`;
          }
          finalAttrs = modified + ` ${dataAttr}`;
        } else {
          finalAttrs = `${classAttr} ${styleAttr} ${dataAttr}`;
        }
        return `<${tagName}${finalAttrs ? " " + finalAttrs : ""}>${processedInner}</${tagName}>`;
      }
      return `<${tagName}${attributes ? " " + attributes : ""}>${processedInner}</${tagName}>`;
    });
  }

  return processHtml(html);
}

export function processForHighlight(html: string): string {
  if (isCompleteHtmlDocument(html)) return html;
  const md = convertMarkdown(html);
  const tagged = replaceTags(md);
  return tagged.replace(/^[\s\r\n]+|[\s\r\n]+$/g, "");
}

