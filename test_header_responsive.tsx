import assert from "node:assert/strict";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { Header } from "./src/components/Header";
import { useAppStore } from "./src/store/useAppStore";

// Run with scripts/tsxWithViteProductionFirebase.mjs for the Header's
// existing Firebase and image imports. No auth or persistence calls are made.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const text = (node: ReactTestInstance): string => node.children.map(child =>
  typeof child === "string" ? child : text(child)).join("");
const classes = (node: ReactTestInstance) => new Set<string>(
  String(node.props.className ?? "").split(/\s+/),
);
const originalState = useAppStore.getState();
let menuOpened = false;
let cartOpened = false;
let tree: ReturnType<typeof create> | undefined;

try {
  useAppStore.setState({
    currentUser: null,
    cartItems: [],
    setIsMobileMenuOpen: open => { menuOpened = open; },
    setIsCartOpen: open => { cartOpened = open; },
  });
  act(() => { tree = create(<Header />); });
  const header = tree!.root.findByType("header");
  const logo = header.findByProps({ alt: "The Odogwu Heritage Logo" });
  assert.equal(logo.type, "img");
  const brand = logo.parent!;
  const row = brand.parent!;

  // Layout contract, not a full class-string snapshot: wrapped mobile branding
  // determines row height; the established minimum and sm+ height are retained.
  // Real pixel containment is checked separately in browser QA at all four widths.
  assert.ok(classes(row).has("min-h-20"), "Retain the existing minimum header height");
  assert.ok(classes(row).has("sm:h-20"), "Preserve tablet/desktop header height");
  assert.ok(![...classes(row)].some(token => /^h-|^max-h-/.test(token)),
    "Mobile row must grow with wrapped branding, without a fixed height cap");
  assert.ok(classes(row).has("items-center"), "Keep logo and actions vertically aligned");
  assert.ok(classes(brand).has("min-w-0"), "Brand text can wrap in the available width");
  assert.ok(classes(logo).has("shrink-0"), "Logo size must not collapse");

  const mobileBrand = brand.findAllByType("div").find(node => classes(node).has("sm:hidden"))!;
  const brandLines = mobileBrand.findAllByType("span");
  assert.deepEqual(brandLines.map(text), [
    "THE ODOGWU HERITAGE",
    originalState.businessSettings.applicationSettings.tagline ||
      "NIGERIAN TRADITIONAL CLOTHING COMMUNITY (NTCC)",
  ], "Keep both complete branding lines");
  for (const line of brandLines) {
    assert.ok(classes(line).has("break-words"));
    assert.ok(![...classes(line)].some(token =>
      /^(hidden|sr-only|truncate|line-clamp-.*|overflow-hidden)$/.test(token)),
    "Do not conceal branding to solve overflow");
  }

  const menu = header.findByProps({ "aria-label": "Open main navigation menu" });
  const cart = header.findByProps({ "aria-label": "Cart" });
  const login = header.findByProps({ "aria-label": "Login" });
  for (const control of [menu, cart, login]) {
    assert.equal(control.type, "button");
    assert.equal(control.props.type, "button");
    assert.ok(classes(control).has("w-11") && classes(control).has("h-11"),
      "Preserve mobile touch target sizes");
    assert.notEqual(control.props.tabIndex, -1);
    assert.ok(!control.props.disabled);
  }
  act(() => { menu.props.onClick(); cart.props.onClick(); });
  assert.ok(menuOpened && cartOpened, "Existing mobile navigation actions remain connected");
  assert.deepEqual(header.findByType("nav").findAllByType("button").map(text),
    ["Home", "Design Studio", "About", "Gallery"], "Preserve guest desktop navigation");
} finally {
  act(() => { tree?.unmount(); });
  useAppStore.setState(originalState);
}

console.log("PASS: responsive header growth, complete branding, and navigation semantics");
