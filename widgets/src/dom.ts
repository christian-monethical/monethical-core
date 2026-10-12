/** Minimal DOM helpers. Everything is built with createElement/textContent: never HTML strings. */

export type Child = Node | string | null | undefined | false;
type AttrValue = string | number | boolean | null | undefined | ((event: Event) => void);
export type Attrs = Record<string, AttrValue>;

/** Create an element. Function values become listeners; `on*` strings are refused. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [name, value] of Object.entries(attrs)) {
      if (typeof value === 'function') el.addEventListener(name, value);
      else if (value === true) el.setAttribute(name, '');
      else if (value !== false && value != null && !name.startsWith('on')) {
        el.setAttribute(name, String(value));
      }
    }
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    parent.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

export function clear(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Only absolute https URLs without characters that could break out of an attribute. */
export function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !/^https:\/\/[^\s"'<>\\]+$/.test(value)) return null;
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

export interface Shadow {
  root: ShadowRoot;
  holder: HTMLElement;
  destroy(): void;
}

/** Attach an isolated holder (with its own stylesheet) under `parent`. */
export function mountShadow(parent: Node, css: string): Shadow {
  const holder = document.createElement('div');
  const root = holder.attachShadow({ mode: 'open' });
  root.appendChild(h('style', null, css));
  parent.appendChild(holder);
  return { root, holder, destroy: () => { holder.remove(); } };
}

let counter = 0;
export function uid(prefix = 'mw'): string {
  counter += 1;
  return `${prefix}${counter.toString(36)}`;
}

/** Fire-and-forget CustomEvent on window. */
export function emit(name: string, detail: unknown): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}
