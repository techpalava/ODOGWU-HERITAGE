import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement, type ComponentProps } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import PrivateBatchSetupView, {
  resolvePrivateBatchSubmitLimits,
  type PrivateBatchSetupValues,
} from "./src/components/PrivateBatchSetupView";
import type { BusinessSettings } from "./src/types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const settings = (
  country: string,
  minParticipantsRequired: number,
  maxGarmentsPerBatch: number,
): BusinessSettings =>
  ({
    applicationSettings: { defaultCountry: country },
    batchSettings: { minParticipantsRequired, maxGarmentsPerBatch },
  }) as BusinessSettings;

const preloaded = settings("Netherlands", 10, 300);
const live = settings("Ghana", 15, 80);

const buttonLabel = (children: unknown): string => {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) {
    return children.filter((child) => typeof child === "string").join("");
  }
  return "";
};

const mount = async (
  props: ComponentProps<typeof PrivateBatchSetupView>,
): Promise<ReactTestRenderer> => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(PrivateBatchSetupView, props));
  });
  return renderer;
};

const field = (renderer: ReactTestRenderer, testId: string) =>
  renderer.root.findByProps({ "data-testid": testId });

const change = async (renderer: ReactTestRenderer, testId: string, value: string) => {
  await act(async () => {
    field(renderer, testId).props.onChange({ target: { value } });
  });
};

const submit = async (renderer: ReactTestRenderer) => {
  await act(async () => {
    renderer.root.findByType("form").props.onSubmit({ preventDefault: () => undefined });
  });
};

const fillRequired = async (renderer: ReactTestRenderer) => {
  await change(renderer, "private-batch-name", "Family Wedding 2026");
  await change(renderer, "private-batch-occasion", "Wedding");
  await change(renderer, "private-batch-city", "Accra");
  await change(renderer, "private-batch-delivery-target", "2027-06");
  await change(renderer, "private-batch-closing-date", "2027-04-01");
};

let submissions: PrivateBatchSetupValues[] = [];
const onSubmit = async (values: PrivateBatchSetupValues) => {
  submissions.push(values);
  return { status: "created" as const };
};

submissions = [];
const blocked = await mount({
  businessSettings: preloaded,
  settingsLoaded: false,
  onBack: () => undefined,
  onSubmit,
});
assert.equal(field(blocked, "private-batch-country").props.value, "Netherlands");
assert.equal(field(blocked, "private-batch-participants").props.value, 10);
assert.equal(field(blocked, "create-private-batch-submit").props.disabled, true);
assert.equal(
  buttonLabel(field(blocked, "create-private-batch-submit").props.children),
  "Loading settings...",
);
await submit(blocked);
assert.equal(submissions.length, 0, "Submit before settings settle must not store pre-load defaults.");

await act(async () => {
  blocked.update(
    createElement(PrivateBatchSetupView, {
      businessSettings: live,
      settingsLoaded: false,
      onBack: () => undefined,
      onSubmit,
    }),
  );
});
assert.equal(field(blocked, "private-batch-country").props.value, "Ghana");
assert.equal(field(blocked, "private-batch-participants").props.value, 15);
assert.equal(field(blocked, "private-batch-participants").props.min, 15);
assert.equal(field(blocked, "private-batch-participants").props.max, 80);
await submit(blocked);
assert.equal(submissions.length, 0, "A settings snapshot must not by itself allow a submit.");

await act(async () => {
  blocked.update(
    createElement(PrivateBatchSetupView, {
      businessSettings: live,
      settingsLoaded: true,
      onBack: () => undefined,
      onSubmit,
    }),
  );
});
assert.equal(field(blocked, "create-private-batch-submit").props.disabled, false);
assert.equal(
  buttonLabel(field(blocked, "create-private-batch-submit").props.children),
  "Create Private Batch",
);
await fillRequired(blocked);
await submit(blocked);
assert.equal(submissions.length, 1);
assert.equal(submissions[0]?.country, "Ghana");
assert.equal(submissions[0]?.expectedParticipants, 15);
await act(async () => {
  blocked.unmount();
});

submissions = [];
const edited = await mount({
  businessSettings: preloaded,
  settingsLoaded: false,
  onBack: () => undefined,
  onSubmit,
});
await change(edited, "private-batch-country", "France");
await act(async () => {
  edited.update(
    createElement(PrivateBatchSetupView, {
      businessSettings: settings("Belgium", 20, 90),
      settingsLoaded: false,
      onBack: () => undefined,
      onSubmit,
    }),
  );
});
assert.equal(field(edited, "private-batch-country").props.value, "France");
assert.equal(field(edited, "private-batch-participants").props.value, 20);
await change(edited, "private-batch-participants", "25");
await act(async () => {
  edited.update(
    createElement(PrivateBatchSetupView, {
      businessSettings: settings("Kenya", 30, 90),
      settingsLoaded: true,
      onBack: () => undefined,
      onSubmit,
    }),
  );
});
assert.equal(field(edited, "private-batch-country").props.value, "France");
assert.equal(field(edited, "private-batch-participants").props.value, 25);
await change(edited, "private-batch-participants", "32");
await fillRequired(edited);
await submit(edited);
assert.equal(submissions.length, 1);
assert.equal(submissions[0]?.country, "France");
assert.equal(submissions[0]?.expectedParticipants, 32);
await act(async () => {
  edited.unmount();
});

assert.equal(resolvePrivateBatchSubmitLimits(preloaded, false), null);
assert.deepEqual(resolvePrivateBatchSubmitLimits(live, true), {
  minParticipantsRequired: 15,
  maxParticipantsAllowed: 80,
});

const appSource = readFileSync(new URL("./src/App.tsx", import.meta.url), "utf8");
assert.match(appSource, /resolvePrivateBatchSubmitLimits\(/);
assert.match(appSource, /settingsLoaded=\{hasLoadedBusinessSettings\}/);

console.log(
  "PASS: Private Batch setup follows live settings and will not submit pre-load defaults",
);
