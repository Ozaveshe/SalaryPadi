"use client";

import { useEffect, useState } from "react";

import {
  contributionDraftDeleteResponseSchema,
  contributionDraftResponseSchema,
  type ContributionDraft,
} from "@/lib/contributions/draft-contract";

const DRAFT_REQUEST_TIMEOUT_MS = 8_000;
import type { ContributionKind } from "@/lib/contributions/schemas";
import { discardResponseBody } from "@/lib/http/body";
import { readBoundedJson } from "@/lib/http/json";

const DRAFT_RESPONSE_MAX_BYTES = 70_000;

function applyDraft(
  form: HTMLFormElement,
  payload: ContributionDraft["payload"],
) {
  for (const [name, value] of Object.entries(payload)) {
    const controls = form.elements.namedItem(name);
    if (!controls) continue;
    if (controls instanceof RadioNodeList) {
      controls.value = String(value);
      continue;
    }
    if (
      controls instanceof HTMLInputElement ||
      controls instanceof HTMLTextAreaElement ||
      controls instanceof HTMLSelectElement
    ) {
      if (controls instanceof HTMLInputElement && controls.type === "checkbox")
        controls.checked = value === true || value === "on";
      else controls.value = String(value);
    }
  }
}

function serialiseForm(form: HTMLFormElement) {
  const payload: Record<string, string | string[]> = {};
  for (const [key, value] of new FormData(form).entries()) {
    if (typeof value !== "string") continue;
    const current = payload[key];
    payload[key] = current
      ? [...(Array.isArray(current) ? current : [current]), value]
      : value;
  }
  return payload;
}

export function DraftControls({
  formId,
  kind,
}: {
  formId: string;
  kind: ContributionKind;
}) {
  const [message, setMessage] = useState("Checking for a private draft…");

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/contributions/drafts?kind=${kind}`, {
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      signal: AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(DRAFT_REQUEST_TIMEOUT_MS),
      ]),
    })
      .then(async (response) => {
        if (!response.ok) {
          await discardResponseBody(response);
          throw new Error("draft unavailable");
        }
        const body = await readBoundedJson(response, DRAFT_RESPONSE_MAX_BYTES);
        return contributionDraftResponseSchema.parse(body);
      })
      .then(({ draft }) => {
        const form = document.getElementById(formId);
        if (form instanceof HTMLFormElement && draft) {
          applyDraft(form, draft.payload);
          setMessage("Private draft restored on this form.");
        } else {
          setMessage("No saved draft.");
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setMessage("Draft storage is unavailable; the form is still usable.");
      });
    return () => controller.abort();
  }, [formId, kind]);

  async function saveDraft() {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;
    setMessage("Saving private draft…");
    try {
      const response = await fetch("/api/contributions/drafts", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, payload: serialiseForm(form) }),
        redirect: "error",
        signal: AbortSignal.timeout(DRAFT_REQUEST_TIMEOUT_MS),
      });
      const saved = response.ok;
      await discardResponseBody(response);
      setMessage(
        saved
          ? "Private draft saved for up to 90 days."
          : "Draft was not saved; your form remains unchanged.",
      );
    } catch {
      setMessage("Draft storage is unavailable; your form remains unchanged.");
    }
  }

  async function deleteDraft() {
    try {
      const response = await fetch(`/api/contributions/drafts?kind=${kind}`, {
        method: "DELETE",
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
        signal: AbortSignal.timeout(DRAFT_REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        await discardResponseBody(response);
        setMessage("Draft could not be deleted.");
        return;
      }
      const body = await readBoundedJson(response, DRAFT_RESPONSE_MAX_BYTES);
      const result = contributionDraftDeleteResponseSchema.parse(body);
      setMessage(
        result.deleted ? "Private draft deleted." : "No saved draft was found.",
      );
    } catch {
      setMessage("Draft storage is unavailable; the draft was not deleted.");
    }
  }

  return (
    <div className="draft-controls">
      <div className="cluster">
        <button
          className="button button-secondary"
          type="button"
          onClick={() => void saveDraft()}
        >
          Save private draft
        </button>
        <button
          className="button button-quiet"
          type="button"
          onClick={() => void deleteDraft()}
        >
          Delete draft
        </button>
      </div>
      <p className="field-help m-0" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
