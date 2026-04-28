export function assertPositivePayment({ amount, change_due }) {
  const paid = Number(amount);
  const change = Number(change_due ?? 0);
  if (!Number.isFinite(paid) || paid <= 0) {
    const error = new Error("Payment amount must be greater than zero");
    error.statusCode = 400;
    throw error;
  }
  if (!Number.isFinite(change) || change < 0) {
    const error = new Error("Change due cannot be negative");
    error.statusCode = 400;
    throw error;
  }
  if (paid - change <= 0) {
    const error = new Error("Net payment must be greater than zero");
    error.statusCode = 400;
    throw error;
  }
}
