function getRequiredEnv(key: string) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

export function hasPublicSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function getSupabaseEnv() {
  return {
    url: getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  };
}

export function getAdminEmail() {
  return getRequiredEnv("ADMIN_EMAIL").toLowerCase();
}

export function getServiceRoleKey() {
  return getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export function getMpesaEnv() {
  const environment = getRequiredEnv("MPESA_ENVIRONMENT");

  if (environment !== "sandbox" && environment !== "production") {
    throw new Error("MPESA_ENVIRONMENT must be either 'sandbox' or 'production'.");
  }

  return {
    environment,
    consumerKey: getRequiredEnv("MPESA_CONSUMER_KEY"),
    consumerSecret: getRequiredEnv("MPESA_CONSUMER_SECRET"),
    shortcode: getRequiredEnv("MPESA_SHORTCODE"),
    passkey: getRequiredEnv("MPESA_PASSKEY"),
    callbackUrl: getRequiredEnv("MPESA_CALLBACK_URL"),
    transactionType:
      process.env.MPESA_TRANSACTION_TYPE ?? "CustomerPayBillOnline",
    accountReference: process.env.MPESA_ACCOUNT_REFERENCE ?? "AuroArdon",
    transactionDesc:
      process.env.MPESA_TRANSACTION_DESC ?? "Luxury jewelry purchase"
  } as const;
}
