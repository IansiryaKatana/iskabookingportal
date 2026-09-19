const ALLOWED_TAGS = new Set([
  "P",
  "BR",
  "STRONG",
  "B",
  "EM",
  "I",
  "U",
  "S",
  "STRIKE",
  "H1",
  "H2",
  "H3",
  "UL",
  "OL",
  "LI",
  "A",
  "BLOCKQUOTE",
  "SPAN",
  "DIV",
]);

const CLASS_TAGS = new Set(["SPAN", "P", "H1", "H2", "H3", "DIV", "LI", "BLOCKQUOTE"]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  A: new Set(["href", "target", "rel"]),
};

export function looksLikeHtml(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(value);
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeHtml(dirty: string): string {
  if (!dirty || typeof document === "undefined") return "";

  const source = document.createElement("template");
  source.innerHTML = dirty;
  const output = document.createElement("template");

  const copy = (from: Node, into: ParentNode) => {
    if (from.nodeType === Node.TEXT_NODE) {
      into.appendChild(document.createTextNode(from.textContent ?? ""));
      return;
    }
    if (from.nodeType !== Node.ELEMENT_NODE) return;

    const el = from as HTMLElement;
    if (!ALLOWED_TAGS.has(el.tagName)) {
      Array.from(el.childNodes).forEach((child) => copy(child, into));
      return;
    }

    const next = document.createElement(el.tagName.toLowerCase());
    const allowed = new Set<string>([
      ...(ALLOWED_ATTRS[el.tagName] ?? []),
      ...(CLASS_TAGS.has(el.tagName) ? ["class"] : []),
    ]);

    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (!allowed.has(name)) continue;
      if (name === "href") {
        const href = attr.value.trim();
        if (!/^(https?:|mailto:|tel:|\/|#)/i.test(href)) continue;
        next.setAttribute(name, href);
        continue;
      }
      if (name === "class") {
        const safeClass = attr.value
          .split(/\s+/)
          .filter((token) => /^ql-align-(left|center|right|justify)$/.test(token))
          .join(" ");
        if (safeClass) next.setAttribute("class", safeClass);
        continue;
      }
      next.setAttribute(name, attr.value);
    }

    if (el.tagName === "A") {
      next.setAttribute("rel", "noopener noreferrer");
    }
    into.appendChild(next);
    Array.from(el.childNodes).forEach((child) => copy(child, next));
  };

  Array.from(source.content.childNodes).forEach((child) => copy(child, output.content));
  return output.innerHTML;
}
