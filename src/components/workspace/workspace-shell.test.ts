import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { WorkspaceShell, WorkspaceStat } from "./workspace-shell";

function renderShell(current: string) {
  return renderToStaticMarkup(
    createElement(
      WorkspaceShell,
      {
        current,
        title: "Overview",
        description: "Everything you are tracking.",
      },
      createElement("p", null, "body"),
    ),
  );
}

describe("workspace shell", () => {
  it("marks only the current section for assistive technology", () => {
    const markup = renderShell("/saved");
    const currentMatches = markup.match(/aria-current="page"/g) ?? [];
    expect(currentMatches).toHaveLength(1);
    expect(markup).toContain('href="/saved"');
    expect(markup).toContain("workspace-nav-link-current");
  });

  it("renders every workspace destination so navigation needs no JavaScript", () => {
    const markup = renderShell("/dashboard");
    for (const href of [
      "/dashboard",
      "/jobs",
      "/saved",
      "/applications",
      "/alerts",
      "/account/candidate-profile",
      "/account",
    ]) {
      expect(markup).toContain(`href="${href}"`);
    }
  });

  it("does not mark any section current for an unknown route", () => {
    const markup = renderShell("/not-a-workspace-route");
    expect(markup).not.toContain('aria-current="page"');
  });

  it("keeps a stat's number, label and qualifier together", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceStat, {
        value: 12,
        label: "Saved jobs",
        caption: "Roles you kept to review",
        href: "/saved",
      }),
    );
    expect(markup).toContain("12");
    expect(markup).toContain("Saved jobs");
    expect(markup).toContain("Roles you kept to review");
    expect(markup).toContain('href="/saved"');
  });
});
