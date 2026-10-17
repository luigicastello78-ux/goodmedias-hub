import { getAuth } from "@/lib/auth/server";

const proxy = getAuth().middleware({ loginUrl: "/auth/sign-in" });

export default proxy;

export const config = {
  matcher: ["/account/:path*"],
};
