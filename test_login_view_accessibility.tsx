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

const findButton = (root: ReactTestInstance, text: string | RegExp) =>
  root
    .findAllByType("button")
    .find((button) =>
      typeof text === "string" ? textOf(button).trim() === text : text.test(textOf(button)),
    );

// Every visible input has a label pointing at it, plus autocomplete.
const checkFields = (
  root: ReactTestInstance,
  expected: Record<string, { autoComplete: string; inputMode?: string }>,
) => {
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

  // Default login is a one-time email code.
  checkFields(root, { "Email address": { autoComplete: "email" } });
  assert.ok(findButton(root, "Email me a code"));

  // Existing customers can still use their PIN, with a prompt to switch.
  await act(async () => {
    findButton(root, "Sign in with your PIN instead")!.props.onClick();
  });
  checkFields(root, {
    "Email address": { autoComplete: "username" },
    "4- or 6-digit security PIN": { autoComplete: "current-password", inputMode: "numeric" },
  });
  assert.equal(root.findAll((node) => node.props["data-testid"] === "pin-switch-prompt").length, 1);

  // "Forgot PIN?" is a real button into the email-code flow, keeping the email.
  const [pinEmail] = root.findAllByType("input");
  await act(async () => {
    pinEmail.props.onChange({ target: { value: "ada@example.test" } });
  });
  const forgot = findButton(root, "Forgot PIN?");
  assert.equal(forgot?.type, "button");
  await act(async () => {
    forgot!.props.onClick();
  });
  checkFields(root, { "Email address": { autoComplete: "email" } });
  assert.equal(root.findAllByType("input")[0].props.value, "ada@example.test");
  assert.match(
    textOf(root.find((node) => node.props.role === "status")),
    /one-time code/,
  );

  // Arrow key moves to the Create account tab (passwordless sign-up).
  await act(async () => {
    root.findAll((node) => node.props.role === "tab")[0].props.onKeyDown({
      key: "ArrowRight",
      preventDefault() {},
    });
  });
  assert.equal(root.findAll((node) => node.props.role === "tab")[1].props["aria-selected"], true);
  checkFields(root, {
    "Full name": { autoComplete: "name" },
    "Email address": { autoComplete: "email" },
  });
  assert.equal(
    JSON.stringify(renderer.toJSON()).includes("123456"),
    false,
    "no weak example code or PIN in hints",
  );

  // Validation errors are announced.
  await act(async () => {
    root.findByType("form").props.onSubmit({ preventDefault() {} });
  });
  const alert = root.find((node) => node.props.role === "alert");
  assert.equal(textOf(alert).trim(), "Please enter your full name.");

  const backToCart = root
    .findAllByType("button")
    .filter((button) => textOf(button) === "Back to Cart");
  assert.equal(backToCart.length, checkoutMode ? 1 : 0, "Back to Cart only in checkout mode");
  renderer.unmount();
}

// Email-code flow: send, then verify with a one-time-code field.
{
  const original = {
    request: FirebaseCustomerAuth.requestEmailCode,
    verify: FirebaseCustomerAuth.signInWithEmailCode,
  };
  const requests: Array<[string, string | undefined]> = [];
  const verifications: Array<[string, string]> = [];
  FirebaseCustomerAuth.requestEmailCode = async (email, name) => {
    requests.push([email, name]);
    return { expiresInSeconds: 600, resendAfterSeconds: 60 };
  };
  FirebaseCustomerAuth.signInWithEmailCode = async (email, code) => {
    verifications.push([email, code]);
    throw Object.assign(new Error("That code is incorrect or has expired."), { code: "INVALID_CODE" });
  };
  try {
    const renderer = await render();
    const root = renderer.root;
    await act(async () => {
      root.findAll((node) => node.props.role === "tab")[1].props.onClick();
    });
    const [name, email] = root.findAllByType("input");
    await act(async () => {
      name.props.onChange({ target: { value: "Ada Lovelace" } });
      email.props.onChange({ target: { value: "ada@example.test" } });
    });
    await act(async () => {
      await root.findByType("form").props.onSubmit({ preventDefault() {} });
    });
    assert.deepEqual(requests, [["ada@example.test", "Ada Lovelace"]]);
    checkFields(root, { "6-digit code": { autoComplete: "one-time-code", inputMode: "numeric" } });
    assert.match(textOf(root.findByType("form")), /ada@example\.test/);
    const resend = findButton(root, /Resend code/)!;
    assert.equal(resend.props.disabled, true, "resend waits for the cooldown");
    assert.match(textOf(resend), /Resend code in \d+s/);

    const [codeInput] = root.findAllByType("input");
    await act(async () => {
      codeInput.props.onChange({ target: { value: "48-29 13x" } });
    });
    assert.equal(root.findAllByType("input")[0].props.value, "482913", "digits only");
    await act(async () => {
      await root.findByType("form").props.onSubmit({ preventDefault() {} });
    });
    assert.deepEqual(verifications, [["ada@example.test", "482913"]]);
    assert.equal(
      textOf(root.find((node) => node.props.role === "alert")).trim(),
      "That code is incorrect or has expired.",
    );

    await act(async () => {
      findButton(root, "Use a different email")!.props.onClick();
    });
    checkFields(root, {
      "Full name": { autoComplete: "name" },
      "Email address": { autoComplete: "email" },
    });
    renderer.unmount();
  } finally {
    FirebaseCustomerAuth.requestEmailCode = original.request;
    FirebaseCustomerAuth.signInWithEmailCode = original.verify;
  }
}

// PIN that needs a one-time mailbox confirmation moves to the code step,
// then signs in with PIN + code.
{
  const original = FirebaseCustomerAuth.signInWithPin;
  const calls: Array<[string, string, string | undefined]> = [];
  FirebaseCustomerAuth.signInWithPin = async (identifier, pin, emailCode) => {
    calls.push([identifier, pin, emailCode]);
    throw Object.assign(
      new Error(emailCode ? "That code is incorrect or has expired." : "confirm"),
      { code: emailCode ? "INVALID_CODE" : "PIN_EMAIL_CONFIRMATION_REQUIRED" },
    );
  };
  try {
    const renderer = await render();
    const root = renderer.root;
    await act(async () => {
      findButton(root, "Sign in with your PIN instead")!.props.onClick();
    });
    const [email, pin] = root.findAllByType("input");
    await act(async () => {
      email.props.onChange({ target: { value: "ada@example.test" } });
      pin.props.onChange({ target: { value: "482619" } });
    });
    await act(async () => {
      await root.findByType("form").props.onSubmit({ preventDefault() {} });
    });
    assert.equal(root.findAll((node) => node.props.role === "alert").length, 0);
    assert.match(textOf(root.findByType("form")), /Your PIN keeps working afterwards/);
    const [codeInput] = root.findAllByType("input");
    await act(async () => {
      codeInput.props.onChange({ target: { value: "123123" } });
    });
    await act(async () => {
      await root.findByType("form").props.onSubmit({ preventDefault() {} });
    });
    assert.deepEqual(calls, [
      ["ada@example.test", "482619", undefined],
      ["ada@example.test", "482619", "123123"],
    ]);
    renderer.unmount();
  } finally {
    FirebaseCustomerAuth.signInWithPin = original;
  }
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
    await act(async () => {
      findButton(root, "Sign in with your PIN instead")!.props.onClick();
    });
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

console.log("PASS: login view is Google-first, passwordless by default, labelled and announces errors");
