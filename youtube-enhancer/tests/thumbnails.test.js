// youtube-enhancer/tests/thumbnails.test.js
// stdlib node:test only, hand-rolled DOM stub. No deps.
'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE_PATH = path.join(__dirname, '..', 'features', 'thumbnails.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

function makeImg({ href = null, src = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', srcset = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg 120w', visible = true } = {}) {
  const anchor = href
    ? {
        href,
        getAttribute(name) { return name === 'href' ? this.href : null; }
      }
    : null;
  const img = {
    isConnected: true,
    src,
    srcset,
    currentSrc: '',
    dataset: {},
    onerror: null,
    parentElement: null,
    _attrs: { src, srcset },
    getAttribute(name) { return this._attrs[name] ?? null; },
    setAttribute(name, value) { this._attrs[name] = value; if (name === 'src') this.src = value; if (name === 'srcset') this.srcset = value; },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this._attrs, name); },
    removeAttribute(name) { delete this._attrs[name]; if (name === 'srcset') this.srcset = ''; },
    _rect: visible ? { width: 320, height: 180 } : { width: 0, height: 0 },
    getBoundingClientRect() { return this._rect; },
    closest(selector) {
      if (selector === 'a[href]') return anchor;
      return null;
    },
    querySelector() { return null; },
    _anchor: anchor
  };
  return img;
}

function loadModule(images, { features = { thumbnails: true }, extensionEnabled = true } = {}) {
  const observers = [];
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
  };
  const listeners = { window: {}, document: {} };
  sandbox.window = {
    youtubeEnhancerSettings: { extensionEnabled, features },
    youtubeEnhancer: undefined,
    addEventListener: (type, fn) => { (listeners.window[type] = listeners.window[type] || []).push(fn); },
    removeEventListener: (type, fn) => {
      if (listeners.window[type]) listeners.window[type] = listeners.window[type].filter((f) => f !== fn);
    },
  };
  sandbox.document = {
    body: {},
    documentElement: {},
    querySelectorAll: (sel) => (sel === 'ytd-thumbnail img' ? images : []),
    addEventListener: (type, fn) => { (listeners.document[type] = listeners.document[type] || []).push(fn); },
    removeEventListener: (type, fn) => {
      if (listeners.document[type]) listeners.document[type] = listeners.document[type].filter((f) => f !== fn);
    },
  };
  sandbox.MutationObserver = class {
    constructor() { this.disconnectCalls = 0; this.observed = []; observers.push(this); }
    observe(target, opts) { this.observed.push({ target, opts }); }
    disconnect() { this.disconnectCalls += 1; }
  };
  sandbox.IntersectionObserver = class {
    constructor() { this.disconnectCalls = 0; this.observed = []; observers.push(this); }
    observe(el) { this.observed.push(el); }
    unobserve() {}
    disconnect() { this.disconnectCalls += 1; }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return { sandbox, api: sandbox.window.youtubeEnhancer.thumbnails, observers, listeners };
}

describe('frameUrl', () => {
  it('builds mqdefault URL', () => {
    const { api } = loadModule([]);
    assert.equal(api.frameUrl('dQw4w9WgXcQ'), 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
  });
});

describe('extractVideoId', () => {
  it('extracts from watch URL', () => {
    const { api } = loadModule([]);
    assert.equal(api.extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    assert.equal(api.extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s'), 'dQw4w9WgXcQ');
  });
  it('extracts from shorts URL', () => {
    const { api } = loadModule([]);
    assert.equal(api.extractVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  });
  it('extracts from /vi/ thumbnail URL', () => {
    const { api } = loadModule([]);
    assert.equal(api.extractVideoId('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'), 'dQw4w9WgXcQ');
  });
  it('returns null for invalid input (no-op)', () => {
    const { api } = loadModule([]);
    assert.equal(api.extractVideoId(''), null);
    assert.equal(api.extractVideoId(null), null);
    assert.equal(api.extractVideoId(undefined), null);
    assert.equal(api.extractVideoId('https://example.com/nope'), null);
    assert.equal(api.extractVideoId('not a url'), null);
  });
});

describe('swap/restore round-trip', () => {
  it('swaps src to frame and restores original on cleanup', () => {
    const original = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg';
    const img = makeImg({ href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', src: original });
    const { api } = loadModule([img]);
    api.init();
    assert.equal(img.src, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
    assert.equal(img.dataset.originalSrc, original);
    api.cleanup();
    assert.equal(img.src, original);
    assert.equal(img.dataset.thumbSwapped, undefined);
  });

  it('restores original after hqdefault fallback fails', () => {
    const original = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg';
    const img = makeImg({ href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', src: original });
    const { api } = loadModule([img]);
    api.init();
    assert.equal(typeof img.onerror, 'function');
    img.onerror(); // mq error -> hq fallback
    assert.equal(img.src, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    img.onerror(); // hq error -> restore
    assert.equal(img.src, original);
  });

  it('does not swap when feature disabled', () => {
    const original = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg';
    const img = makeImg({ href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', src: original });
    const { api } = loadModule([img], { features: { thumbnails: false } });
    api.init();
    assert.equal(img.src, original);
    assert.equal(img.dataset.thumbSwapped, undefined);
  });

  it('no-ops on invalid / unparseable href', () => {
    const original = 'https://example.com/poster.jpg';
    const img = makeImg({ href: 'https://example.com/video/123', src: original });
    const { api } = loadModule([img]);
    api.init();
    assert.equal(img.src, original);
  });

  it('clears and restores srcset on swap/cleanup', () => {
    const original = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg';
    const originalSrcset = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg 120w';
    const img = makeImg({ href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', src: original, srcset: originalSrcset });
    const { api } = loadModule([img]);
    api.init();
    assert.equal(img.hasAttribute('srcset'), false);
    assert.equal(img.srcset, '');
    api.cleanup();
    assert.equal(img.hasAttribute('srcset'), true);
    assert.equal(img.srcset, originalSrcset);
    assert.equal(img.getAttribute('srcset'), originalSrcset);
  });

  it('removes srcset attribute on restore when originally absent', () => {
    const original = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg';
    const img = makeImg({ href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', src: original });
    delete img._attrs.srcset;
    img.srcset = '';
    const { api } = loadModule([img]);
    api.init();
    assert.equal(img.src, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
    api.cleanup();
    assert.equal(img.hasAttribute('srcset'), false);
  });

  it('skips hidden images and swaps them once visible on re-sweep', () => {
    const original = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg';
    const img = makeImg({ href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', src: original, visible: false });
    const { api } = loadModule([img]);
    api.init();
    assert.equal(img.src, original);
    assert.equal(img.dataset.thumbSwapped, undefined);
    img._rect = { width: 320, height: 180 };
    api._sweep();
    assert.equal(img.src, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
    api.cleanup();
    assert.equal(img.src, original);
  });
});

describe('cleanup idempotency', () => {
  it('disconnects the MutationObserver on cleanup', () => {
    const original = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg';
    const img = makeImg({ href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', src: original });
    const { api, observers } = loadModule([img]);
    api.init();
    assert.equal(observers.length >= 1, true);
    api.cleanup();
    assert.equal(observers.every((o) => o.disconnectCalls >= 1), true);
  });

  it('second cleanup is a no-op (does not throw, does not clobber)', () => {
    const original = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg';
    const img = makeImg({ href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', src: original });
    const { api } = loadModule([img]);
    api.init();
    api.cleanup();
    assert.equal(img.src, original);
    assert.doesNotThrow(() => api.cleanup());
    assert.equal(img.src, original);
  });
});
