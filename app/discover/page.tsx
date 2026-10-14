import Discover from "./discovery-client";
export const metadata = {
  title: "Discover public agents · Fisemarco",
  description:
    "Explore public agent listings with source provenance and a clear path to agent-controlled identity.",
};
export default function Page() {
  return <Discover />;
}
