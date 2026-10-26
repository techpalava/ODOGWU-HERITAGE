import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import LoginView from "./src/components/LoginView";
import { FirebaseCustomerAuth } from "./src/services/firebaseCustomerAuth";
import {
  buildOpenInChromeUrl,
  detectInAppBrowser,
} from "./src/utils/inAppBrowser";

// Run with scripts/tsxWithViteProductionFirebase.mjs: LoginView imports the
// Firebase client. Nothing here signs in; the PIN call is stubbed.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// --- In-app browser detection ---------------------------------------------
const UA = {
  instagramIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0",
  whatsappAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-A145F Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36 WhatsApp/2.24",
  tiktok:
    "Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 musical_ly_2023 BytedanceWebview/d8a21c6",
  facebook:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]",
  genericWebView:
    "Mozilla/5.0 (Linux; Android 12; Pixel 6; wv) AppleWebKit/537.36 Chrome/119 Mobile Safari/537.36",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
  safariIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
};
assert.deepEqual(detectInAppBrowser(UA.instagramIos), { appName: "Instagram", isAndroid: false, isIos: true });
assert.equal(detectInAppBrowser(UA.whatsappAndroid)?.appName, "WhatsApp");
assert.equal(detectInAppBrowser(UA.whatsappAndroid)?.isAndroid, true);
assert.equal(detectInAppBrowser(UA.tiktok)?.appName, "TikTok");
assert.equal(detectInAppBrowser(UA.facebook)?.appName, "Facebook");
assert.equal(detectInAppBrowser(UA.genericWebView)?.appName, "this app");
assert.equal(detectInAppBrowser(UA.chromeAndroid), null);
assert.equal(detectInAppBrowser(UA.safariIos), null);
assert.equal(detectInAppBrowser(""), null);
assert.equal(
  buildOpenInChromeUrl("https://odogwu-heritage.vercel.app/?a=1#x"),
  "intent://odogwu-heritage.vercel.app/?a=1#x#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fodogwu-heritage.vercel.app%2F%3Fa%3D1%23x;end",
);
assert.equal(buildOpenInChromeUrl("http://localhost:3000/"), null);
assert.equal(buildOpenInChromeUrl("not a url"), null);

// --- Source contracts --------------------------------------------------------
const loginSource = readFileSync("src/components/LoginView.tsx", "utf8");
const googleSource = readFileSync("src/components/GoogleSignInButton.tsx", "utf8");
assert.equal(loginSource.includes("3.3-3.53"), false, "broken Google logo path removed");
assert.equal(loginSource.includes("<svg"), false, "Google mark lives in the shared button");
assert.equal(/uppercase/.test(googleSource), false, "Google button text stays sentence case");
assert.match(googleSource, /border-\[#747775\]/);

// --- Rendered behaviour -------------------------------------------------------
const textOf = (node: ReactTestInstance | string): string =>
  typeof node === "string" ? node : node.children.map(textOf).join("");

async function render(props: Partial<Parameters<typeof LoginView>[0]> = {}) {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <LoginView
        onLogin={() => undefined}
        customers={[]}
        setCustomers={() => undefined}
        {...props}
      />,
    );
  });
  return renderer;
}

for (const checkoutMode of [false, true]) {
  const renderer = await render({ checkoutMode, onCancel: () => undefined });
  const root = renderer.root;
  const buttons = root.findAllByType("button");
  assert.equal(textOf(buttons[0]), "Continue with Google", `Google first (checkout=${checkoutMode})`);
  assert.equal(
    buttons.filter((button) => textOf(button).includes("Google")).length,
    1,
    "exactly one Google button",
  );

  const tabs = root.findAll((node) => node.props.role === "tab");
  assert.deepEqual(tabs.map((tab) => textOf(tab).trim()), ["Log in", "Create account"]);
  assert.equal(tabs[0].props["aria-selected"], true);
  assert.equal(root.findAll((node) => node.props.role === "tablist").length, 1);

  // Every visible input has a label pointing at it, plus autocomplete.
  const checkFields = (expected: Record<string, { autoComplete: string; inputMode?: string }>) => {
    const inputs = root.findAllByType("input");
    const labels = root.findAllByType("label");
    assert.equal(inputs.length, Object.keys(expected).length);
    for (const input of inputs) {
      const label = labels.find((candidate) => candidate.props.htmlFor === input.props.id);
      assert.ok(label, `input ${input.props.name} has a label`);
      const want = expected[textOf(label!).trim()];
      assert.ok(want, `unexpected label ${textOf(label!)}`);
      assert.equal(input.props.autoComplete, want.autoComplete);
      assert.equal(input.props.inputMode, want.inputMode);
    }
  };
  checkFields({
    "Email address": { autoComplete: "username" },
    "4- or 6-digit security PIN": { autoComplete: "current-password", inputMode: "numeric" },
  });

  // Arrow key moves to the Create account tab.
  await act(async () => {
    tabs[0].props.onKeyDown({ key: "ArrowRight", preventDefault() {} });
  });
  assert.equal(root.findAll((node) => node.props.role === "tab")[1].props["aria-selected"], true);
  checkFields({
    "Full name": { autoComplete: "name" },
    "Email address": { autoComplete: "email" },
    "Choose a 6-digit security PIN": { autoComplete: "new-password", inputMode: "numeric" },
  });

  // Validation errors are announced.
  const registerForm = root.findByType("form");
  await act(async () => {
    registerForm.props.onSubmit({ preventDefault() {} });
  });
  const alert = root.find((node) => node.props.role === "alert");
  assert.equal(textOf(alert).trim(), "Please enter your full name.");

  const backToCart = root
    .findAllByType("button")
    .filter((button) => textOf(button) === "Back to Cart");
  assert.equal(backToCart.length, checkoutMode ? 1 : 0, "Back to Cart only in checkout mode");
  renderer.unmount();
}

// Loading state: buttons disable and the label changes while signing in.
{
  let release!: () => void;
  const original = FirebaseCustomerAuth.signInWithPin;
  FirebaseCustomerAuth.signInWithPin = () =>
    new Promise((_, reject) => {
      release = () => reject(new Error("Incorrect identifier or security PIN."));
    });
  try {
    const renderer = await render();
    const root = renderer.root;
    const [email, pin] = root.findAllByType("input");
    await act(async () => {
      email.props.onChange({ target: { value: "ada@example.test" } });
      pin.props.onChange({ target: { value: "482619" } });
    });
    let submitted!: Promise<void>;
    await act(async () => {
      submitted = root.findByType("form").props.onSubmit({ preventDefault() {} });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const submit = root.find((node) => node.type === "button" && node.props.type === "submit");
    assert.equal(submit.props.disabled, true);
    assert.match(textOf(submit), /Signing in…/);
    const google = root.findAllByType("button")[0];
    assert.equal(google.props.disabled, true, "Google is disabled while a sign-in runs");

    await act(async () => {
      release();
      await submitted;
    });
    const after = root.find((node) => node.type === "button" && node.props.type === "submit");
    assert.equal(after.props.disabled, false);
    assert.equal(
      textOf(root.find((node) => node.props.role === "alert")).trim(),
      "Incorrect identifier or security PIN.",
    );
    renderer.unmount();
  } finally {
    FirebaseCustomerAuth.signInWithPin = original;
  }
}

console.log("PASS: login view is Google-first, labelled, autocomplete-ready and announces errors");
