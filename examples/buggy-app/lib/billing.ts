// Plan logic for the Billing page.
export function planFromStatus(status: string | null | undefined) {
  return status === "active" || status === "trialing" ? "pro" : "free";
}

export function periodNote(subscription: {
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date;
}) {
  const date = subscription.currentPeriodEnd.toLocaleDateString();
  if (subscription.status === "trialing") {
    return `Free trial ends on ${date}.`;
  }
  if (subscription.cancelAtPeriodEnd) {
    return `Cancelled: Pro ends on ${date}.`;
  }
  return `Renews on ${date}.`;
}
