"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type CallbackState =
  | { status: "loading"; message: string }
  | { status: "error"; message: string };

function getHashParams(hash: string) {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  return new URLSearchParams(fragment);
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [state, setState] = useState<CallbackState>({
    status: "loading",
    message: "Finalizing your sign-in..."
  });

  useEffect(() => {
    let mounted = true;

    async function finalizeSignIn() {
      const supabase = createBrowserSupabaseClient();
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const hashParams = getHashParams(window.location.hash);
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            throw error;
          }
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });

          if (error) {
            throw error;
          }
        } else {
          throw new Error("The sign-in link is missing session details.");
        }

        const {
          data: { session },
          error
        } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if (!session?.user?.email) {
          throw new Error("Session could not be persisted after sign-in.");
        }

        router.replace("/admin");
      } catch (caughtError) {
        await supabase.auth.signOut();

        if (!mounted) {
          return;
        }

        setState({
          status: "error",
          message:
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to complete sign-in."
        });
      }
    }

    void finalizeSignIn();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-[2rem] border border-white/60 bg-white/70 p-8 shadow-luxe backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-bronze">
          Admin Access
        </p>
        <h1 className="mt-2 font-serif text-3xl text-ink">
          {state.status === "loading" ? "Signing you in" : "Sign-in issue"}
        </h1>
        <p className="mt-3 text-sm text-muted">{state.message}</p>
        {state.status === "error" ? (
          <Link
            href="/login"
            className="mt-6 inline-flex text-sm font-medium text-ink underline underline-offset-4"
          >
            Return to admin login
          </Link>
        ) : null}
      </div>
    </main>
  );
}
