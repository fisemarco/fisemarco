import Testnet from "./testnet";
export const metadata = {
  title: "Fisemarco Testnet",
  description:
    "Test agent identity, authority, one-use permits and revocation in an isolated namespace.",
};
export default function Page() {
  return <Testnet />;
}
