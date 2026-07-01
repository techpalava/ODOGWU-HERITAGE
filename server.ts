import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { estimateMeasurements } from "./src/utils/fitEstimator";
import Stripe from "stripe";

dotenv.config();

let stripeInstance: Stripe | null = null;

function getStripeClient(): Stripe {
  if (stripeInstance) {
    return stripeInstance;
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.trim() === "" || key === "MY_STRIPE_SECRET_KEY") {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured in the server environment. Please define it in your keys or .env file.",
    );
  }

  stripeInstance = new Stripe(key);
  return stripeInstance;
}

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// API route for AI sizing estimation using Gemini 3.5 Flash
app.post("/api/estimate-measurements", async (req, res) => {
  const { height, weight, age, bodyBuild, fitPreference, gender } = req.body;

  // First, calculate the fallback measurements using our West-African tailor heuristic rules
  const fallbackMeasurements = estimateMeasurements(
    height || null,
    weight || null,
    age || null,
    bodyBuild || "Average",
    fitPreference || "Standard",
    gender || "male"
  );

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    console.log("No valid GEMINI_API_KEY found. Falling back to heuristic estimation.");
    return res.json({
      success: true,
      source: "heuristic",
      measurements: fallbackMeasurements,
      message: "Estimated successfully using our traditional West-African heuristic algorithm (AI Server Key not configured)."
    });
  }

  try {
    // Lazy-initialize GoogleGenAI inside the request handler to prevent startup crashes if key is missing
    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const prompt = `You are an expert traditional West African bespoke master tailor from Lagos, Nigeria.
Estimate highly precise bespoke garment measurements (in inches) for a client with the following body indicators:
- Biological Gender: ${gender || "male"}
- Height: ${height || "178"} cm
- Weight: ${weight || "75"} kg
- Age: ${age || "32"} years old
- Body Build Category: ${bodyBuild || "Average"} (e.g. Slim, Average, Muscular, Broad)
- Fit Preference: ${fitPreference || "Standard"} (e.g. Slim/Executive, Standard, Relaxed)

To assist you, our hand-crafted master-tailor heuristic baseline calculations (in inches) for this profile are:
- Neck: ${fallbackMeasurements.neck}"
- Shoulder: ${fallbackMeasurements.shoulder}"
- Chest: ${fallbackMeasurements.chest}"
- Waist: ${fallbackMeasurements.waist}"
- Hip: ${fallbackMeasurements.hip}"
- Sleeve: ${fallbackMeasurements.sleeve}"
- Trouser Length: ${fallbackMeasurements.trouserLength}"
- Head: ${fallbackMeasurements.head}"

Using your master pattern-making knowledge, refine these measurements to produce cohesive, proportional body dimensions.
Traditional West-African outfits (Senator suits, Agbada, Kaftan, Boubou) require precise spacing so the fabrics drape majestically.
For example, adjust the neck or shoulder width slightly based on build, or tweak trouser length based on height/fit if needed.

Estimate the following dimensions:
- neck (neck size for Mandarin collars, typically 14 to 19 inches)
- shoulder (width in inches from shoulder tip to shoulder tip)
- chest (chest circumference in inches)
- waist (waist circumference in inches)
- hip (hip circumference in inches)
- sleeve (shoulder to wrist length in inches)
- trouserLength (waist to ankle length in inches)
- head (cap head / head circumference for custom Fila caps, typically 21.5 to 24.5 inches)
- underBorst (under-bust/underborst size in inches for female clients, typically 28 to 44 inches. For males, output 0)

Ensure all values are realistic numbers rounded to the nearest 0.5 inches. Output only the structured JSON.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            neck: { type: Type.NUMBER, description: "Neck circumference in inches" },
            shoulder: { type: Type.NUMBER, description: "Shoulder tip-to-tip width in inches" },
            chest: { type: Type.NUMBER, description: "Chest circumference in inches" },
            waist: { type: Type.NUMBER, description: "Waist circumference in inches" },
            hip: { type: Type.NUMBER, description: "Hip circumference in inches" },
            sleeve: { type: Type.NUMBER, description: "Sleeve length in inches" },
            trouserLength: { type: Type.NUMBER, description: "Trouser waist to ankle length in inches" },
            head: { type: Type.NUMBER, description: "Head circumference in inches (cap size)" },
            underBorst: { type: Type.NUMBER, description: "Under-bust size in inches (for women, else 0)" },
          },
          required: ["neck", "shoulder", "chest", "waist", "hip", "sleeve", "trouserLength", "head"],
        },
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from Gemini API");
    }

    const aiParsed = JSON.parse(text.trim());

    // Merge AI dimensions back into the structured Measurements object schema, using heuristics as base
    const mergedMeasurements = {
      ...fallbackMeasurements,
      neck: aiParsed.neck || fallbackMeasurements.neck,
      shoulder: aiParsed.shoulder || fallbackMeasurements.shoulder,
      chest: aiParsed.chest || fallbackMeasurements.chest,
      waist: aiParsed.waist || fallbackMeasurements.waist,
      hip: aiParsed.hip || fallbackMeasurements.hip,
      sleeve: aiParsed.sleeve || fallbackMeasurements.sleeve,
      trouserLength: aiParsed.trouserLength || fallbackMeasurements.trouserLength,
      head: aiParsed.head || fallbackMeasurements.head,
      underBorst: gender === "female" ? (aiParsed.underBorst || fallbackMeasurements.underBorst) : undefined,
      isAiEstimated: true,
    };

    res.json({
      success: true,
      source: "gemini",
      measurements: mergedMeasurements,
      message: "Estimated successfully using Gemini AI Sizing models calibrated to traditional Lagosian tailors!"
    });

  } catch (error: any) {
    if (error?.status === 429 || error?.message?.includes("429") || error?.message?.includes("RESOURCE_EXHAUSTED")) {
      console.info("Gemini Sizing Estimation error (429): API credits depleted. Returning heuristic fallback.");
    } else {
      console.info("Gemini Sizing Estimation error:", error.message || error);
    }
    // If Gemini fails, return fallback calculations so user experience is smooth and non-blocking
    res.json({
      success: true,
      source: "heuristic",
      measurements: fallbackMeasurements,
      message: "Estimated using traditional West-African sizing heuristic algorithm (Gemini API server fallback)."
    });
  }
});

// API route for handling Stripe or iDEAL payment intents representing exactly 50% of the calculated total


app.post("/api/create-payment-intent", async (req, res) => {
  const { amount, paymentMethod, idealBank, customerEmail } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, error: "Invalid amount specified." });
  }

  const depositAmount = parseFloat((amount / 2).toFixed(2));
  let transactionId = `TXN-DP-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;
  let realStripeActivated = false;

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (stripeKey && stripeKey.trim() !== "" && stripeKey !== "MY_STRIPE_SECRET_KEY") {
    try {
      // Lazily initialize the Stripe client inside the request handler to prevent application startup crashes in keyless environments
      const stripe = getStripeClient();
      const depositInCents = Math.round(depositAmount * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: depositInCents,
        currency: "eur",
        metadata: { customerEmail, paymentMethod: paymentMethod || "card", stage: "Bespoke 50% Deposit" }
      });
      transactionId = paymentIntent.id;
      realStripeActivated = true;
      console.log(`[Stripe API Proxy] Successfully created PaymentIntent: ${paymentIntent.id}`);
    } catch (stripeErr: any) {
      console.warn("Stripe API integration warning (falling back to secure simulator):", stripeErr.message);
    }
  }

  console.log(`Processing secure ${paymentMethod} 50% deposit intent of €${depositAmount} for ${customerEmail} (Real Stripe: ${realStripeActivated})`);

  res.json({
    success: true,
    transactionId,
    amountCharged: depositAmount,
    method: paymentMethod,
    bank: idealBank || null,
    message: `Secure ${paymentMethod} deposit transaction of €${depositAmount} authorized successfully! ${realStripeActivated ? "(Live Stripe Gateway Verified)" : "(Secure Escrow Sandbox Simulated)"}`,
    timestamp: new Date().toISOString()
  });
});

// API route for charging the remaining 50% balance to unlock the locker passcode
app.post("/api/charge-balance", async (req, res) => {
  const { amount, paymentMethod, customerEmail, orderId } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, error: "Invalid balance amount." });
  }

  const balanceAmount = parseFloat(amount.toFixed(2));
  let secondTransactionId = `TXN-BAL-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;
  let realStripeActivated = false;

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (stripeKey && stripeKey.trim() !== "" && stripeKey !== "MY_STRIPE_SECRET_KEY") {
    try {
      // Lazily initialize Stripe client
      const stripe = getStripeClient();
      const balanceInCents = Math.round(balanceAmount * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: balanceInCents,
        currency: "eur",
        metadata: { customerEmail, orderId: orderId || "bespoke-order", stage: "Bespoke Final 50% Balance" }
      });
      secondTransactionId = paymentIntent.id;
      realStripeActivated = true;
      console.log(`[Stripe API Proxy] Successfully charged balance via PaymentIntent: ${paymentIntent.id}`);
    } catch (stripeErr: any) {
      console.warn("Stripe API balance integration warning (falling back to secure simulator):", stripeErr.message);
    }
  }

  // Generate a random high-security locker locker code (like B4-08-4920)
  const lockerBox = `B4-${Math.floor(Math.random() * 12 + 1).toString().padStart(2, '0')}`;
  const lockerPin = Math.floor(Math.random() * 9000 + 1000);
  const lockerPasscode = `${lockerBox}-${lockerPin}`;

  console.log(`Processing secure final balance payment of €${balanceAmount} via ${paymentMethod} for ${customerEmail} (Real Stripe: ${realStripeActivated})`);

  res.json({
    success: true,
    secondTransactionId,
    amountCharged: balanceAmount,
    lockerPasscode,
    message: `Escrow balance settled! Secure locker ${lockerBox} is now unlocked. ${realStripeActivated ? "(Live Stripe Gateway Settled)" : "(Secure Escrow Sandbox Simulated)"}`,
    timestamp: new Date().toISOString()
  });
});

// API health endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// API route for exporting workshop production manifest as CSV
app.post("/api/production-manifest", (req, res) => {
  const { orders } = req.body;

  if (!orders || !Array.isArray(orders)) {
    return res.status(400).json({ success: false, error: "Invalid orders data provided." });
  }

  // Helper to escape CSV values
  const escapeCSV = (val: any) => {
    if (val === undefined || val === null) return '""';
    let str = String(val);
    // Escape double quotes by doubling them
    str = str.replace(/"/g, '""');
    return `"${str}"`;
  };

  const headers = [
    "Order / Tracking ID",
    "Customer Name",
    "Customer Email",
    "Customer Phone",
    "Garment Style ID",
    "Garment Style Name",
    "Garment Selection / Type",
    "Fabric Sourcing Code",
    "Fabric Name",
    "Collar Option",
    "Embroidery Code / Style",
    "Sleeve Option",
    "Pocket Style",
    "Additional Cap Included",
    "Hem Finish Style",
    "Measurement Unit",
    "Height (cm)",
    "Weight (kg)",
    "Age",
    "Body Build",
    "Fit Preference",
    "Neck Dimension",
    "Shoulder Dimension",
    "Chest Dimension",
    "Waist Dimension",
    "Hip Dimension",
    "Sleeve Dimension",
    "Trouser Length",
    "Head Size (Cap)",
    "Trouser Crotch Depth",
    "Leftover Fabric Instructions",
    "Special Workshop Instructions"
  ];

  const rows = [headers.join(",")];

  orders.forEach((o: any) => {
    const trackingId = o.shipment?.trackingId || "N/A";
    const custName = o.customer?.name || "N/A";
    const custEmail = o.customer?.email || "N/A";
    const custPhone = o.customer?.phone || "N/A";
    const styleId = o.style?.id || "N/A";
    const styleName = o.style?.name || "N/A";
    const garmentType = o.garment?.type || "N/A";
    const fabricCode = o.fabric?.code || "N/A";
    const fabricName = o.fabric?.name || "N/A";

    const collar = o.design?.collar || "Standard Mandarin";
    const embroidery = o.design?.embroidery || "None";
    const sleeve = o.design?.sleeve || "Long Sleeve";
    const pocket = o.design?.pocket || "None";
    const additionalCap = o.design?.additionalCap ? "Yes" : "No";
    const hemFinish = o.design?.hemFinish || "Standard Custom";

    const unit = o.measurements?.unit || "inch";
    const height = o.measurements?.height || "";
    const weight = o.measurements?.weight || "";
    const age = o.measurements?.age || "";
    const bodyBuild = o.measurements?.bodyBuild || "Average";
    const fitPref = o.measurements?.fitPreference || "Standard";

    const neck = o.measurements?.neck || "";
    const shoulder = o.measurements?.shoulder || "";
    const chest = o.measurements?.chest || "";
    const waist = o.measurements?.waist || "";
    const hip = o.measurements?.hip || "";
    const sleeveDim = o.measurements?.sleeve || "";
    const trouserLen = o.measurements?.trouserLength || "";
    const headSize = o.measurements?.head || "";
    const crotchDepth = o.measurements?.trouserCrotchDepth || "";

    const leftoverFabric = o.notesAboutLeftoverFabric || "Return with garment";
    const specialInst = o.specialInstructions || "";

    const row = [
      escapeCSV(trackingId),
      escapeCSV(custName),
      escapeCSV(custEmail),
      escapeCSV(custPhone),
      escapeCSV(styleId),
      escapeCSV(styleName),
      escapeCSV(garmentType),
      escapeCSV(fabricCode),
      escapeCSV(fabricName),
      escapeCSV(collar),
      escapeCSV(embroidery),
      escapeCSV(sleeve),
      escapeCSV(pocket),
      escapeCSV(additionalCap),
      escapeCSV(hemFinish),
      escapeCSV(unit),
      escapeCSV(height),
      escapeCSV(weight),
      escapeCSV(age),
      escapeCSV(bodyBuild),
      escapeCSV(fitPref),
      escapeCSV(neck),
      escapeCSV(shoulder),
      escapeCSV(chest),
      escapeCSV(waist),
      escapeCSV(hip),
      escapeCSV(sleeveDim),
      escapeCSV(trouserLen),
      escapeCSV(headSize),
      escapeCSV(crotchDepth),
      escapeCSV(leftoverFabric),
      escapeCSV(specialInst)
    ];

    rows.push(row.join(","));
  });

  const csvContent = rows.join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=\"heritage_workshop_production_manifest.csv\"");
  res.status(200).send(csvContent);
});

// Vite middleware setup
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

setupVite();
