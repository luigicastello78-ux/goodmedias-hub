import { NextResponse, type NextRequest } from "next/server";

import { getAuth } from "@/lib/auth/server";

const proxy = (request: NextRequest) => {
  try {
    return getAuth().middleware({ loginUrl: "/auth/sign-in" })(request);
  } catch {
    return NextResponse.next();
  }
};

export default proxy;

export const config = {
  matcher: ["/account/:path*"],
};
