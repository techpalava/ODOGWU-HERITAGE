export default async function handler(req: any, res: any) {
  const { handleReconcileExpiredReservations } = await import(
    "../../src/server/reconcileExpiredReservationsHttp.js"
  );
  return handleReconcileExpiredReservations(req, res);
}
