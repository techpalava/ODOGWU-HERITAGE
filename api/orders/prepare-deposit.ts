export default async function handler(req: any, res: any) {
  const { handlePrepareDepositOrder } = await import(
    "../../src/server/prepareDepositOrderHttp.js"
  );
  return handlePrepareDepositOrder(req, res);
}
