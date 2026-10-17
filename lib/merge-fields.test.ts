import { describe, expect, it } from "vitest";

import { listMissingMergeFields, renderMerge } from "@/lib/merge-fields";

describe("renderMerge", () => {
  it("matches keys ignoring case, spaces, underscores, and dashes", () => {
    const fields = { "First Name": "Sam" };
    expect(renderMerge("Hi {{first_name}}", fields)).toBe("Hi Sam");
    expect(renderMerge("Hi {{firstName}}", fields)).toBe("Hi Sam");
    expect(renderMerge("Hi {{first-name}}", fields)).toBe("Hi Sam");
  });

  it("uses the fallback when the value is missing or empty", () => {
    expect(renderMerge("Hi {{firstName|there}}", {})).toBe("Hi there");
    expect(renderMerge("Hi {{firstName|there}}", { firstName: "  " })).toBe("Hi there");
  });

  it("uses an empty string when there is no fallback", () => {
    expect(renderMerge("Hi {{firstName}}", {})).toBe("Hi ");
  });

  it("escapes values inserted into HTML", () => {
    expect(renderMerge("<p>{{name}}</p>", { name: `Sam & <Lee> "'` }, { html: true })).toBe(
      "<p>Sam &amp; &lt;Lee&gt; &quot;&#39;</p>",
    );
  });

  it("warns only for fields with no column and no fallback", () => {
    expect(listMissingMergeFields(["Hi {{firstName|there}} {{company}}"], ["first_name"])).toEqual(["company"]);
  });
});
