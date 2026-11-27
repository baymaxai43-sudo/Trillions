/**
 * Some models (or providers whose native tool calling fails) write tool calls or planner JSON as plain
 * text: `{"name": "github_get_file", ...}`, `<function=fetch_url>{...}</function>`, `{"steps": [...]}`.
 * This filter sits on the delta stream and drops such blocks when they start a line, so the user never
 * sees raw machinery. Ordinary prose and fenced code blocks pass through unchanged.
 */
/** Fences Gemini-style models wrap tool calls in. ```json is only dropped when its body is tool-call JSON. */
const FENCE_OPEN = /^[ \t]*```[ \t]*(json|tool_code|tool_call|tool_calls|function_call|function|python_tag)[ \t]*\r?\n$/i;
const ALWAYS_TOOL_FENCES = new Set(['tool_code', 'tool_call', 'tool_calls', 'function_call', 'function', 'python_tag']);

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** True for JSON that is a tool call / planner leak rather than data the user asked for. */
export function looksLikeToolCallJson(body: string): boolean {
  const t = body.trim();
  if (!t) return false;
  let v: unknown;
  try {
    v = JSON.parse(t);
  } catch {
    const c = t.replace(/\s+/g, '');
    return /^\[?\{"(tool_calls|function_call|tool_code|function)"/.test(c) || (/^\[?\{"name":"[a-z0-9_]+"/i.test(c) && /"(arguments|parameters|args)":/.test(c));
  }
  const isCall = (o: unknown): boolean => {
    if (!isObj(o)) return false;
    if ('tool_calls' in o || 'function_call' in o || 'tool_code' in o) return true;
    if (isObj(o.function) && typeof (o.function as Record<string, unknown>).name === 'string') return true;
    const name = o.name ?? o.tool ?? o.tool_name;
    if (typeof name === 'string' && /^[a-z0-9_.]+$/i.test(name) && ('arguments' in o || 'parameters' in o || 'args' in o || 'input' in o)) return true;
    const keys = Object.keys(o);
    return keys.length === 1 && Array.isArray(o.steps) && o.steps.every((x) => typeof x === 'string');
  };
  return Array.isArray(v) ? v.length > 0 && v.every(isCall) : isCall(v);
}

const PREFIXES = ['{"name"', '{"steps"', '{"tool', '{"function"', '{"arguments"', '{"type":"function"', '[{"name"', '<function', '<tool_call>', '<|tool', '<|python_tag|>'];

type Mode = 'text' | 'json' | 'tag' | 'fence';

export class ToolCallTextFilter {
  private buf = '';
  private mode: Mode = 'text';
  private lineStart = true;
  private depth = 0;
  private inStr = false;
  private esc = false;
  private inFence = false;
  /** A buffered ```json / ```tool_code block, held until it closes so it can be classified. */
  private fence = '';
  private fenceLang = '';
  /** True once anything was dropped in this turn. */
  suppressed = false;

  /** Feed a delta; returns the text that is safe to show now. */
  push(chunk: string): string {
    this.buf += chunk;
    return this.drain(false);
  }

  /** End of turn: returns whatever is left that is safe to show. */
  flush(): string {
    let out = this.drain(true);
    if (this.mode === 'fence') {
      // Unclosed block at end of turn: show it unless it is tool-call text.
      const body = this.fence.slice(this.fence.indexOf('\n') + 1);
      if (ALWAYS_TOOL_FENCES.has(this.fenceLang) || looksLikeToolCallJson(body) || PREFIXES.some((p) => body.replace(/\s+/g, '').startsWith(p))) this.suppressed = true;
      else out += this.fence;
      this.fence = '';
      this.mode = 'text';
    }
    if (this.mode !== 'text') this.suppressed = true;
    this.buf = '';
    this.mode = 'text';
    this.lineStart = true;
    return out;
  }

  private drain(final: boolean): string {
    let out = '';
    while (this.buf.length) {
      if (this.mode === 'json') {
        if (!this.skipJson()) return out;
        continue;
      }
      if (this.mode === 'fence') {
        const nl = this.buf.indexOf('\n');
        if (nl < 0 && !final) return out;
        const line = nl >= 0 ? this.buf.slice(0, nl + 1) : this.buf;
        this.buf = this.buf.slice(line.length);
        this.fence += line;
        if (/^[ \t]*```[ \t]*\r?\n?$/.test(line)) {
          const body = this.fence.slice(this.fence.indexOf('\n') + 1).replace(/[ \t]*```[ \t]*\r?\n?$/, '');
          if (ALWAYS_TOOL_FENCES.has(this.fenceLang) || looksLikeToolCallJson(body)) {
            this.suppressed = true;
            this.buf = this.buf.replace(/^[ \t]*\r?\n/, '');
          } else out += this.fence;
          this.fence = '';
          this.mode = 'text';
          this.lineStart = true;
        }
        continue;
      }
      if (this.mode === 'tag') {
        const m = this.buf.match(/<\/function>|<\/tool_call>|<\|eom_id\|>|<\|eot_id\|>/);
        if (!m || m.index === undefined) {
          this.buf = '';
          return out;
        }
        this.buf = this.buf.slice(m.index + m[0].length);
        this.mode = 'text';
        this.lineStart = true;
        continue;
      }
      if (this.lineStart && !this.inFence) {
        const lead = this.buf.match(/^[ \t\r\n]*/)?.[0] ?? '';
        const rest = this.buf.slice(lead.length);
        const compact = rest.replace(/\s+/g, '').slice(0, 24);
        if (!compact && !final) return out; // only whitespace so far: wait
        const hit = PREFIXES.find((p) => compact.startsWith(p));
        if (hit) {
          this.suppressed = true;
          this.buf = rest;
          if (hit.startsWith('<')) this.mode = 'tag';
          else {
            this.mode = 'json';
            this.depth = 0;
            this.inStr = false;
            this.esc = false;
          }
          continue;
        }
        const maybe = PREFIXES.some((p) => p.startsWith(compact) && compact.length < p.length);
        if (maybe && !final) return out; // could still become a tool call: wait for more
      }
      const nl = this.buf.indexOf('\n');
      const line = nl >= 0 ? this.buf.slice(0, nl + 1) : this.buf;
      if (nl < 0 && !final && this.lineStart && line.length < 24 && /^[ \t]*[{<[]/.test(line)) return out;
      if (nl < 0 && !final && this.lineStart && !this.inFence && /^[ \t]*`{1,3}[A-Za-z_]*[ \t]*$/.test(line)) return out; // maybe a ```json fence
      const fo = this.lineStart && !this.inFence ? line.match(FENCE_OPEN) : null;
      if (fo) {
        this.mode = 'fence';
        this.fenceLang = fo[1].toLowerCase();
        this.fence = line;
        this.buf = this.buf.slice(line.length);
        continue;
      }
      out += line;
      if (/^\s*```/.test(line)) this.inFence = !this.inFence;
      this.buf = this.buf.slice(line.length);
      this.lineStart = nl >= 0;
    }
    return out;
  }

  /** Consumes a JSON value from buf; returns false when more input is needed. */
  private skipJson(): boolean {
    for (let i = 0; i < this.buf.length; i++) {
      const c = this.buf[i];
      if (this.inStr) {
        if (this.esc) this.esc = false;
        else if (c === '\\') this.esc = true;
        else if (c === '"') this.inStr = false;
        continue;
      }
      if (c === '"') this.inStr = true;
      else if (c === '{' || c === '[') this.depth++;
      else if (c === '}' || c === ']') {
        this.depth--;
        if (this.depth <= 0) {
          this.buf = this.buf.slice(i + 1).replace(/^[ \t]*\r?\n?/, '');
          this.mode = 'text';
          this.lineStart = true;
          return true;
        }
      }
    }
    this.buf = '';
    return false;
  }
}
