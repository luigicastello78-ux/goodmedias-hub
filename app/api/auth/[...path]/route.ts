import { getAuth } from "@/lib/auth/server";

export const { GET, POST, PUT, DELETE, PATCH } = getAuth().handler();
