# Månedlig kontrol af abonnementer

## Formål
Dette cron-job verificerer alle aktive abonnenter en gang om måneden og markerer
`subscription_status = "past_due"`, hvis den seneste betaling fejler eller en
faktura er forfalden.

## Frekvens
- Kør den 1. i hver måned kl. 02:00 (lokal tid eller UTC afhængigt af drift).

## Arbejdsgang (skitse)
1. Hent alle brugere med `subscription_status` i `active` eller `trialing`.
2. For hver bruger:
   - Slå kunden op i Stripe med `stripe_customer_id`.
   - Find seneste invoice/payment-intent.
   - Hvis sidste betaling er fejlet eller invoice er forfalden:
     - Opdater `subscription_status` til `past_due`.
     - Sæt `current_period_end` til seneste kendte periode-slutdato (hvis tilgængelig).
     - Log hændelsen til overvågning.
3. For brugere uden `stripe_customer_id`:
   - Markér som `past_due` og log en advarsel, så billing kan rettes manuelt.

## Pseudokode
```
cron("0 2 1 * *", async () => {
  const users = await userRepo.findByStatus(["active", "trialing"]);

  for (const user of users) {
    if (!user.stripe_customer_id) {
      await subscriptionService.updateSubscriptionStatus({
        userId: user.id,
        status: "past_due",
        currentPeriodEnd: user.current_period_end,
      });
      continue;
    }

    const stripeData = await stripeClient.getLatestInvoice(user.stripe_customer_id);
    if (stripeData.isPastDue) {
      await subscriptionService.updateSubscriptionStatus({
        userId: user.id,
        status: "past_due",
        currentPeriodEnd: stripeData.currentPeriodEnd,
      });
    }
  }
});
```

## Noter
- Brug idempotente opdateringer, så job kan genkøres sikkert.
- Forbered evt. en e-mailflow, der guider brugeren til at opdatere betalingskortet.
