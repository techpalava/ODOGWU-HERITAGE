export const config = {
  api: {
    bodyParser: false,
  },
};

const readRawBody = async (req: any): Promise<Buffer> => {
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === "string") {
    return Buffer.from(req.body);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

export default async function handler(req: any, res: any) {
  const rawBody = await readRawBody(req);
  req.rawBody = rawBody;
  // Keep body as buffer so signature verification can use raw bytes.
  req.body = rawBody;

  const { handleStripeWebhook } = await import(
    "../../src/server/stripeWebhookHttp.js"
  );
  return handleStripeWebhook(req, res);
}
