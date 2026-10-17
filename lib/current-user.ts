import "server-only";

export const currentUserId = async (): Promise<string | null> => {
  try {
    const { getAuth } = await import("@/lib/auth/server");
    const { data } = await getAuth().getSession();
    const id = data?.user?.id;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
};
