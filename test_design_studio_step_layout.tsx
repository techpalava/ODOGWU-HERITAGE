import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DESIGN_STUDIO_STEP_FOOTER_CLASS,
  DESIGN_STUDIO_STEP_LAYOUT_CLASS,
  DESIGN_STUDIO_STEP_MAIN_CLASS,
  DESIGN_STUDIO_STEP_SIDEBAR_CLASS,
  DesignStudioStepFooter,
  DesignStudioStepLayout,
  DesignStudioStepMain,
  DesignStudioStepSidebar,
} from "./src/components/DesignStudioStepLayout";

// One shared desktop placement: content + bottom actions in column 1, sidebar in column 2.
assert.match(DESIGN_STUDIO_STEP_LAYOUT_CLASS, /lg:grid-cols-\[minmax\(0,2\.2fr\)_minmax\(16rem,1fr\)\]/);
assert.match(DESIGN_STUDIO_STEP_LAYOUT_CLASS, /lg:grid-rows-\[auto_1fr\]/);
assert.match(DESIGN_STUDIO_STEP_MAIN_CLASS, /lg:col-start-1/);
assert.match(DESIGN_STUDIO_STEP_FOOTER_CLASS, /lg:col-start-1/);
assert.match(DESIGN_STUDIO_STEP_FOOTER_CLASS, /lg:row-start-2/);
assert.match(DESIGN_STUDIO_STEP_SIDEBAR_CLASS, /lg:col-start-2/);
assert.match(DESIGN_STUDIO_STEP_SIDEBAR_CLASS, /lg:row-span-2/);
// Mobile stays a plain stack: no non-lg grid/column classes.
for (const cls of [DESIGN_STUDIO_STEP_LAYOUT_CLASS, DESIGN_STUDIO_STEP_MAIN_CLASS, DESIGN_STUDIO_STEP_FOOTER_CLASS, DESIGN_STUDIO_STEP_SIDEBAR_CLASS]) {
  for (const token of cls.split(/\s+/)) {
    assert.ok(!/^(grid|grid-cols-|col-|row-)/.test(token), `${token} must be lg-scoped`);
  }
}

const markup = renderToStaticMarkup(
  createElement(
    DesignStudioStepLayout,
    null,
    createElement(DesignStudioStepMain, { className: "space-y-4" }, "content"),
    createElement(DesignStudioStepSidebar, null, "summary"),
    createElement(DesignStudioStepFooter, null, "actions"),
  ),
);
assert.match(markup, /data-studio-step-layout="true"/);
assert.match(markup, /data-studio-step-main="true"[^>]*>content</);
assert.match(markup, /data-studio-step-sidebar="true"[^>]*>summary</);
assert.match(markup, /data-studio-step-footer="true"[^>]*>actions</);
// Source order is content, sidebar, footer so mobile keeps the sidebar above the buttons.
assert.ok(markup.indexOf("content") < markup.indexOf("summary"));
assert.ok(markup.indexOf("summary") < markup.indexOf("actions"));

const read = (path: string) => readFileSync(path, "utf8");
const between = (source: string, open: string, close: string, from = 0) => {
  const start = source.indexOf(open, from);
  assert.ok(start >= 0, `missing ${open}`);
  const end = source.indexOf(close, start);
  assert.ok(end > start, `missing ${close}`);
  return source.slice(start, end);
};

// Steps 2, 4 and 5 embed the Order Summary: their bottom row is in the shared footer slot.
for (const path of [
  "src/components/DormantFutureFabricStep.tsx",
  "src/components/DormantFutureCustomDetailsStep.tsx",
]) {
  const source = read(path);
  assert.equal((source.match(/slot="footer"/g) || []).length, 1, `${path} has one bottom row`);
  const footerSlot = between(source, "<DesignStudioStepFooter>", "</DesignStudioStepFooter>");
  assert.ok(footerSlot.includes('slot="footer"'), `${path} bottom row is inside DesignStudioStepFooter`);
  const layout = between(source, "<DesignStudioStepLayout>", "</DesignStudioStepLayout>");
  assert.ok(layout.includes("<DesignStudioStepFooter>"), `${path} footer slot is inside the shared layout`);
  const main = between(source, "<DesignStudioStepMain", "</DesignStudioStepMain>");
  assert.ok(main.includes('slot="header"'), `${path} top row is in the main column`);
  assert.doesNotMatch(source, /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(\d+rem,\d+rem\)\]/, `${path} has no private two-column grid`);
}

// Step 1 keeps both rows inside its main column card.
{
  const source = read("src/components/GarmentTypeStep.tsx");
  assert.match(source, /className=\{DESIGN_STUDIO_STEP_LAYOUT_CLASS\}/);
  const mainStart = source.indexOf('data-studio-step-main="true"');
  const sidebarStart = source.indexOf('data-studio-step-sidebar="true"');
  assert.ok(mainStart > 0 && sidebarStart > mainStart);
  const main = source.slice(mainStart, sidebarStart);
  assert.ok(main.includes('slot="header"') && main.includes('slot="footer"'));
  assert.equal(source.includes("lg:grid-cols-12"), false);
}

// Steps 3 and 6-9: the shell section (which holds both rows) is the main column.
{
  const source = read("src/components/DesignStudioView.tsx");
  assert.match(source, /`mt-4 \$\{DESIGN_STUDIO_STEP_LAYOUT_CLASS\}`/);
  assert.match(source, /data-studio-step-main=\{showShellLiveOrderSummary \? "true" : undefined\}/);
  assert.match(source, /data-studio-step-sidebar="true" className=\{DESIGN_STUDIO_STEP_SIDEBAR_CLASS\}/);
  assert.equal(source.includes("lg:grid-cols-[minmax(0,2.2fr)_minmax(16rem,1fr)]"), false, "only the shared layout defines the columns");
}

// The one-row rule from #749-751 is unchanged.
{
  const source = read("src/components/DesignStudioBackButton.tsx");
  assert.match(source, /data-studio-step-actions-buttons="true"\s*className="flex w-full min-w-0 flex-row flex-nowrap/);
}

console.log("PASS: Design Studio step actions share one main-column placement");
