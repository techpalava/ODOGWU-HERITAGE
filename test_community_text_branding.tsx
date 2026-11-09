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
  assert.equal(headerTaglines.length, 1, "Header renders one responsive community line for all widths");
  for (const line of headerTaglines) {
    const tokens = classes(line);
    assert.ok(tokens.has("font-extrabold"), `Header community text is extrabold: ${line.props.className}`);
    assert.ok(pxSize(line) >= 10, `Header community text is at least 10px: ${line.props.className}`);
    assert.ok(tokens.has("break-words"), "Header community text wraps instead of overflowing");
    assert.ok(!tokens.has("truncate"), "Header community text is not cut off with an ellipsis");
    assert.ok(![...tokens].some(token => /^(?:[a-z]+:)?(?:font-(?:medium|semibold|normal)|text-\[[78]px\])$/.test(token)),
      "Old small/light header classes are gone");
  }

  const footer = () => tree!.root.findByType("footer");
  const footerTaglineNodes = () => footer().findAll(node =>
    node.type === "p" && classes(node).has("italic") && classes(node).has("font-serif"));
  // Stored tagline currently repeats the community name. The footer keeps the
  // gold name and omits the italic copy. The same markup is used at every width.
  assert.equal(footerTaglineNodes().length, 0,
    "Footer hides the italic tagline when it repeats the community name");
  const nameCopies = footer().findAll(node =>
    (node.type === "span" || node.type === "p") && text(node) === communityName);
  assert.equal(nameCopies.length, 1, "Footer prints the community name once in the brand column");

  const footerName = footer().find(node => node.type === "span" && text(node) === communityName);
  assert.ok(classes(footerName).has("font-extrabold"), "Footer community name is extrabold");
  assert.ok(classes(footerName).has("text-base"), "Footer community name is text-base");
  assert.ok(classes(footerName).has("text-heritage-gold"), "Footer community name stays gold");
  assert.ok(classes(footerName).has("uppercase"), "Footer community name stays uppercase");
  assert.ok(classes(footerName).has("font-display"), "Footer community name uses the display face");
  assert.ok(!classes(footerName).has("text-sm"));
  assert.ok(classes(footerName).has("break-words"));

  const brandColumn = footerName.parent?.parent?.parent;
  assert.ok(brandColumn && classes(brandColumn).has("space-y-4"),
    "Brand column keeps its stacked spacing");
  const brandElements = brandColumn!.children.filter(child => typeof child !== "string");
  assert.equal(brandElements.length, 2,
    "Removing the duplicate leaves the logo row and the description, with no empty slot");
  assert.equal(brandElements[1].type, "p");
  assert.ok(text(brandElements[1] as ReactTestInstance).includes("Connecting cultures"),
    "Description follows the name directly");

  const withDistinctTagline = {
    ...originalState.businessSettings,
    applicationSettings: {
      ...originalState.businessSettings.applicationSettings,
      tagline: "Handcrafted for the diaspora",
    },
  };
  act(() => {
    useAppStore.setState({ businessSettings: withDistinctTagline });
  });
  const distinctTagline = footerTaglineNodes();
  assert.equal(distinctTagline.length, 1, "A tagline that differs from the name is still shown");
  assert.equal(text(distinctTagline[0]), "Handcrafted for the diaspora");
  assert.ok(classes(distinctTagline[0]).has("font-bold"), "Footer community tagline is bold");
  assert.ok(classes(distinctTagline[0]).has("text-base"), "Footer community tagline is text-base or larger");
  assert.ok(!classes(distinctTagline[0]).has("text-sm") && !classes(distinctTagline[0]).has("font-medium"));
  assert.ok(classes(distinctTagline[0]).has("break-words"));
  assert.equal(footer().findAll(node =>
    node.type === "span" && text(node) === communityName).length, 1,
    "The gold community name stays when a real tagline is shown");

  act(() => {
    useAppStore.setState({
      businessSettings: {
        ...withDistinctTagline,
        applicationSettings: {
          ...withDistinctTagline.applicationSettings,
          tagline: `  ${communityName.toLocaleLowerCase()}  `,
        },
      },
    });
  });
  assert.equal(footerTaglineNodes().length, 0,
    "Case and surrounding spaces still count as the same name");

  // Footer bottom bar copyright line (Fredrick's follow-up, 2026-10-19).
  const copyright = footer().find(node => node.type === "div" &&
    node.children.some(child => typeof child === "string" && child.startsWith("©")) &&
    text(node).includes(communityName));
  const copyrightTokens = classes(copyright);
  assert.ok(copyrightTokens.has("font-extrabold"), `Footer copyright is extrabold: ${copyright.props.className}`);
  assert.ok(copyrightTokens.has("text-xs") && copyrightTokens.has("sm:text-sm"),
    "Footer copyright is text-xs on phones and text-sm from sm up (was 10px / text-xs)");
  assert.ok(copyrightTokens.has("break-words"), "Footer copyright wraps instead of overflowing");
  assert.ok(![...copyrightTokens].some(token => /^(?:truncate|whitespace-nowrap|overflow-hidden)$/.test(token)));
} finally {
  act(() => { tree?.unmount(); });
  useAppStore.setState(originalState);
}

console.log("PASS: header, footer and copyright community text is bigger, bolder and wraps safely");
