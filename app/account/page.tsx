import { getAuth } from "@/lib/auth/server";

const AccountPage = async () => {
  const { data: session, error } = await getAuth().getSession();
  const user = session?.user;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error.message ?? "The session could not be read."}
        </p>
      ) : null}
      {user ? (
        <p className="text-sm text-muted-foreground">
          Signed in as {user.email}. This session comes from Neon Auth.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">No Neon Auth session is active.</p>
      )}
    </main>
  );
};

export default AccountPage;
