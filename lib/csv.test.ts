import { describe, expect, it } from "vitest";

import { parseCsvText } from "@/lib/csv";

describe("parseCsvText", () => {
  it("keeps quoted commas inside a cell", () => {
    const result = parseCsvText('email,company\n"sam@contoso.com","Contoso, Inc"\n');
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.rows).toEqual([{ email: "sam@contoso.com", company: "Contoso, Inc" }]);
  });

  it("accepts a semicolon delimiter", () => {
    const result = parseCsvText("email;firstName\nsam@contoso.com;Sam\n");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.headers).toEqual(["email", "firstName"]);
    expect(result.rows[0]).toEqual({ email: "sam@contoso.com", firstName: "Sam" });
  });

  it("strips a UTF-8 BOM and accepts CRLF", () => {
    const result = parseCsvText("\uFEFFemail,firstName\r\nsam@contoso.com,Sam\r\n");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.headers[0]).toBe("email");
    expect(result.rows).toEqual([{ email: "sam@contoso.com", firstName: "Sam" }]);
  });

  it("drops empty lines", () => {
    const result = parseCsvText("email,firstName\n\nsam@contoso.com,Sam\n\n");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.rows).toHaveLength(1);
  });

  it("rejects duplicate headers", () => {
    const result = parseCsvText("email,email\nsam@contoso.com,other@contoso.com\n");
    expect(result).toEqual({
      ok: false,
      message: 'The column "email" appears more than once.',
    });
  });

  it("uses the campaign row cap by default", () => {
    const lines = ["email", ...Array.from({ length: 1001 }, (_, index) => `person${index}@contoso.com`)];
    const result = parseCsvText(lines.join("\n"));
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.message).toContain("1000");
  });
});
