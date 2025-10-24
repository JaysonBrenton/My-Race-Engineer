import { JSDOM } from 'jsdom';

declare global {
  var window: Window & typeof globalThis;
  var document: Document;
  var navigator: Navigator;
  var HTMLElement: typeof globalThis.HTMLElement;
  var Node: typeof globalThis.Node;
  var MutationObserver: typeof globalThis.MutationObserver;
}

const dom = new JSDOM('<!doctype html><html><body></body></html>');

const jsdomWindow = dom.window as unknown as Window & typeof globalThis;
const navigator = jsdomWindow.navigator;

Object.defineProperty(navigator, 'userAgent', {
  value: 'node.js',
  configurable: true,
});

globalThis.window = jsdomWindow;
globalThis.document = jsdomWindow.document;
globalThis.navigator = navigator;
globalThis.HTMLElement = jsdomWindow.HTMLElement;
globalThis.Node = jsdomWindow.Node;
globalThis.MutationObserver = jsdomWindow.MutationObserver;
