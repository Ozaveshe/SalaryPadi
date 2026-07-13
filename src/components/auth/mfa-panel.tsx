"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type PanelMode = "loading" | "enrol" | "challenge" | "complete";

export function MfaPanel({
  returnTo = "/admin",
  variant = "admin",
}: {
  returnTo?: "/account" | "/admin";
  variant?: "account" | "admin";
}) {
  const accountVariant = variant === "account";
  const [mode, setMode] = useState<PanelMode>("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    async function inspectFactors() {
      const supabase = createBrowserSupabaseClient();
      if (!supabase) {
        if (active) {
          setError("The SalaryPadi authentication service is not configured.");
          setMode("enrol");
        }
        return;
      }

      const [{ data: assurance, error: assuranceError }, factors] =
        await Promise.all([
          supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
          supabase.auth.mfa.listFactors(),
        ]);

      if (!active) return;

      if (assuranceError || factors.error) {
        setError("We could not check your second-factor status. Try again.");
        setMode("enrol");
        return;
      }

      if (assurance.currentLevel === "aal2") {
        setMode("complete");
        return;
      }

      const verifiedFactor = factors.data.totp.find(
        (factor) => factor.status === "verified",
      );

      if (verifiedFactor) {
        setFactorId(verifiedFactor.id);
        setMode("challenge");
      } else {
        setMode("enrol");
      }
    }

    void inspectFactors();
    return () => {
      active = false;
    };
  }, []);

  async function startEnrolment() {
    setBusy(true);
    setError(null);

    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setError("The SalaryPadi authentication service is not configured.");
      setBusy(false);
      return;
    }

    const { data, error: enrolmentError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: accountVariant ? "SalaryPadi account" : "SalaryPadi admin",
    });

    if (enrolmentError) {
      setError("We could not start MFA enrolment. Try again.");
      setBusy(false);
      return;
    }

    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setCode("");
    setMode("challenge");
    setBusy(false);
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId || !/^\d{6,8}$/.test(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }

    setBusy(true);
    setError(null);

    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setError("The SalaryPadi authentication service is not configured.");
      setBusy(false);
      return;
    }

    const challenge = await supabase.auth.mfa.challenge({ factorId });
    if (challenge.error) {
      setError("We could not start the verification challenge. Try again.");
      setBusy(false);
      return;
    }

    const verification = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code,
    });

    if (verification.error) {
      setError("That code was not accepted. Check the app and try again.");
      setBusy(false);
      return;
    }

    setMode("complete");
    window.location.assign(returnTo);
  }

  if (mode === "loading") {
    return (
      <div className="notice" role="status">
        Checking your second-factor status…
      </div>
    );
  }

  if (mode === "complete") {
    return (
      <div className="surface surface-pad stack">
        <h2 className="section-title">
          {accountVariant
            ? "Authenticator protection active"
            : "Strong session confirmed"}
        </h2>
        <p className="text-muted m-0">
          {accountVariant
            ? "This session has strong multi-factor protection."
            : "This session has the AAL2 protection required for staff operations."}
        </p>
        <a className="button w-fit" href={returnTo}>
          {accountVariant ? "Return to account" : "Continue to admin"}
        </a>
      </div>
    );
  }

  return (
    <div className="surface surface-pad stack-lg">
      {error ? (
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      ) : null}

      {mode === "enrol" ? (
        <>
          <div className="stack">
            <h2 className="section-title">Set up an authenticator app</h2>
            <p className="text-muted m-0">
              Use a TOTP authenticator such as 1Password, Google Authenticator,
              Microsoft Authenticator or Authy. SalaryPadi never receives the
              codes generated by the app until you submit one here.
            </p>
          </div>
          <button
            className="button w-fit"
            type="button"
            disabled={busy}
            onClick={startEnrolment}
          >
            {busy ? "Starting…" : "Start secure setup"}
          </button>
        </>
      ) : (
        <form className="stack-lg" onSubmit={verifyCode}>
          {qrCode ? (
            <div className="stack">
              <h2 className="section-title">Scan this QR code</h2>
              <Image
                alt="SalaryPadi authenticator enrolment QR code"
                height={200}
                src={qrCode}
                unoptimized
                width={200}
              />
              {secret ? (
                <details>
                  <summary>Use a setup key instead</summary>
                  <p className="font-mono text-sm break-all">{secret}</p>
                </details>
              ) : null}
            </div>
          ) : (
            <div className="stack">
              <h2 className="section-title">Verify your authenticator code</h2>
              <p className="text-muted m-0">
                Enter the current code from the authenticator app already linked
                to this account.
              </p>
            </div>
          )}

          <div className="field">
            <label htmlFor="totp-code">Authenticator code</label>
            <input
              className="input"
              id="totp-code"
              name="code"
              type="text"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={8}
              pattern="[0-9]{6,8}"
              required
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, "").slice(0, 8))
              }
            />
          </div>
          <button className="button w-fit" type="submit" disabled={busy}>
            {busy ? "Verifying…" : "Verify and continue"}
          </button>
        </form>
      )}
    </div>
  );
}
