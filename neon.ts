import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Declare your Neon services here.
  // AI Gateway stays off until the Neon project is on a paid plan. `neon deploy`
  // refuses to apply this file while `aiGateway` is true on the Free plan.
  auth: true,
  aiGateway: false,
  functions: {
    hello: { name: "Hello World", source: "./hello.ts" },
  },
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: "7d" };
    }
    // Existing branch: no changes
    return {};
  },
});
