// Minimal markdown to HTML renderer with basic sanitization.
// Escapes HTML, supports headings, bold/italic, code blocks, lists, and links (http/https only).

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function normalizeUrl(input: string): string {
  // Ensure http(s) only and try to unwrap common redirect patterns
  const isHttpish = (u: string) => /^https?:\/\//i.test(u);
  const decodeSafe = (v: string) => {
    try { return decodeURIComponent(v); } catch { return v; }
  };

  let urlStr = input.trim();
  // Early reject
  if (!isHttpish(urlStr)) return input;

  // Try unwrapping up to 3 times to catch nested redirects
  for (let i = 0; i < 3; i++) {
    try {
      const u = new URL(urlStr);

      // Strip common tracking params
      const trackingParams = [
        'utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id',
        'gclid','fbclid','mc_eid','mc_cid','igshid','ved','ei','oq','sclient','sa','source',
        'sca_esv','rlz','bih','biw','ved','usg','opi','ved'
      ];
      trackingParams.forEach((p) => u.searchParams.delete(p));

      // Unwrap common redirect hosts/paths with target params
      const host = u.hostname.toLowerCase();
      const path = u.pathname;
      const candidates = ['url','q','u','target','dest','destination','to','redirect','r','link','RU','ru'];

      let extracted: string | null = null;
      for (const key of candidates) {
        const raw = u.searchParams.get(key);
        if (!raw) continue;
        const maybe = decodeSafe(raw);
        if (isHttpish(maybe)) { extracted = maybe; break; }
      }

      // Special-case Google /url path without query param (rare)
      if (!extracted && (host.endsWith('google.com') || host.endsWith('googleusercontent.com')) && path.startsWith('/url')) {
        const q = u.searchParams.get('q') || u.searchParams.get('url');
        const maybe = q ? decodeSafe(q) : '';
        if (isHttpish(maybe)) extracted = maybe;
      }

      // Yahoo-style RU param may be embedded in path segments; best-effort already covered via searchParams above

      // If we found a nested URL, restart loop with the extracted value
      if (extracted) {
        urlStr = extracted;
        continue;
      }

      // Replace with stripped param version (no trackers)
      urlStr = u.toString();
      break;
    } catch {
      break;
    }
  }

  return urlStr;
}

function inlineMdToHtml(escaped: string): string {
  // Bold **text**
  let s = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic *text*
  s = s.replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, '$1<em>$2</em>');
  // Inline code `code`
  s = s.replace(/`([^`]+?)`/g, '<code class="px-1 py-0.5 bg-gray-100 rounded">$1</code>');
  // Links [text](url) - allow only http/https
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
    const safeText = text;
    const normalized = normalizeUrl(url);
    if (!/^https?:\/\//i.test(normalized)) return safeText;
    const safeUrl = normalized.replace(/\"/g, '&quot;');
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="underline">${safeText}</a>`;
  });
  // Autolink bare URLs (http/https) not already part of a link attribute. Basic heuristic using start/whitespace boundary.
  s = s.replace(/(^|\s)(https?:\/\/[^\s<]+)/g, (_m, pre, url) => {
    const normalized = normalizeUrl(url);
    const safeUrl = normalized.replace(/\"/g, '&quot;');
    return `${pre}<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="underline">${safeUrl}</a>`;
  });
  return s;
}

export function markdownToHtml(md: string): string {
  if (!md) return "";

  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  let html = "";
  let i = 0;
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let codeBuffer: string[] = [];

  const closeLists = () => {
    if (inUl) { html += "</ul>"; inUl = false; }
    if (inOl) { html += "</ol>"; inOl = false; }
  };

  while (i < lines.length) {
    const raw = lines[i++] ?? "";

    // Fenced code block
    if (/^```/.test(raw)) {
      if (!inCode) {
        closeLists();
        inCode = true;
        codeBuffer = [];
      } else {
        // close
        const escaped = escapeHtml(codeBuffer.join("\n"));
        html += `<pre class="overflow-auto rounded bg-gray-100 p-3 text-sm"><code>${escaped}</code></pre>`;
        inCode = false;
      }
      continue;
    }

    if (inCode) { codeBuffer.push(raw); continue; }

    const line = raw.trimEnd();
    if (!line.trim()) { closeLists(); continue; }

    // Heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      closeLists();
      const level = h[1].length;
      const content = inlineMdToHtml(escapeHtml(h[2]));
      html += `<h${level} class="mt-4 font-semibold text-${Math.max(6 - level + 1, 1)}xl">${content}</h${level}>`;
      continue;
    }

    // Unordered list
    const ul = /^[-*]\s+(.*)$/.exec(line);
    if (ul) {
      if (!inUl) { closeLists(); html += "<ul class=\"list-disc pl-6 space-y-1\">"; inUl = true; }
      const li = inlineMdToHtml(escapeHtml(ul[1]));
      html += `<li>${li}</li>`;
      continue;
    }

    // Ordered list
    const ol = /^(\d+)\.\s+(.*)$/.exec(line);
    if (ol) {
      if (!inOl) { closeLists(); html += "<ol class=\"list-decimal pl-6 space-y-1\">"; inOl = true; }
      const li = inlineMdToHtml(escapeHtml(ol[2]));
      html += `<li>${li}</li>`;
      continue;
    }

    // Paragraph
    closeLists();
    const para = inlineMdToHtml(escapeHtml(line));
    html += `<p class="mt-3">${para}</p>`;
  }

  // Close any open blocks
  if (inCode) {
    const escaped = escapeHtml(codeBuffer.join("\n"));
    html += `<pre class="overflow-auto rounded bg-gray-100 p-3 text-sm"><code>${escaped}</code></pre>`;
  }
  closeLists();

  return html;
}
