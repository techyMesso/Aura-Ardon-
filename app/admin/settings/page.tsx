import { Suspense } from "react";

import { StoreSettingsHub } from "@/components/admin/store-settings-hub";
import { requireOwnerPage } from "@/lib/auth";
import {
  countActiveAdminPushSubscriptions,
  getDailySummaryReportData,
  getStoreSettings,
  listAdminDeliveryZonesWithCounts,
  listAdminPushSubscriptions
} from "@/lib/data";
import {
  getAfricasTalkingSmsEnv,
  getResendEnv,
  getWebPushVapidEnv
} from "@/lib/env";
import { toNairobiDateIso } from "@/lib/invoices";

export const metadata = {
  title: "Settings & Alerts",
  robots: { index: false, follow: false }
};

export default async function AdminSettingsPage() {
  const adminUser = await requireOwnerPage();
  const todayIso = toNairobiDateIso(new Date());

  const [settings, subscriptions, totalActivePushDevices, dailySummary, deliveryZones] =
    await Promise.all([
      getStoreSettings(),
      adminUser?.id ? listAdminPushSubscriptions(adminUser.id) : Promise.resolve([]),
      countActiveAdminPushSubscriptions(),
      getDailySummaryReportData(todayIso),
      listAdminDeliveryZonesWithCounts()
    ]);

  const resend = getResendEnv();
  const vapid = getWebPushVapidEnv();
  const sms = getAfricasTalkingSmsEnv();

  return (
    <Suspense>
      <StoreSettingsHub
        initialSettings={settings}
        initialZones={deliveryZones}
        initialSubscriptions={subscriptions.map(sub => ({
          id: sub.id,
          endpoint: sub.endpoint,
          user_agent: sub.user_agent,
          last_used_at: sub.last_used_at,
          created_at: sub.created_at
        }))}
        initialDailySummary={dailySummary}
        notifications={{
          resendConfigured: Boolean(resend),
          orderNotifyEmail: resend?.toEmail ?? null,
          vapidConfigured: Boolean(vapid),
          vapidPublicKey: vapid?.publicKey ?? null,
          totalActivePushDevices,
          smsEnvEnabled: sms.enabledFlag,
          smsEnvConfigured: sms.configured,
          smsSandbox: sms.sandbox
        }}
      />
    </Suspense>
  );
}

