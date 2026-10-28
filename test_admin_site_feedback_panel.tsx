import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import {
  SiteFeedbackAdminList,
  toSiteFeedbackAdminEntry,
} from "./src/components/AdminSiteFeedbackPanel";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const text = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === "string" ? child : text(child))).join("");

// v2 document with nationality and photo; v1 document without them.
const v2 = toSiteFeedbackAdminEntry("doc-v2", {
  schemaVersion: 2,
  status: "new",
  type: "bug",
  message: "The pay button froze.\nSee photo.",
  email: "ada@example.com",
  nationality: "NG",
  photoPath: "site-feedback/anon/doc-v2/photo.webp",
  photoContentType: "image/webp",
  photoSizeBytes: 1234,
  page: "/?tab=design",
  tab: "design",
  studioStep: "payment",
  viewport: "1280x800",
  userAgent: "Chrome",
  uid: null,
  createdAt: { toMillis: () => Date.UTC(2026, 9, 28, 18, 0) },
});
const v1 = toSiteFeedbackAdminEntry("doc-v1", {
  schemaVersion: 1,
  status: "new",
  type: "idea",
  message: "Love the fabrics",
  email: null,
  page: "/",
  tab: "home",
  studioStep: null,
  viewport: "390x844",
  userAgent: "Safari",
  uid: "u1",
  createdAt: null,
});
assert.equal(v2.nationality, "NG");
assert.equal(v2.photoPath, "site-feedback/anon/doc-v2/photo.webp");
assert.equal(v1.nationality, null);
assert.equal(v1.photoPath, null);
assert.equal(v1.createdAtMs, null);

const requested: string[] = [];
let tree: ReturnType<typeof create> | undefined;
await act(async () => {
  tree = create(
    <SiteFeedbackAdminList
      entries={[v2, v1]}
      resolvePhotoUrl={async (path) => {
        requested.push(path);
        return `https://example.test/${path}`;
      }}
    />,
  );
});
const root = tree!.root;
assert.match(text(root), /Site Feedback/);
const rows = root.findAll((n) => typeof n.props?.["data-site-feedback-admin-entry"] === "string" && n.type === "li");
assert.equal(rows.length, 2);
assert.match(text(rows[0]), /Bug/);
assert.match(text(rows[0]), /The pay button froze/);
assert.match(text(rows[0]), /ada@example.com/);
assert.equal(text(rows[0].findByProps({ "data-site-feedback-admin-nationality": "NG" })), "Nigeria");
assert.match(text(rows[0]), /design · payment/);
assert.deepEqual(requested, ["site-feedback/anon/doc-v2/photo.webp"], "only rows with a photo load one");
const photoLink = rows[0].findByProps({ "data-site-feedback-admin-photo": "true" });
assert.equal(photoLink.props.href, "https://example.test/site-feedback/anon/doc-v2/photo.webp");
assert.equal(photoLink.findByType("img").props.src, "https://example.test/site-feedback/anon/doc-v2/photo.webp");
// v1 row: no nationality chip, no photo.
assert.equal(rows[1].findAll((n) => n.props?.["data-site-feedback-admin-nationality"] !== undefined && n.type === "span").length, 0);
assert.equal(rows[1].findAll((n) => n.props?.["data-site-feedback-admin-photo"] === "true").length, 0);
assert.match(text(rows[1]), /Just now|Love the fabrics/);
act(() => tree!.unmount());

// Empty state.
await act(async () => {
  tree = create(<SiteFeedbackAdminList entries={[]} resolvePhotoUrl={async () => ""} />);
});
assert.match(text(tree!.root), /No feedback yet/);
act(() => tree!.unmount());

// Admin Portal menu wiring: a "Site Feedback" item for report viewers renders the panel.
const dbView = readFileSync("src/components/DatabaseView.tsx", "utf8");
assert.match(dbView, /\{ id: "feedback", label: "Site Feedback", icon: MessageSquare, condition: AuthorizationEngine\.canViewReports\(currentUser\) \}/);
assert.match(dbView, /activeTab === "feedback" &&\s+AuthorizationEngine\.canViewReports\(currentUser\) && \(\s+<AdminSiteFeedbackPanel \/>/);

console.log("PASS: admin site feedback panel");
process.exit(0);
