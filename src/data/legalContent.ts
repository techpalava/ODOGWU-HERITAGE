import type { LegalDocument } from "../components/LegalDocumentView";

/**
 * Draft legal text. Everything in [SQUARE BRACKETS] is a placeholder the
 * owner must fill in before launch. Facts here must match what the code
 * actually does; update both together.
 */

export const PRIVACY_POLICY: LegalDocument = {
  kind: "privacy",
  title: "Privacy Policy",
  lastUpdated: "[LAST UPDATED DATE]",
  intro:
    "This policy explains what personal data The Odogwu Heritage collects when you use this website or order from us, why we need it, who we share it with, and the rights you have under EU privacy law (GDPR).",
  sections: [
    {
      id: "privacy-who-we-are",
      title: "Who we are",
      paragraphs: [
        "The Odogwu Heritage makes traditional Nigerian clothing to order. Garments are made in Nigeria and delivered across the Netherlands.",
        "The business responsible for your data (the \"controller\") is [LEGAL ENTITY NAME], [REGISTERED ADDRESS], KvK number [KVK NUMBER].",
        "For any privacy question or request, email [CONTACT EMAIL].",
      ],
    },
    {
      id: "privacy-what-we-collect",
      title: "What we collect",
      bullets: [
        "Account details: your name and email address. If you sign in with Google, we receive your name, email address and Google account ID from Google. If you use a security PIN, we store only a scrambled (hashed) version of it.",
        "Contact and delivery details: phone number, delivery address, and any notes you add to your order.",
        "Body measurements: the measurements you enter (such as height, chest, waist and sleeve length) for you and for anyone else you order for, plus their names.",
        "Design choices and uploads: the garments, fabrics, styles and custom details you choose, any name for a monogram, and any pictures of designs you upload.",
        "Orders and payments: what you ordered, prices, payment status and payment references. Card and bank details go straight to our payment providers. We never see or store your full card number.",
        "Reviews and feedback: reviews you write (your name, location, rating and text), and feedback you send through the site, with an optional email address, the page you were on, and your browser and screen size.",
        "Group orders: if you set up or join a private batch, the invites and who joined.",
        "Technical and security data: your IP address and browser details, used to send sign-in codes safely, limit repeated attempts, and find errors. Stored attempt counters use a scrambled form of the IP address.",
      ],
    },
    {
      id: "privacy-how-we-use",
      title: "Why we use it (legal bases)",
      bullets: [
        "To create and run your account, take your order, make your garments, take payment and deliver to you. Legal basis: performing our contract with you.",
        "To send you sign-in codes and keep accounts safe, including blocking repeated failed attempts. Legal basis: our legitimate interest in security.",
        "To answer your messages and feedback, fix problems and improve the site. Legal basis: our legitimate interest in running a good service.",
        "To publish reviews you choose to send us. Legal basis: your consent, which you can withdraw at any time.",
        "To keep order and payment records for tax and accounting. Legal basis: our legal obligations.",
      ],
      after: [
        "We do not sell your data, use it for advertising, or make automated decisions about you that have legal effects.",
      ],
    },
    {
      id: "privacy-who-we-share-with",
      title: "Who we share it with",
      paragraphs: [
        "We share only what each party needs to do its job:",
      ],
      bullets: [
        "Our production team in Nigeria, who make your garments. They receive the order details needed for this, such as wearer names, measurements and design choices.",
        "Google (Firebase): sign-in (including Google sign-in), our database, and storage for uploaded pictures.",
        "Vercel: hosts this website and the servers behind it, including technical logs.",
        "Brevo: sends our sign-in code emails. If Brevo is unavailable, Google's Gmail service sends them instead.",
        "Stripe: processes card, iDEAL and, where offered, Klarna and Pix payments.",
        "PayPal: processes PayPal payments.",
        "Delivery partners: [DELIVERY PARTNERS], who need your name, phone number and address to deliver your order.",
      ],
      after: [
        "Some pages load fonts from Google Fonts and a background image from Unsplash. Your browser connects to those services directly, so they can see your IP address.",
        "If you contact us on WhatsApp, WhatsApp's own privacy policy applies to that chat.",
      ],
    },
    {
      id: "privacy-transfers",
      title: "Data sent outside the EU",
      paragraphs: [
        "Your garments are made in Nigeria, so the order details needed to make them are sent there. Some of our service providers may also process data outside the European Economic Area, for example in the United States.",
        "When data leaves the EEA, we rely on [TRANSFER SAFEGUARDS] to protect it. You can ask us for a copy of these safeguards.",
      ],
    },
    {
      id: "privacy-retention",
      title: "How long we keep it",
      bullets: [
        "Account details: while your account is open. If you ask us to delete your account, we delete or anonymise it within [ACCOUNT DELETION PERIOD].",
        "Orders, measurements and payment records: [ORDER RECORD RETENTION PERIOD], so we can handle remakes and complaints and meet tax rules.",
        "Sign-in codes: they expire after 10 minutes and can be used only once.",
        "Feedback and technical logs: [LOG AND FEEDBACK RETENTION PERIOD].",
      ],
    },
    {
      id: "privacy-cookies",
      title: "Cookies and storage on your device",
      paragraphs: [
        "We do not use advertising or analytics cookies. The site saves some information in your browser so it works properly, such as keeping you signed in, your cart, and designs you have not finished yet. You can clear this at any time in your browser settings.",
        "When you pay, Stripe or PayPal may set their own cookies for security and fraud prevention.",
      ],
    },
    {
      id: "privacy-security",
      title: "How we protect it",
      paragraphs: [
        "We use secure (HTTPS) connections, sign-in codes that expire and can be used once, scrambled (hashed) PINs and codes, limits on repeated attempts, and access rules so customers can only see their own orders. No system is perfectly secure, but we work to keep your data safe.",
      ],
    },
    {
      id: "privacy-your-rights",
      title: "Your rights",
      paragraphs: ["Under the GDPR you can ask us to:"],
      bullets: [
        "give you a copy of your data (access);",
        "correct data that is wrong (correction);",
        "delete your data (deletion), unless we must keep it by law;",
        "send your data to you or another company in a common format (portability);",
        "stop or limit using your data (objection and restriction);",
        "stop using it based on your consent, by withdrawing that consent.",
      ],
      after: [
        "Email [CONTACT EMAIL] to use any of these rights. We will reply within one month.",
        "If you are unhappy with how we handle your data, you can complain to the Dutch data protection authority, the Autoriteit Persoonsgegevens (autoriteitpersoonsgegevens.nl), or to the authority in your own EU country.",
      ],
    },
    {
      id: "privacy-changes",
      title: "Changes to this policy",
      paragraphs: [
        "We may update this policy when our service changes. The date at the top shows the latest version. If a change is important, we will tell you on the site or by email.",
      ],
    },
  ],
};

export const TERMS_AND_CONDITIONS: LegalDocument = {
  kind: "terms",
  title: "Terms & Conditions",
  lastUpdated: "[LAST UPDATED DATE]",
  intro:
    "These terms apply when you use this website or order from The Odogwu Heritage. Please read them before you order. By creating an account or placing an order, you agree to them.",
  sections: [
    {
      id: "terms-who-we-are",
      title: "Who we are",
      paragraphs: [
        "The Odogwu Heritage is run by [LEGAL ENTITY NAME], [REGISTERED ADDRESS], KvK number [KVK NUMBER], VAT number [VAT NUMBER]. You can reach us at [CONTACT EMAIL].",
        "We make traditional Nigerian clothing to order. Garments are made in Nigeria and delivered across the Netherlands.",
      ],
    },
    {
      id: "terms-account",
      title: "Your account",
      bullets: [
        "You can sign in with Google or with a one-time code we email to you. Older accounts can still use a security PIN.",
        "Keep access to your email account safe. Anyone who can read your email can receive your sign-in codes.",
        "Give us correct details, especially your name, phone number and delivery address.",
        "We may suspend an account that is used for fraud or misuse of the site.",
      ],
    },
    {
      id: "terms-orders",
      title: "Custom-made orders",
      bullets: [
        "Every garment is made to order from the measurements, fabrics, styles and details you choose.",
        "You are responsible for the measurements you enter. Please check them carefully before you pay. We make the garment to the measurements you give us.",
        "Some orders are made in shared community batches or private group batches. Each batch has its own closing date and conditions, shown on the site before you order.",
        "If you upload a picture of a design, you confirm you are allowed to use it. We use it only to make your order.",
        "Your order is placed when your payment is confirmed. We may refuse or cancel an order, for example if a fabric runs out or a price was clearly wrong. If we do, we refund what you paid for it.",
      ],
    },
    {
      id: "terms-prices",
      title: "Prices and payment",
      bullets: [
        "Prices are shown in euros before you pay, including any shipping charges.",
        "Some items need a personalised price from us first. We tell you the price before you are asked to pay for that item.",
        "Checkout shows what you pay now (for example a deposit) and any balance still to pay later.",
        "Payments are handled by Stripe (card, iDEAL and, where offered, Klarna or Pix) and PayPal. Their terms also apply to your payment.",
      ],
    },
    {
      id: "terms-delivery",
      title: "Production and delivery",
      bullets: [
        "Your garments are made in Nigeria and shipped to Eindhoven, the Netherlands.",
        "From there you can collect your order in Eindhoven, or we deliver it to your address for the delivery charge shown at checkout. Some destinations need a quote first.",
        "Timelines shown on the site are estimates. Production and shipping can be delayed by things outside our control, such as customs or carrier delays. We will keep you updated.",
        "Check your order when it arrives and tell us about any problem as soon as you can.",
      ],
    },
    {
      id: "terms-cancellations",
      title: "Cancellations and returns",
      paragraphs: [
        "Because every garment is made to your measurements and choices, the usual EU 14-day right to cancel an online purchase does not apply once production has started. This is allowed under EU consumer law for goods made to the customer's specifications.",
      ],
      bullets: [
        "You can cancel an order free of charge until [CANCELLATION DEADLINE]. After that, [CANCELLATION REFUND TERMS].",
        "If a garment is faulty, or does not match what you ordered, tell us within [DEFECT REPORT WINDOW] of receiving it, with photos. We will repair it, remake it or refund you.",
        "We cannot accept returns of a correctly made garment because it no longer fits or you changed your mind, unless we agree otherwise.",
      ],
      after: [
        "This does not affect your legal rights as a consumer, including your right to goods that match the agreement.",
      ],
    },
    {
      id: "terms-content",
      title: "Reviews and your content",
      paragraphs: [
        "If you send us a review, you allow us to show it on the site with the name and location you gave. We may choose not to publish a review, or remove it, for example if it is offensive or not about our products.",
      ],
    },
    {
      id: "terms-liability",
      title: "Our liability",
      bullets: [
        "If we fail to meet these terms, we are responsible for loss you suffer that was a foreseeable result of our failure.",
        "Our total liability for an order is limited to the amount you paid for that order.",
        "We are not responsible for indirect losses, such as lost profits or missed events.",
        "Nothing in these terms limits our liability where the law does not allow it, such as for death or injury caused by our negligence, or for fraud.",
      ],
    },
    {
      id: "terms-changes",
      title: "Changes to these terms",
      paragraphs: [
        "We may update these terms. The version that applies to your order is the one shown when you placed it. The date at the top shows the latest version.",
      ],
    },
    {
      id: "terms-law",
      title: "Law and disputes",
      paragraphs: [
        "These terms are governed by [GOVERNING LAW]. Disputes go to [COMPETENT COURT]. If you are a consumer living in the EU, you keep the protection of the mandatory consumer laws of your country.",
        "If you have a complaint, please contact us first at [CONTACT EMAIL]. We will try to solve it quickly.",
      ],
    },
  ],
};
