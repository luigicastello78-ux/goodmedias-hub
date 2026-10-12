import Link from "next/link";

const HomePage = () => {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-3 p-8">
      <h2 className="text-lg font-semibold">goodmedias hub</h2>
      <p className="text-sm text-muted-foreground">The inbox is the home view for this workspace.</p>
      <Link href="/inbox" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
        Open inbox
      </Link>
    </div>
  );
};

export default HomePage;
