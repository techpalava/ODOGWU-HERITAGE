import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import {
  SITE_FEEDBACK_CREATE_KEYS,
  SITE_FEEDBACK_LIMITS,
  SITE_FEEDBACK_NATIONALITY_OPTIONS,
  SITE_FEEDBACK_OPTIONAL_KEYS,
  SITE_FEEDBACK_REQUIRED_KEYS,
  buildSiteFeedbackPhotoPath,
  siteFeedbackNationalityLabel,
  validateSiteFeedbackPhoto,
  SITE_FEEDBACK_RATE_LIMIT,
  buildSiteFeedbackCreatePayload,
  readSiteFeedbackSends,
  recordSiteFeedbackSend,
  siteFeedbackRateLimitWaitMs,
  validateSiteFeedback,
} from "./src/utils/siteFeedback";

// Run with scripts/tsxWithViteProductionFirebase.mjs: the button reads the
// app store, which imports Firebase. The test injects `submit`, so nothing is
// written to Firestore.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// --- validation -----------------------------------------------------------
assert.equal(validateSiteFeedback({ type: "spam", message: "hello there" }).ok, false);
const short = validateSiteFeedback({ type: "bug", message: "  hi  " });
assert.equal(short.ok, false);
assert.equal(!short.ok && (short as { field: string }).field, "message");
assert.equal(
  validateSiteFeedback({ type: "bug", message: "x".repeat(SITE_FEEDBACK_LIMITS.messageMax + 1) }).ok,
  false,
);
assert.equal(
  validateSiteFeedback({ type: "idea", message: "😀😀😀😀" }).ok,
  false,
  "emoji count as one character, like Firestore Rules",
);
const badEmail = validateSiteFeedback({ type: "idea", message: "Nice site", email: "nope" });
assert.equal(!badEmail.ok && (badEmail as { field: string }).field, "email");
const good = validateSiteFeedback({ type: "other", message: "  Lovely fabrics  ", email: " a@b.co " });
assert.deepEqual(good, { ok: true, value: { type: "other", message: "Lovely fabrics", email: "a@b.co" } });
const noEmail = validateSiteFeedback({ type: "bug", message: "Button broke", email: "  " });
assert.equal(noEmail.ok && noEmail.value.email, null);

// --- payload matches the rules allowlist ----------------------------------
assert.ok(good.ok);
const payload = buildSiteFeedbackCreatePayload(
  good.value,
  {
    page: "/" + "p".repeat(900),
    tab: "design",
    studioStep: "payment",
    userAgent: "UA".repeat(400),
    viewport: "412x915",
    uid: null,
  },
  "SERVER_TIME",
);
assert.deepEqual(Object.keys(payload).sort(), [...SITE_FEEDBACK_CREATE_KEYS].sort());
assert.equal(payload.page.length, SITE_FEEDBACK_LIMITS.pageMax);
assert.equal(payload.userAgent.length, SITE_FEEDBACK_LIMITS.userAgentMax);
assert.equal(payload.status, "new");
assert.equal(payload.schemaVersion, 2);
assert.equal(payload.nationality, null);
assert.equal(payload.photoPath, null);
assert.equal(payload.photoContentType, null);
assert.equal(payload.photoSizeBytes, null);

// --- nationality (optional, ISO code from the Step 8 country list) ----------
assert.ok(SITE_FEEDBACK_NATIONALITY_OPTIONS.length > 200, "full country list");
const ng = SITE_FEEDBACK_NATIONALITY_OPTIONS.find((o) => o.code === "NG");
assert.equal(ng?.label, "Nigeria");
assert.ok(SITE_FEEDBACK_NATIONALITY_OPTIONS.some((o) => o.code === "NL"));
assert.ok(!SITE_FEEDBACK_NATIONALITY_OPTIONS.some((o) => ["XX", "ZZ", "OT"].includes(o.code)));
const labels = SITE_FEEDBACK_NATIONALITY_OPTIONS.map((o) => o.label);
assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b, "en")), "alphabetical");
assert.equal(new Set(SITE_FEEDBACK_NATIONALITY_OPTIONS.map((o) => o.code)).size, SITE_FEEDBACK_NATIONALITY_OPTIONS.length);
assert.equal(siteFeedbackNationalityLabel("GH"), "Ghana");
assert.equal(siteFeedbackNationalityLabel(null), "");
const withNationality = validateSiteFeedback({ type: "idea", message: "Lovely site", nationality: "NG" });
assert.deepEqual(withNationality, { ok: true, value: { type: "idea", message: "Lovely site", email: null, nationality: "NG" } });
const badNationality = validateSiteFeedback({ type: "idea", message: "Lovely site", nationality: "Naija" });
assert.equal(!badNationality.ok && (badNationality as { field: string }).field, "nationality");
assert.ok(withNationality.ok);
assert.equal(
  buildSiteFeedbackCreatePayload(withNationality.value, { page: "/", tab: "home", studioStep: null, userAgent: "", viewport: "", uid: null }, "T").nationality,
  "NG",
);

// --- photo (optional, one JPEG/PNG/WebP up to 5 MB as picked) ---------------
assert.deepEqual(validateSiteFeedbackPhoto(null), { ok: true });
assert.deepEqual(validateSiteFeedbackPhoto({ type: "image/png", size: 1000 }), { ok: true });
assert.deepEqual(validateSiteFeedbackPhoto({ type: "image/webp", size: SITE_FEEDBACK_LIMITS.photoMaxBytes }), { ok: true });
assert.equal(validateSiteFeedbackPhoto({ type: "image/gif", size: 1000 }).ok, false);
assert.equal(validateSiteFeedbackPhoto({ type: "image/heic", size: 1000 }).ok, false);
assert.equal(validateSiteFeedbackPhoto({ type: "image/jpeg", size: 0 }).ok, false);
assert.equal(validateSiteFeedbackPhoto({ type: "image/jpeg", size: SITE_FEEDBACK_LIMITS.photoMaxBytes + 1 }).ok, false);
assert.equal(buildSiteFeedbackPhotoPath("anonUid", "doc123", "image/webp"), "site-feedback/anonUid/doc123/photo.webp");
assert.equal(buildSiteFeedbackPhotoPath("u", "d", "image/jpeg"), "site-feedback/u/d/photo.jpg");
const withPhoto = buildSiteFeedbackCreatePayload(good.value, { page: "/", tab: "home", studioStep: null, userAgent: "", viewport: "", uid: null }, "T", {
  path: "site-feedback/u/d/photo.png",
  contentType: "image/png",
  sizeBytes: 1234,
});
assert.equal(withPhoto.photoPath, "site-feedback/u/d/photo.png");
assert.equal(withPhoto.photoContentType, "image/png");
assert.equal(withPhoto.photoSizeBytes, 1234);
assert.deepEqual(Object.keys(withPhoto).sort(), [...SITE_FEEDBACK_CREATE_KEYS].sort());

const { fitSiteFeedbackPhoto } = await import("./src/utils/siteFeedbackPhoto");
assert.deepEqual(fitSiteFeedbackPhoto(800, 600), { width: 800, height: 600 });
assert.deepEqual(fitSiteFeedbackPhoto(4000, 3000), { width: 1600, height: 1200 });
assert.deepEqual(fitSiteFeedbackPhoto(1000, 3200), { width: 500, height: 1600 });

const rules = readFileSync("firestore.rules", "utf8");
const listOf = (raw: string) =>
  raw.split(",").map((key) => key.trim().replace(/"/g, "")).filter(Boolean).sort();
const hasAll = rules.match(
  /function hasValidSiteFeedbackCreate\(data, feedbackId\) \{[\s\S]*?data\.keys\(\)\.hasAll\(\[([^\]]*)\]\)/,
);
assert.ok(hasAll, "site feedback create rule must use hasAll");
assert.deepEqual(listOf(hasAll[1]), [...SITE_FEEDBACK_REQUIRED_KEYS].sort(), "v1 form stays valid");
assert.deepEqual(
  [...SITE_FEEDBACK_CREATE_KEYS].sort(),
  [...SITE_FEEDBACK_REQUIRED_KEYS, ...SITE_FEEDBACK_OPTIONAL_KEYS].sort(),
);
const hasOnly = rules.match(
  /function hasValidSiteFeedbackCreate\(data, feedbackId\) \{[\s\S]*?data\.keys\(\)\.hasOnly\(\[([^\]]*)\]\)/,
);
assert.ok(hasOnly, "site feedback create rule must use hasOnly");
assert.deepEqual(
  hasOnly[1].split(",").map((key) => key.trim().replace(/"/g, "")).filter(Boolean).sort(),
  [...SITE_FEEDBACK_CREATE_KEYS].sort(),
);
const feedbackMatch = rules.match(/match \/site_feedback\/\{feedbackId\} \{([\s\S]*?)\n    \}/);
assert.ok(feedbackMatch, "site_feedback rules block exists");
assert.match(feedbackMatch[1], /allow create: if hasValidSiteFeedbackCreate\(request\.resource\.data, feedbackId\);/);
assert.match(rules, /data\.schemaVersion in \[1, 2\]/);
assert.match(rules, /data\.nationality\.matches\("\^\[A-Z\]\{2\}\$"\)/);
for (const ext of ["jpg", "png", "webp"]) {
  assert.ok(
    rules.includes(`data.photoPath == "site-feedback/" + request.auth.uid + "/" + feedbackId + "/photo.${ext}"`),
    `photo path rule for .${ext}`,
  );
}
assert.match(rules, /data\.photoSizeBytes <= 5 \* 1024 \* 1024/);

// Storage: own folder only, create-only, image types, 5 MB; admins read.
const storageRules = readFileSync("storage.rules", "utf8");
const photoBlock = storageRules.match(/match \/site-feedback\/\{uid\}\/\{feedbackId\}\/\{fileName\} \{([\s\S]*?)\n    \}/);
assert.ok(photoBlock, "storage rule for site-feedback photos");
assert.match(photoBlock[1], /allow read, delete: if isAdmin\(\);/);
assert.match(photoBlock[1], /allow create: if isOwner\(uid\)/);
assert.match(photoBlock[1], /fileName\.matches\('photo\[\.\]\(jpg\|png\|webp\)'\)/);
assert.match(photoBlock[1], /isAllowedCustomerDesignImage\(\)/);
assert.match(photoBlock[1], /isWithinCustomerDesignSizeLimit\(\)/);
assert.doesNotMatch(photoBlock[1], /update/);
assert.ok(
  storageRules.indexOf("match /site-feedback/") < storageRules.lastIndexOf("match /{allPaths=**}"),
  "site-feedback rule sits before the deny-all catch-all",
);
assert.match(feedbackMatch[1], /allow read, update, delete: if isAdmin\(\);/);
assert.ok(
  rules.indexOf("match /site_feedback/") < rules.indexOf("match /{document=**}"),
  "site_feedback rule sits before the deny-all catch-all",
);

// --- client rate limit -----------------------------------------------------
const t0 = 1_000_000_000;
assert.equal(siteFeedbackRateLimitWaitMs([], t0), 0);
assert.equal(siteFeedbackRateLimitWaitMs([t0 - 5_000], t0), SITE_FEEDBACK_RATE_LIMIT.minGapMs - 5_000);
const three = [t0 - 120_000, t0 - 60_000, t0 - 30_000];
assert.equal(siteFeedbackRateLimitWaitMs(three, t0), SITE_FEEDBACK_RATE_LIMIT.windowMs - 120_000);
assert.equal(siteFeedbackRateLimitWaitMs([t0 - SITE_FEEDBACK_RATE_LIMIT.windowMs - 1], t0), 0);
const memory = new Map<string, string>();
const storage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
};
recordSiteFeedbackSend(storage, t0);
assert.deepEqual(readSiteFeedbackSends(storage), [t0]);
memory.set(SITE_FEEDBACK_RATE_LIMIT.storageKey, "not json");
assert.deepEqual(readSiteFeedbackSends(storage), []);

// --- component ---------------------------------------------------------------
const { SiteFeedbackButton } = await import("./src/components/SiteFeedbackButton");
const { useAppStore } = await import("./src/store/useAppStore");

const text = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === "string" ? child : text(child))).join("");

const originalState = useAppStore.getState();
const submitted: Array<{ value: unknown; context: any; photo: File | null }> = [];
let failNext = false;
let tree: ReturnType<typeof create> | undefined;
try {
  useAppStore.setState({
    activeTab: "about",
    currentUser: { name: "Ada", email: "ada@example.com", phone: "", ownerUid: "uid-ada" } as any,
    isCartOpen: false,
    isMobileMenuOpen: false,
  });
  await act(async () => {
    tree = create(
      <SiteFeedbackButton
        submit={async (value, context, photo) => {
          if (failNext) {
            failNext = false;
            throw new Error("offline");
          }
          submitted.push({ value, context, photo });
          return "doc-1";
        }}
      />,
    );
  });
  const tab = tree!.root.findByProps({ "data-site-feedback-tab": "true" });
  assert.equal(tab.props["aria-label"], "Send feedback");
  assert.equal(tab.props.type, "button");
  assert.match(tab.props.className, /\bfixed\b/);
  assert.match(tab.props.className, /\bleft-0\b/);
  assert.match(tab.props.className, /top-1\/2/);
  assert.match(tab.props.className, /safe-area-inset-left/);
  assert.match(tab.props.className, /z-30/, "stays below header (z-40) and dialogs (z-50)");
  assert.equal(tree!.root.findAll((n) => n.props?.role === "dialog").length, 0);

  await act(async () => tab.props.onClick());
  const dialog = tree!.root.find((n) => n.props?.role === "dialog" && n.type === "div");
  assert.equal(dialog.props["aria-modal"], "true");
  const email = dialog.find((n) => n.type === "input" && n.props.type === "email");
  assert.equal(email.props.value, "ada@example.com", "email prefilled for signed-in users");

  const form = dialog.findByType("form");
  const textarea = dialog.findByType("textarea");
  assert.equal(textarea.props.maxLength, SITE_FEEDBACK_LIMITS.messageMax);

  // Too short: stays open with an inline error, nothing sent.
  await act(async () => textarea.props.onChange({ target: { value: "hey" } }));
  await act(async () => form.props.onSubmit({ preventDefault() {} }));
  assert.equal(submitted.length, 0);
  assert.match(text(dialog), /at least 5 characters/);

  // Network failure shows a clear error.
  failNext = true;
  await act(async () => textarea.props.onChange({ target: { value: "The pickup step froze." } }));
  await act(async () => form.props.onSubmit({ preventDefault() {} }));
  assert.equal(submitted.length, 0);
  assert.match(text(tree!.root.findByProps({ "data-site-feedback-error": "true" })), /could not be sent/);

  // Choose Bug and send.
  const bugRadio = dialog.find((n) => n.type === "input" && n.props.type === "radio" && n.props.value === "bug");
  await act(async () => bugRadio.props.onChange());
  await act(async () => form.props.onSubmit({ preventDefault() {} }));
  assert.equal(submitted.length, 1);
  assert.deepEqual(submitted[0].value, { type: "bug", message: "The pickup step froze.", email: "ada@example.com" });
  assert.equal(submitted[0].context.tab, "about");
  assert.equal(submitted[0].context.studioStep, null);
  assert.equal(submitted[0].photo, null, "no photo unless one is picked");
  assert.ok(tree!.root.findByProps({ "data-site-feedback-thanks": "true" }));

  // Close button returns to the tab.
  const close = tree!.root.findByProps({ "aria-label": "Close feedback" });
  await act(async () => close.props.onClick());
  assert.equal(tree!.root.findAll((n) => n.props?.role === "dialog").length, 0);

  // Honeypot: pretend success, store nothing.
  await act(async () => tree!.root.findByProps({ "data-site-feedback-tab": "true" }).props.onClick());
  const d2 = tree!.root.find((n) => n.props?.role === "dialog" && n.type === "div");
  await act(async () => d2.findByType("textarea").props.onChange({ target: { value: "Buy cheap stuff now" } }));
  const honeypot = d2.find((n) => n.type === "input" && n.props.tabIndex === -1);
  await act(async () => honeypot.props.onChange({ target: { value: "http://spam" } }));
  await act(async () => d2.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.equal(submitted.length, 1, "honeypot submissions are dropped");
  assert.ok(tree!.root.findByProps({ "data-site-feedback-thanks": "true" }));

  // Nationality dropdown and photo field (both optional).
  await act(async () => tree!.root.findByProps({ "aria-label": "Close feedback" }).props.onClick());
  await act(async () => tree!.root.findByProps({ "data-site-feedback-tab": "true" }).props.onClick());
  const d3 = tree!.root.find((n) => n.props?.role === "dialog" && n.type === "div");
  const select = d3.findByProps({ "data-site-feedback-nationality": "true" });
  assert.equal(select.type, "select");
  assert.equal(select.props.value, "", "defaults to Prefer not to say");
  const options = select.findAllByType("option");
  assert.equal(options[0].props.value, "");
  assert.equal(text(options[0]), "Prefer not to say");
  assert.equal(options.length, SITE_FEEDBACK_NATIONALITY_OPTIONS.length + 1);
  assert.match(text(d3), /Nationality/);
  assert.match(text(d3), /Add a photo or screenshot/);
  const fileInput = d3.find((n) => n.type === "input" && n.props.type === "file");
  assert.equal(fileInput.props.accept, "image/jpeg,image/png,image/webp");

  // A GIF is refused inline and nothing is kept.
  await act(async () => fileInput.props.onChange({ target: { files: [{ name: "a.gif", type: "image/gif", size: 10 }] } }));
  assert.match(text(tree!.root.findByProps({ "data-site-feedback-photo-error": "true" })), /JPEG, PNG or WebP/);
  // Over 5 MB is refused too.
  await act(async () => tree!.root.find((n) => n.type === "input" && n.props.type === "file").props.onChange({ target: { files: [{ name: "big.jpg", type: "image/jpeg", size: SITE_FEEDBACK_LIMITS.photoMaxBytes + 1 }] } }));
  assert.match(text(tree!.root.findByProps({ "data-site-feedback-photo-error": "true" })), /over 5 MB/);
  // A valid PNG is kept and sent with the nationality.
  const png = new File([new Uint8Array(2048)], "shot.png", { type: "image/png" });
  await act(async () => tree!.root.find((n) => n.type === "input" && n.props.type === "file").props.onChange({ target: { files: [png] } }));
  assert.equal(tree!.root.findAll((n) => n.props?.["data-site-feedback-photo-error"] === "true").length, 0);
  await act(async () => tree!.root.findByProps({ "data-site-feedback-nationality": "true" }).props.onChange({ target: { value: "NG" } }));
  const d4 = tree!.root.find((n) => n.props?.role === "dialog" && n.type === "div");
  await act(async () => d4.findByType("textarea").props.onChange({ target: { value: "Photo of the broken step." } }));
  // Clear the honeypot left filled by the bot check above.
  await act(async () => d4.find((n) => n.type === "input" && n.props.tabIndex === -1).props.onChange({ target: { value: "" } }));
  await act(async () => d4.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.equal(submitted.length, 2);
  assert.deepEqual(submitted[1].value, { type: "idea", message: "Photo of the broken step.", email: "ada@example.com", nationality: "NG" });
  assert.equal(submitted[1].photo, png);
  assert.ok(tree!.root.findByProps({ "data-site-feedback-thanks": "true" }));

  // Hidden while the cart drawer is open.
  await act(async () => tree!.root.findByProps({ "aria-label": "Close feedback" }).props.onClick());
  await act(async () => useAppStore.setState({ isCartOpen: true }));
  const hiddenTab = tree!.root.findByProps({ "data-site-feedback-tab": "true" });
  assert.match(hiddenTab.props.className, /opacity-0/);
  assert.equal(hiddenTab.props.tabIndex, -1);
} finally {
  act(() => tree?.unmount());
  useAppStore.setState(originalState, true);
}

// --- desktop header button (Option B) ---------------------------------------
// From xl (where Header shows its full nav) the gold header button opens the
// same panel and the left tab is hidden. Below xl the left tab is unchanged.
const { Header } = await import("./src/components/Header");
let headerTree: ReturnType<typeof create> | undefined;
try {
  useAppStore.setState({
    activeTab: "home",
    currentUser: null,
    cartItems: [],
    isCartOpen: false,
    isMobileMenuOpen: false,
  });
  await act(async () => {
    headerTree = create(
      <>
        <Header />
        <SiteFeedbackButton submit={async () => "doc-2"} />
      </>,
    );
  });
  const root = headerTree!.root;
  const headerButton = root.findByProps({ "data-site-feedback-header-button": "true" });
  assert.equal(headerButton.type, "button");
  assert.equal(headerButton.props.type, "button");
  assert.equal(headerButton.props["aria-label"], "Send feedback");
  assert.equal(headerButton.props["aria-haspopup"], "dialog");
  assert.match(text(headerButton), /^Feedback$/);
  assert.match(headerButton.props.className, /\bbg-heritage-gold\b/);

  // It sits in the desktop (xl) nav group, right after Login.
  const desktopGroup = headerButton.parent!;
  assert.match(desktopGroup.props.className, /\bhidden\b/);
  assert.match(desktopGroup.props.className, /\bxl:flex\b/);
  const siblings = desktopGroup.children.filter(
    (child): child is ReactTestInstance => typeof child !== "string",
  );
  const loginIndex = siblings.findIndex((child) => child.props.title === "Login");
  assert.ok(loginIndex >= 0, "Login is in the desktop group");
  assert.equal(siblings[loginIndex + 1], headerButton, "Feedback is right of Login");

  // The left tab is still rendered with its mobile placement, hidden only from xl.
  const leftTab = root.findByProps({ "data-site-feedback-tab": "true" });
  const tabClasses = String(leftTab.props.className).split(/\s+/);
  assert.ok(tabClasses.includes("fixed") && tabClasses.includes("left-0"), "left tab keeps its spot");
  assert.ok(tabClasses.includes("xl:hidden"), "left tab hidden on desktop");
  assert.ok(!tabClasses.includes("hidden"), "left tab still shows below xl");
  assert.equal(leftTab.props.tabIndex, 0);

  // Clicking the header button opens the one shared panel.
  assert.equal(root.findAll((n) => n.props?.role === "dialog").length, 0);
  await act(async () => headerButton.props.onClick());
  const dialogs = root.findAll((n) => n.props?.role === "dialog" && n.type === "div");
  assert.equal(dialogs.length, 1, "a single feedback panel");
  assert.match(text(dialogs[0]), /Send feedback/);
  assert.ok(dialogs[0].findByType("form"));
  assert.equal(root.findByProps({ "data-site-feedback-tab": "true" }).props["aria-expanded"], true);

  // Closing works as before.
  await act(async () => root.findByProps({ "aria-label": "Close feedback" }).props.onClick());
  assert.equal(root.findAll((n) => n.props?.role === "dialog").length, 0);
} finally {
  act(() => headerTree?.unmount());
  useAppStore.setState(originalState, true);
}


// --- order-flow prompt: Maybe later, never blocks ---
{
  let orderTree: ReturnType<typeof create> | undefined;
  const original = useAppStore.getState();
  try {
    useAppStore.setState({
      activeTab: "design",
      currentUser: null,
      isCartOpen: false,
      isMobileMenuOpen: false,
      siteFeedbackOpenRequest: 0,
      siteFeedbackOpenSource: "manual",
      siteFeedbackOpenTrigger: null,
      siteFeedbackOpenDraftKey: null,
    });
    await act(async () => {
      orderTree = create(<SiteFeedbackButton submit={async () => "doc-order"} />);
    });
    assert.equal(orderTree!.root.findAll((n) => n.props?.["data-site-feedback-maybe-later"] === "true").length, 0);
    await act(async () => {
      useAppStore.getState().requestSiteFeedbackOpen({
        source: "order_flow",
        trigger: "after_step_5",
        draftKey: "guest:test",
      });
    });
    const dialog = orderTree!.root.find((n) => n.props?.role === "dialog" && n.type === "div");
    const maybeLater = dialog.findByProps({ "data-site-feedback-maybe-later": "true" });
    assert.equal(text(maybeLater).trim(), "Maybe later");
    await act(async () => maybeLater.props.onClick());
    assert.equal(orderTree!.root.findAll((n) => n.props?.role === "dialog").length, 0);
  } finally {
    act(() => orderTree?.unmount());
    useAppStore.setState(original, true);
  }
}

console.log("PASS: site feedback");

process.exit(0);
