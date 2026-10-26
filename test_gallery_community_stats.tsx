import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import GalleryView from "./src/components/GalleryView";
import {
  COMMUNITY_GROUPS,
  COMMUNITY_HEADLINE_STATS,
} from "./src/data/communityStats";
import type { Batch, CommunityPhoto, Showpiece } from "./src/types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const collectText = (node: ReactTestInstance | string): string => {
  if (typeof node === "string") return node;
  return node.children
    .map((child) => collectText(child as ReactTestInstance | string))
    .join("");
};

const source = readFileSync("src/components/GalleryView.tsx", "utf8");
assert.match(source, /from ["']\.\.\/data\/communityStats["']/);
assert.match(source, /data-gallery-group=\{group\.name\}/);
assert.match(source, /data-gallery-group-filter=\{group\.name\}/);
assert.match(source, /data-member-count=\{group\.people\}/);
assert.match(source, /data-outfit-count=\{group\.outfits\}/);
assert.match(source, /data-nationality-count=\{group\.nationalities\}/);
assert.match(source, /\{group\.people\} Members/);
assert.match(source, /\{group\.outfits\} Outfits/);
assert.match(source, /\{group\.nationalities\} Nationalities/);
assert.doesNotMatch(source, /legacyName\s*=/);
assert.doesNotMatch(source, /Members \(TBD\)|Outfits \(TBD\)|15 Members|10 Gentlemen|13 New, 2 Returning|Coming Soon|\bTBD\b|ASML|Gentlemen|\bLady\b/i);

const batch = (number: number, name: string): Batch => ({
  id: `batch-${number}`,
  batchNumber: number,
  name,
  startDate: "2025-01-01",
  endDate: "2025-02-01",
  duration: "Jan 2025",
  targetGarments: 1,
  currentGarments: 99,
  currentOrders: 99,
  currentCustomers: 99,
  status: "COMPLETED",
  visibility: "PUBLIC",
});

const photo = (
  id: string,
  cohortName: string,
  caption: string,
): CommunityPhoto => ({
  id,
  url: "https://example.test/photo.jpg",
  caption,
  cohortName,
  deliveryYear: 2026,
  featured: false,
  displayOrder: 1,
  status: "active",
});

const showpiece: Showpiece = {
  id: "showpiece-1",
  title: "Pioneer Showpiece",
  category: "male",
  styleId: "style-1",
  fabricCode: "FAB-1",
  styleName: "Senator",
  fabricName: "Ankara",
  colorHex: "#123456",
  description: "A gallery showpiece",
  tag: "Featured",
};

const staleBatches = [
  batch(1, "Founders"),
  batch(2, "Transformers"),
  batch(3, "Avatars"),
  batch(4, "Board"),
  batch(5, "Transformers"),
  batch(6, "Avatars"),
];

const photos = [
  photo("p1", "Group 1 - Pioneers", "pioneer photo"),
  photo("p2", "Group 2 - Transformers", "legacy avengers photo"),
  photo("p3", "Group 3 - Avatars", "legacy transformers photo"),
  photo("p4", "Group 4 - Executives", "executives photo"),
  photo("p5", "Group 5 - Transformers", "legacy gladiators photo"),
  photo("p6", "Group 6 - Avatars", "later batch photo"),
];

const finishPresence = (root: ReactTestInstance) => {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const callbacks = root.findAll(
      (node) =>
        node.props?.isPresent === false &&
        typeof node.props?.onExitComplete === "function",
    );
    if (callbacks.length === 0) return;
    act(() => {
      for (const node of callbacks) node.props.onExitComplete();
    });
  }
};

let tree: ReturnType<typeof create> | undefined;

try {
  act(() => {
    tree = create(
      createElement(GalleryView, {
        onSelectStyle: () => {},
        onNavigateToTab: () => {},
        showpieces: [showpiece],
        communityPhotos: photos,
        fabrics: [],
        styles: [],
        batches: staleBatches,
      }),
    );
  });

  const root = tree!.root;
  const filterButtons = root.findAll(
    (node) => typeof node.props?.["data-gallery-group-filter"] === "string",
  );
  assert.deepEqual(
    filterButtons.map((node) => node.props["data-gallery-group-filter"]),
    COMMUNITY_GROUPS.map((group) => group.name),
  );

  const initialMarkup = collectText(root);
  assert.match(initialMarkup, /Pioneer Showpiece/);
  assert.doesNotMatch(initialMarkup, /99 Members|TBD|Coming Soon|ASML|Gentlemen|\bLady\b/i);

  for (const group of COMMUNITY_GROUPS) {
    const button = filterButtons.find(
      (node) => node.props["data-gallery-group-filter"] === group.name,
    );
    assert.ok(button, `filter for ${group.name}`);
    act(() => {
      button!.props.onClick();
    });
    finishPresence(root);

    const panels = root.findAll(
      (node) => node.props?.["data-gallery-group"] === group.name,
    );
    assert.equal(panels.length, 1, `stats panel for ${group.name}`);
    const panel = panels[0];
    assert.equal(Number(panel.props["data-member-count"]), group.people);
    assert.equal(Number(panel.props["data-outfit-count"]), group.outfits);
    assert.equal(Number(panel.props["data-nationality-count"]), group.nationalities);
    const panelText = collectText(panel);
    assert.match(panelText, new RegExp(`Group ${group.number} - ${group.name}`));
    assert.match(panelText, new RegExp(`${group.people} Members`));
    assert.match(panelText, new RegExp(`${group.outfits} Outfits`));
    assert.match(panelText, new RegExp(`${group.nationalities} Nationalities`));
    assert.doesNotMatch(panelText, /TBD|Coming Soon|ASML|Gentlemen|\bLady\b|99/i);
    if (group.number > 2) {
      assert.doesNotMatch(panelText, /Delivered/);
    }
  }

  assert.equal(
    COMMUNITY_GROUPS.reduce((total, group) => total + group.people, 0),
    COMMUNITY_HEADLINE_STATS.participants,
  );

  const communityButton = root.findAll(
    (node) => node.type === "button" && collectText(node) === "Community Gallery",
  );
  assert.equal(communityButton.length, 1);
  act(() => {
    communityButton[0].props.onClick();
  });
  finishPresence(root);

  const sections = root.findAll(
    (node) => typeof node.props?.["data-gallery-section-title"] === "string",
  );
  assert.deepEqual(
    sections.map((section) => section.props["data-gallery-section-title"]),
    [
      "Group 1 - Pioneers",
      "Group 2 - Avengers",
      "Group 3 - Transformers",
      "Group 4 - Executives",
      "Group 5 - Gladiators",
      "Group 6 - Avatars",
    ],
  );

  for (const group of COMMUNITY_GROUPS) {
    const section = sections.find(
      (node) => node.props["data-gallery-cohort"] === group.name,
    );
    assert.ok(section, `community section for ${group.name}`);
    assert.equal(Number(section!.props["data-member-count"]), group.people);
    assert.equal(Number(section!.props["data-outfit-count"]), group.outfits);
    assert.equal(
      Number(section!.props["data-nationality-count"]),
      group.nationalities,
    );
    assert.equal(
      section!.props["data-gallery-section-title"],
      `Group ${group.number} - ${group.name}`,
    );
  }

  const avengers = sections.find(
    (node) => node.props["data-gallery-cohort"] === "Avengers",
  );
  assert.match(collectText(avengers!), /legacy avengers photo/);
  assert.doesNotMatch(collectText(avengers!), /Group 2 - Transformers/);

  const transformers = sections.find(
    (node) => node.props["data-gallery-cohort"] === "Transformers",
  );
  assert.match(collectText(transformers!), /legacy transformers photo/);
  assert.doesNotMatch(collectText(transformers!), /Group 3 - Avatars/);

  const gladiators = sections.find(
    (node) => node.props["data-gallery-cohort"] === "Gladiators",
  );
  assert.match(collectText(gladiators!), /legacy gladiators photo/);
  assert.doesNotMatch(collectText(gladiators!), /Group 5 - Transformers/);

  const laterBatch = sections.find(
    (node) => node.props["data-gallery-section-title"] === "Group 6 - Avatars",
  );
  assert.ok(laterBatch);
  assert.equal(laterBatch!.props["data-gallery-cohort"], undefined);
  assert.equal(laterBatch!.props["data-member-count"], undefined);
  assert.match(collectText(laterBatch!), /later batch photo/);

  const communityMarkup = collectText(root);
  assert.doesNotMatch(
    communityMarkup,
    /TBD|Coming Soon|ASML|Gentlemen|\bLady\b|99 Members|15 Members/,
  );

  const allButton = root.findAll(
    (node) => node.type === "button" && collectText(node) === "All Showpieces",
  );
  assert.equal(allButton.length, 1);
  act(() => {
    allButton[0].props.onClick();
  });
  finishPresence(root);
  assert.match(collectText(root), /Pioneer Showpiece/);
  const pioneersButton = filterButtons.find(
    (node) => node.props["data-gallery-group-filter"] === "Pioneers",
  );
  act(() => {
    pioneersButton!.props.onClick();
  });
  finishPresence(root);
  assert.match(collectText(root), /Pioneer Showpiece/);
  assert.match(collectText(root), /11 Members/);
  const avengersButton = filterButtons.find(
    (node) => node.props["data-gallery-group-filter"] === "Avengers",
  );
  act(() => {
    avengersButton!.props.onClick();
  });
  finishPresence(root);
  assert.doesNotMatch(collectText(root), /Pioneer Showpiece/);
  assert.match(collectText(root), /13 Members/);
} finally {
  act(() => {
    tree?.unmount();
  });
}

console.log("PASS: gallery group names and counts follow communityStats");
