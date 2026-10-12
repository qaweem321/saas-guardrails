import { stripe } from "@/lib/stripe";

// Holds the deposit on the customer's saved card at pickup. If the pickup fails afterwards, the
// hold is cancelled and staff simply try the pickup again.
export async function holdDeposit(bookingId: string, customer: string, paymentMethod: string) {
  return stripe.paymentIntents.create(
    {
      amount: 25000,
      currency: "usd",
      customer,
      payment_method: paymentMethod,
      capture_method: "manual",
      confirm: true,
      off_session: true,
    },
    { idempotencyKey: `deposit-${bookingId}` },
  );
}
