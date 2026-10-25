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
  // Real pixel containment is checked separately in headless browser QA (320-1920px).
  assert.ok(classes(row).has("min-h-20"), "Retain the existing minimum header height");
  assert.ok(classes(row).has("sm:h-20"), "Preserve tablet/desktop header height");
  assert.ok(![...classes(row)].some(token => /^h-|^max-h-/.test(token)),
    "Mobile row must grow with wrapped branding, without a fixed height cap");
  assert.ok(classes(row).has("items-center"), "Keep logo and actions vertically aligned");
  // Phones: 3-column grid so the community line spans under title + controls (max 2 lines at 320px).
  assert.ok(classes(row).has("grid") && classes(row).has("sm:flex"),
    "Phone grid layout, single flex row from sm");
  assert.ok(classes(brand).has("sm:min-w-0"), "Brand text can wrap in the available width");
  assert.ok(classes(logo).has("shrink-0") && classes(logo).has("row-span-2"),
    "Logo keeps its size and centres against both brand lines");

  // Screenshot bug (2026-10-25): at 1024-1180px the desktop nav squeezed the brand and
  // the title rendered as "THE ODOG…". One title, one community line, no ellipsis.
  const title = header.findByProps({ "data-header-brand-title": true });
  const community = header.findByProps({ "data-header-community-line": true });
  assert.equal(text(title), "THE ODOGWU HERITAGE", "Full brand title is present");
  assert.equal(text(community), originalState.businessSettings.applicationSettings.tagline ||
    "NIGERIAN TRADITIONAL CLOTHING COMMUNITY (NTCC)", "Full community line is present");
  assert.equal(header.findAll(node => node.type === "span" && text(node) === "THE ODOGWU HERITAGE").length, 1,
    "Exactly one brand title element (no duplicated hidden copies)");
  assert.ok(classes(community).has("col-span-2"), "Community line uses the full phone width");
  for (const line of [title, community]) {
    assert.ok(classes(line).has("break-words"));
    assert.ok(![...classes(line)].some(token =>
      /^(?:[a-z0-9-]+:)?(hidden|sr-only|truncate|text-ellipsis|whitespace-nowrap|line-clamp-.*|overflow-hidden)$/.test(token)),
    "Do not conceal or ellipsize branding to solve overflow");
  }

  // The full desktop nav only appears from xl, where brand + nav fit side by side.
  const desktopNavGroup = header.findByType("nav").parent!;
  assert.ok(classes(desktopNavGroup).has("hidden") && classes(desktopNavGroup).has("xl:flex"),
    "Desktop nav starts at xl, so 1024-1279px uses the compact controls");
  assert.ok(classes(desktopNavGroup).has("shrink-0"), "Nav never squeezes into the title");

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
    ["Home", "Design Studio", "About", "Gallery", "Reviews"], "Preserve guest desktop navigation");
} finally {
  act(() => { tree?.unmount(); });
  useAppStore.setState(originalState);
}

console.log("PASS: responsive header growth, complete branding, and navigation semantics");
