import { Buffer } from "node:buffer";

import { getMpesaEnv } from "@/lib/env";
import { normalizeKenyanPhoneNumber } from "@/lib/utils";

interface MpesaAccessTokenResponse {
  access_token: string;
  expires_in: string;
}

interface StkPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

export interface StkPushPayload {
  amount: number;
  phone: string;
  accountReference?: string;
  transactionDesc?: string;
}

function getBaseUrl(environment: "sandbox" | "production") {
  return environment === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

export function getTimestamp() {
  const date = new Date();
  const parts = [
    date.getFullYear(),
    `${date.getMonth() + 1}`.padStart(2, "0"),
    `${date.getDate()}`.padStart(2, "0"),
    `${date.getHours()}`.padStart(2, "0"),
    `${date.getMinutes()}`.padStart(2, "0"),
    `${date.getSeconds()}`.padStart(2, "0")
  ];

  return parts.join("");
}

export async function getMpesaAccessToken() {
  const { environment, consumerKey, consumerSecret } = getMpesaEnv();
  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString(
    "base64"
  );

  const response = await fetch(
    `${getBaseUrl(environment)}/oauth/v1/generate?grant_type=client_credentials`,
    {
      method: "GET",
      headers: {
        Authorization: `Basic ${credentials}`
      },
      cache: "no-store"
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`M-Pesa OAuth failed: ${response.status} ${body}`);
  }

  const payload = (await response.json()) as MpesaAccessTokenResponse;

  if (!payload.access_token) {
    throw new Error("M-Pesa OAuth response did not include an access token.");
  }

  return payload.access_token;
}

export async function initiateStkPush(payload: StkPushPayload) {
  const mpesaEnv = getMpesaEnv();
  const timestamp = getTimestamp();
  const password = Buffer.from(
    `${mpesaEnv.shortcode}${mpesaEnv.passkey}${timestamp}`
  ).toString("base64");
  const accessToken = await getMpesaAccessToken();
  const normalizedPhone = normalizeKenyanPhoneNumber(payload.phone);

  const response = await fetch(
    `${getBaseUrl(mpesaEnv.environment)}/mpesa/stkpush/v1/processrequest`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        BusinessShortCode: mpesaEnv.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: mpesaEnv.transactionType,
        Amount: Math.round(payload.amount),
        PartyA: normalizedPhone,
        PartyB: mpesaEnv.shortcode,
        PhoneNumber: normalizedPhone,
        CallBackURL: mpesaEnv.callbackUrl,
        AccountReference: payload.accountReference ?? mpesaEnv.accountReference,
        TransactionDesc: payload.transactionDesc ?? mpesaEnv.transactionDesc
      }),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`STK push failed: ${response.status} ${body}`);
  }

  const result = (await response.json()) as StkPushResponse;

  if (result.ResponseCode !== "0") {
    throw new Error(result.ResponseDescription || "Safaricom rejected the STK request.");
  }

  return {
    checkoutRequestId: result.CheckoutRequestID,
    merchantRequestId: result.MerchantRequestID,
    customerMessage: result.CustomerMessage
  };
}
