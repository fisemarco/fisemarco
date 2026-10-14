import PolicyDocument from "../legal/policy-document";
export const metadata = {
  title: "Cookie policy | Fisemarco",
  description:
    "Cookie policy for Fisemarco Passport and Cybersphere. Version 2026-10-13, draft for review.",
};
export default function Page() {
  return <PolicyDocument policyKey="cookies" />;
}
