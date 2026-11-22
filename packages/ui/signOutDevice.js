"use client";

import { signOut } from "next-auth/react";
import { forgetThisDevice } from "./devicePush.js";

/**
 * Sign out and stop this device ringing for the account. Every logout button
 * uses this, so a shared phone or laptop never keeps receiving the previous
 * person's notifications. A failure to forget the device never blocks logout.
 */
export async function signOutAndForgetDevice(options = { callbackUrl: "/login" }) {
  await Promise.race([
    forgetThisDevice().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ]);
  return signOut(options);
}
