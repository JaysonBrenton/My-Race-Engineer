declare module 'node-html-parser' {
  export class HTMLElement {
    textContent: string | null;
    previousElementSibling: HTMLElement | null;
    parentNode: HTMLElement | null;
    tagName: string;
    getAttribute(name: string): string | null;
    querySelectorAll(selector: string): HTMLElement[];
    querySelector(selector: string): HTMLElement | null;
  }

  export type ParseOptions = {
    lowerCaseTagName?: boolean;
    blockTextElements?: Record<string, boolean>;
  };

  export function parse(html: string, options?: ParseOptions): HTMLElement;
}
