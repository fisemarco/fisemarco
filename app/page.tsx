import PublicSite from "./public-site";
import PassportApp from "./passport-app";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  if (q.view === "network" || q.create === "1") return <PassportApp />;
  return <PublicSite />;
}
