/** Strip common markdown so AI copy renders as clean plain text. */
export function stripMarkdown(text: string): string {
  if (!text) return '';
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[\s]*[-•*]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .trim();
}

function normalizeLine(line: string): string {
  return stripMarkdown(line)
    .replace(/^👋\s*/, '')
    .replace(/^Business\s+Update\s+for\s+[^:]+:\s*/i, '')
    .trim();
}

function splitSentences(text: string): string[] {
  const cleaned = normalizeLine(text);
  if (!cleaned) return [];
  const parts = cleaned
    .split(/(?<=[.!?])\s+(?=[A-Z]|Please|Low|Today|Your|Note)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
  return parts.length > 0 ? parts : [cleaned];
}

export interface ParsedInsight {
  title?: string;
  bullets: string[];
}

/** Turn AI insight/greeting text into a title plus short bullet lines for cards. */
export function parseInsightBullets(raw: string, max = 3): ParsedInsight {
  const stripped = stripMarkdown(raw);
  const lines = stripped.split('\n').map((l) => l.trim()).filter(Boolean);

  let title: string | undefined;
  const bodyLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isGreeting =
      i === 0 &&
      line.length <= 48 &&
      !/GHS|\d{2,}/.test(line) &&
      (/^good\s|^hello|^hi\b|^welcome/i.test(line) || /^#{0,0}good/i.test(line));

    if (isGreeting) {
      title = normalizeLine(line).replace(/[!.]+$/, '').trim() || undefined;
      continue;
    }
    bodyLines.push(line);
  }

  const body = bodyLines.join(' ');
  const bullets = splitSentences(body).slice(0, max);

  if (!title && bullets.length > 0) {
    const first = bullets[0];
    if (first.length <= 48 && /^good\s|^hello/i.test(first)) {
      title = first.replace(/[!.]+$/, '').trim();
      bullets.shift();
    }
  }

  return { title, bullets };
}
