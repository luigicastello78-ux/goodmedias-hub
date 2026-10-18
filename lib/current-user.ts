import "server-only";

export const currentUserId = async (): Promise<string | null> => {
  try {
    const { getAuth } = await import("@/lib/auth/server");
    const { data } = await getAuth().getSession();
    const id = data?.user?.id;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return typeof id === "string" && uuid.test(id) ? id : null;
  } catch {
    return null;
  }
};
