"use client";

import { useEffect, useState } from "react";

import type { ContributionKind } from "@/lib/contributions/schemas";

type DraftEnvelope = {
  payload?: Record<string, string | number | boolean | string[]>;
};

function applyDraft(form: HTMLFormElement, payload: DraftEnvelope["payload"]) {
  if (!payload) return;
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
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("draft unavailable");
        return (await response.json()) as { draft: DraftEnvelope | null };
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
    const response = await fetch("/api/contributions/drafts", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, payload: serialiseForm(form) }),
    });
    setMessage(
      response.ok
        ? "Private draft saved for up to 90 days."
        : "Draft was not saved; your form remains unchanged.",
    );
  }

  async function deleteDraft() {
    const response = await fetch(`/api/contributions/drafts?kind=${kind}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    setMessage(
      response.ok ? "Private draft deleted." : "Draft could not be deleted.",
    );
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
