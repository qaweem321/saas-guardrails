"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { planFromStatus } from "@/lib/billing";
import { stripe } from "@/lib/stripe";
import { requireOwner } from "@/lib/session";
import { eq } from "drizzle-orm";

export async function startCheckout(formData: FormData) {
  const { organization, customerId } = await requireOwner(String(formData.get("slug")));

  const [current] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organization.id));
  if (planFromStatus(current?.status) === "pro") {
    return { error: "You're already on Pro." };
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    subscription_data: { trial_period_days: 14 },
    success_url: `${process.env.APP_URL}/billing/success`,
    cancel_url: `${process.env.APP_URL}/billing`,
  });
  redirect(session.url!);
}
