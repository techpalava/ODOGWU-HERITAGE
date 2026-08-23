export default async function handler(req: any, res: any) {
  const { handleReleaseDepositReservation } = await import(
    "../../src/server/releaseDepositReservationHttp.js"
  );
  return handleReleaseDepositReservation(req, res);
}
