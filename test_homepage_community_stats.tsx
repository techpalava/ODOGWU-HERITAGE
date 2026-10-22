import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import HomepageCommunityShowcase from "./src/components/HomepageCommunityShowcase";
import {
  COMMUNITY_CONTINENT_ORDER,
  COMMUNITY_CONTINENTS,
  COMMUNITY_GROUPS,
  COMMUNITY_HEADLINE_STATS,
  COMMUNITY_NATIONALITIES,
  COMMUNITY_NATIONALITIES_BY_PEOPLE,
} from "./src/data/communityStats";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.assign(globalThis, { IntersectionObserver: IntersectionObserverMock });

const collectText = (node: ReactTestInstance | string): string => {
  if (typeof node === "string") return node;
  return node.children.map((child) => collectText(child as ReactTestInstance | string)).join("");
};

const sumPeople = (items: readonly { people: number }[]) =>
  items.reduce((total, item) => total + item.people, 0);
const sumOutfits = (items: readonly { outfits: number }[]) =>
  items.reduce((total, item) => total + item.outfits, 0);

assert.equal(COMMUNITY_HEADLINE_STATS.participants, 76);
assert.equal(COMMUNITY_HEADLINE_STATS.outfits, 101);
assert.equal(COMMUNITY_HEADLINE_STATS.nationalities, 24);
assert.equal(COMMUNITY_HEADLINE_STATS.continents, 5);
assert.equal(COMMUNITY_HEADLINE_STATS.groups, 5);

assert.equal(sumPeople(COMMUNITY_GROUPS), COMMUNITY_HEADLINE_STATS.participants);
assert.equal(sumOutfits(COMMUNITY_GROUPS), COMMUNITY_HEADLINE_STATS.outfits);
assert.equal(sumPeople(COMMUNITY_NATIONALITIES), COMMUNITY_HEADLINE_STATS.participants);
assert.equal(sumOutfits(COMMUNITY_NATIONALITIES), COMMUNITY_HEADLINE_STATS.outfits);
assert.equal(COMMUNITY_NATIONALITIES.length, COMMUNITY_HEADLINE_STATS.nationalities);
assert.equal(
  new Set(COMMUNITY_NATIONALITIES.map((item) => item.country)).size,
  24,
);
assert.equal(
  new Set(COMMUNITY_NATIONALITIES.map((item) => item.continent)).size,
  COMMUNITY_HEADLINE_STATS.continents,
);
assert.equal(COMMUNITY_GROUPS.length, COMMUNITY_HEADLINE_STATS.groups);
assert.deepEqual(
  [...COMMUNITY_CONTINENT_ORDER],
  ["Europe", "Asia", "Africa", "North America", "South America"],
);

const expectedContinents = [
  { continent: "Europe", countries: 13, people: 52, outfits: 68 },
  { continent: "Asia", countries: 3, people: 10, outfits: 16 },
  { continent: "Africa", countries: 3, people: 6, outfits: 9 },
  { continent: "North America", countries: 3, people: 5, outfits: 5 },
  { continent: "South America", countries: 2, people: 3, outfits: 3 },
];
assert.deepEqual(COMMUNITY_CONTINENTS, expectedContinents);

const sortedNationalities = [...COMMUNITY_NATIONALITIES].sort((left, right) => {
  if (right.people !== left.people) return right.people - left.people;
  return left.country.localeCompare(right.country);
});
assert.deepEqual(
  COMMUNITY_NATIONALITIES_BY_PEOPLE.map((item) => item.country),
  sortedNationalities.map((item) => item.country),
);

let primaryClicks = 0;
let galleryClicks = 0;
let tree: ReturnType<typeof create> | undefined;

try {
  act(() => {
    tree = create(
      createElement(HomepageCommunityShowcase, {
        primaryActionLabel: "Join the Musketeers",
        onPrimaryAction: () => {
          primaryClicks += 1;
        },
        onViewGallery: () => {
          galleryClicks += 1;
        },
      }),
    );
  });

  const root = tree!.root;
  const markup = collectText(root);
  assert.match(markup, /Join Our Growing Community Celebrating Nigerian Culture/);
  assert.doesNotMatch(markup, /Growing Every Batch/);
  assert.doesNotMatch(markup, /ASML/i);

  const tiles = root.findAll(
    (node) =>
      typeof node.props?.["data-stat-value"] !== "undefined" &&
      typeof node.props?.["aria-label"] === "string",
  );
  assert.equal(tiles.length, 5, "showcase renders five stat tiles");
  const expectedTiles = [
    { label: "Participants", value: 76 },
    { label: "Traditional Outfits", value: 101 },
    { label: "Nationalities", value: 24 },
    { label: "Continents", value: 5 },
    { label: "Groups", value: 5 },
  ];
  for (const expected of expectedTiles) {
    const tile = tiles.find((node) =>
      String(node.props["aria-label"]).includes(expected.label),
    );
    assert.ok(tile, `tile for ${expected.label} exists`);
    assert.equal(Number(tile!.props["data-stat-value"]), expected.value);
    assert.match(collectText(tile!), new RegExp(expected.label));
  }

  const tileClasses = tiles.map((tile) => String(tile.props.className));
  tileClasses.forEach((className, index) => {
    assert.match(className, /sm:col-span-2 lg:col-span-1/, `tile ${index} spans two tablet columns`);
    assert.equal(
      /sm:col-start-2 lg:col-start-auto/.test(className),
      index === 3,
      `only tile 3 starts the centred tablet second row`,
    );
  });
  assert.match(tileClasses[4], /(^| )col-span-2( |$)/, "last tile is full width on phones");

  const groupNames = ["Pioneers", "Avengers", "Transformers", "Executives", "Gladiators"];
  const groupCards = root.findAll(
    (node) => typeof node.props?.["data-community-group"] === "string",
  );
  assert.equal(groupCards.length, 5);
  assert.deepEqual(
    groupCards.map((card) => card.props["data-community-group"]),
    groupNames,
  );
  groupCards.forEach((card, index) => {
    const className = String(card.props.className);
    assert.match(className, /sm:col-span-2 lg:col-span-1/, `group card ${index} spans two tablet columns`);
    assert.equal(
      /sm:col-start-2 lg:col-start-auto/.test(className),
      index === 3,
      `only group card 3 starts the centred tablet second row`,
    );
  });

  const chips = root.findAll(
    (node) => typeof node.props?.["data-community-nationality"] === "string",
  );
  assert.equal(chips.length, 24);
  assert.deepEqual(
    chips.map((chip) => chip.props["data-community-nationality"]),
    COMMUNITY_NATIONALITIES_BY_PEOPLE.map((item) => item.country),
  );

  const buttons = root.findAllByType("button");
  assert.equal(buttons.length, 2);
  assert.match(collectText(buttons[0]), /Join the Musketeers/);
  assert.match(collectText(buttons[1]), /View Community Gallery/);
  act(() => {
    buttons[0].props.onClick();
    buttons[1].props.onClick();
  });
  assert.equal(primaryClicks, 1);
  assert.equal(galleryClicks, 1);
} finally {
  act(() => {
    tree?.unmount();
  });
}

const homeView = readFileSync("src/components/HomeView.tsx", "utf8");
assert.match(
  homeView,
  /Wear your culture with \{COMMUNITY_HEADLINE_STATS\.participants\} members from \{COMMUNITY_HEADLINE_STATS\.nationalities\} nationalities\./,
);
assert.doesNotMatch(homeView, /Join Hundreds/);
assert.doesNotMatch(homeView, /CapacityService/);
assert.doesNotMatch(homeView, /Growing Every Batch/);
assert.doesNotMatch(homeView, /ASML/i);

const showcaseSource = readFileSync(
  "src/components/HomepageCommunityShowcase.tsx",
  "utf8",
);
assert.doesNotMatch(showcaseSource, /ASML/i);
assert.doesNotMatch(showcaseSource, /useAppStore|firebase/i);
// Tablet layout: five items sit on a six-column grid (each spanning two) from
// sm to lg, so they read 3 + 2 with the second row centred, then one row of
// five from lg. The old sm:grid-cols-3 / sm:grid-cols-2 grids wrapped 3+2 and
// 2+2+1 unevenly at 768px.
assert.match(showcaseSource, /FIVE_ITEM_TABLET_GRID_CLASS = "sm:grid-cols-6 lg:grid-cols-5"/);
assert.match(showcaseSource, /FIVE_ITEM_TABLET_SPAN_CLASS = "sm:col-span-2 lg:col-span-1"/);
assert.match(showcaseSource, /"sm:col-start-2 lg:col-start-auto"/);
assert.doesNotMatch(showcaseSource, /sm:grid-cols-3|sm:grid-cols-2/);
// The primary action is wired once, through onPrimaryAction.
assert.doesNotMatch(showcaseSource, /onClick\?:|onClick = onPrimaryAction/);
assert.match(showcaseSource, /onClick=\{onPrimaryAction\}/);
const showcaseUsage = homeView.match(/<HomepageCommunityShowcase[\s\S]*?\/>/);
assert.ok(showcaseUsage, "HomeView renders HomepageCommunityShowcase");
assert.match(showcaseUsage![0], /onPrimaryAction=\{handleHeroPrimaryAction\}/);
assert.doesNotMatch(showcaseUsage![0], /\bonClick=/);

const statsSource = readFileSync("src/data/communityStats.ts", "utf8");
assert.doesNotMatch(statsSource, /ASML/i);

console.log("PASS: homepage community stats are verified and the showcase renders them");
