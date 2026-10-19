import assert from "node:assert/strict";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { Header } from "./src/components/Header";
import Footer from "./src/components/Footer";
import { useAppStore } from "./src/store/useAppStore";

// Fredrick's request (2026-10-15): the "Nigerian Traditional Clothing Community"
// writing at the top and bottom of the site must be bigger and bolder.
// Run with scripts/tsxWithViteProductionFirebase.mjs (Header/Footer import Firebase-backed stores).
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const text = (node: ReactTestInstance): string => node.children.map(child =>
  typeof child === "string" ? child : text(child)).join("");
const classes = (node: ReactTestInstance) => new Set<string>(
  String(node.props.className ?? "").split(/\s+/).filter(Boolean),
);
const pxSize = (node: ReactTestInstance) => {
  const sizes = [...classes(node)]
    .map(token => /^(?:[a-z]+:)?text-\[(\d+(?:\.\d+)?)px\]$/.exec(token)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number);
  return sizes.length ? Math.min(...sizes) : 0;
};
const originalState = useAppStore.getState();
const tagline = originalState.businessSettings.applicationSettings.tagline ||
  "NIGERIAN TRADITIONAL CLOTHING COMMUNITY (NTCC)";
const communityName = originalState.businessSettings.applicationSettings.communityName ||
  "The Odogwu Heritage";
let tree: ReturnType<typeof create> | undefined;

try {
  useAppStore.setState({ currentUser: null, cartItems: [] });
  act(() => { tree = create(<><Header /><Footer /></>); });

  const header = tree!.root.findByType("header");
  const headerTaglines = header.findAll(node =>
    typeof node.type === "string" && node.type === "span" && text(node) === tagline);
  assert.equal(headerTaglines.length, 2, "Header keeps the mobile and sm+ community lines");
  for (const line of headerTaglines) {
    const tokens = classes(line);
    assert.ok(tokens.has("font-extrabold"), `Header community text is extrabold: ${line.props.className}`);
    assert.ok(pxSize(line) >= 10, `Header community text is at least 10px: ${line.props.className}`);
    assert.ok(tokens.has("break-words"), "Header community text wraps instead of overflowing");
    assert.ok(!tokens.has("truncate"), "Header community text is not cut off with an ellipsis");
    assert.ok(![...tokens].some(token => /^(?:[a-z]+:)?(?:font-(?:medium|semibold|normal)|text-\[[78]px\])$/.test(token)),
      "Old small/light header classes are gone");
  }

  const footer = tree!.root.findByType("footer");
  const footerTagline = footer.find(node => node.type === "p" && text(node) === tagline);
  assert.ok(classes(footerTagline).has("font-bold"), "Footer community tagline is bold");
  assert.ok(classes(footerTagline).has("text-base"), "Footer community tagline is text-base or larger");
  assert.ok(!classes(footerTagline).has("text-sm") && !classes(footerTagline).has("font-medium"));
  assert.ok(classes(footerTagline).has("break-words"));

  const footerName = footer.find(node => node.type === "span" && text(node) === communityName);
  assert.ok(classes(footerName).has("font-extrabold"), "Footer community name is extrabold");
  assert.ok(classes(footerName).has("text-base"), "Footer community name is text-base");
  assert.ok(!classes(footerName).has("text-sm"));
  assert.ok(classes(footerName).has("break-words"));
} finally {
  act(() => { tree?.unmount(); });
  useAppStore.setState(originalState);
}

console.log("PASS: header and footer community text is bigger, bolder and wraps safely");
