import PassportApp from "@/app/passport-app";
export default async function PassportPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <PassportApp initialCode={code} />;
}
