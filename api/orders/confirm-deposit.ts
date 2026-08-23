export default async function handler(req: any, res: any) {
  const { handleConfirmDepositOrder } = await import(
    "../../src/server/confirmDepositOrderHttp.js"
  );
  return handleConfirmDepositOrder(req, res);
}
