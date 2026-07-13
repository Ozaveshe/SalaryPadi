import { describe, expect, it } from "vitest";

import { buildWhatsAppShareUrl } from "./whatsapp";

describe("WhatsApp sharing", () => {
  it("encodes the complete message for the shared wa.me mechanism", () => {
    const url = buildWhatsAppShareUrl(
      "Help others see real salaries — https://salarypadi.com/contribute/salary",
    );
    expect(url).toBe(
      "https://wa.me/?text=Help%20others%20see%20real%20salaries%20%E2%80%94%20https%3A%2F%2Fsalarypadi.com%2Fcontribute%2Fsalary",
    );
  });
});
