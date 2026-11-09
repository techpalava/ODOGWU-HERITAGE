import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/components/HomeView.tsx", "utf8");
const heroStart = source.indexOf('id="homepage-hero"');
const heroEnd = source.indexOf("{/* Why Choose NTCC? */}", heroStart);
assert.ok(heroStart > 0 && heroEnd > heroStart, "Homepage hero section is present");
const hero = source.slice(heroStart, heroEnd);

assert.match(hero, /Nigerian Traditional Clothing/);
assert.doesNotMatch(hero, /Nigerian Traditional Clothing,/);
assert.match(hero, /Custom Made<\/span>\s*for You/);
assert.doesNotMatch(hero, /for You\./);

const h1 = hero.match(/<h1\b[\s\S]*?<\/h1>/)?.[0] ?? "";
assert.ok(h1.includes("font-serif"), "Hero title uses the mixed-case serif");
assert.ok(!h1.includes("font-display"), "Hero title does not use the all-caps display face");
assert.ok(!/\buppercase\b/.test(h1), "Hero title is not forced to uppercase");
assert.match(
  h1,
  /text-\[1\.75rem\][\s\S]*sm:text-\[2rem\][\s\S]*lg:text-\[2\.15rem\][\s\S]*xl:text-\[2\.4rem\]/,
  "Both heading lines share one size on the h1",
);
assert.match(h1, /\btext-center\b/, "Title is centered on phones");
assert.match(h1, /\bmd:text-left\b/, "Title returns to the left from 768px");
assert.doesNotMatch(h1, /\b(?:sm|lg|xl):text-center\b/, "Title is not centered on tablet or desktop");

const lineSpans = [...h1.matchAll(/<span\b[^>]*className="([^"]*)"/g)].map((match) => match[1]);
assert.equal(lineSpans.length, 3, "Title, tagline, and gold phrase are the only heading spans");
for (const className of lineSpans) {
  assert.doesNotMatch(
    className,
    /(?:^|\s)(?:sm:|lg:|xl:)?text-(?:\[|xs|sm|base|lg|xl|\d)/,
    `Heading spans must inherit the h1 size: ${className}`,
  );
}
assert.match(lineSpans[0], /\blg:whitespace-nowrap\b/);
assert.match(lineSpans[1], /\blg:whitespace-nowrap\b/);
assert.match(lineSpans[2], /\bitalic\b/);
assert.match(lineSpans[2], /\btext-heritage-gold\b/);
assert.doesNotMatch(lineSpans[2], /\buppercase\b/);

assert.match(
  source,
  /const heroProseClassName =\s*"text-left leading-relaxed font-sans lg:text-justify lg:\[text-align-last:left\]"/,
);
assert.match(
  source,
  /const heroIntroProseClassName =\s*"text-center \[text-align-last:center\] leading-relaxed font-sans md:text-left md:\[text-align-last:left\] lg:text-justify lg:\[text-align-last:left\]"/,
);
assert.equal((hero.match(/heroIntroProseClassName/g) || []).length, 1, "Only the welcome paragraph uses the mobile-centered intro");
assert.equal((hero.match(/heroProseClassName/g) || []).length, 6, "Vision, mission, and four values stay left until desktop");
assert.ok(
  hero.indexOf("heroIntroProseClassName") < hero.indexOf("data-hero-photos"),
  "Centered intro is the welcome text above the slider",
);
assert.doesNotMatch(hero, /\\u00AD|\u00AD/, "Hero copy has no discretionary hyphens");
assert.doesNotMatch(hero, /hyphens-/);

for (const heading of ["The Vision", "Our Mission", "Core Values"]) {
  const block = hero.match(new RegExp(`<h2 className="([^"]*)">\\s*${heading}`));
  assert.ok(block, `${heading} has a heading`);
  assert.match(block[1], /\buppercase\b/, `${heading} stays uppercase`);
  assert.match(block[1], /\bfont-extrabold\b/, `${heading} stays extra bold`);
  assert.match(block[1], /\btext-left\b/, `${heading} stays left aligned`);
}

assert.ok(
  hero.indexOf("data-hero-photos") < hero.indexOf("data-hero-values"),
  "Photos come before Vision in source order for phones",
);
assert.match(hero, /lg:grid-cols-12/);
assert.match(hero, /data-hero-values[\s\S]*lg:flex lg:justify-center[\s\S]*data-hero-cta/);
const cta = hero.slice(hero.indexOf("data-hero-cta"));
assert.match(cta, /<button\b/);
assert.doesNotMatch(cta.slice(0, cta.indexOf("</button>")), /\buppercase\b/, "Hero button keeps the label's own casing");

console.log("homepage hero layout: ok");
