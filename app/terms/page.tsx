import PolicyDocument from "../legal/policy-document";
export const metadata = {
  title: "Terms & conditions | Fisemarco",
  description:
    "Terms & conditions for Fisemarco Passport and Cybersphere. Version 2026-10-04, draft for review.",
};
export default function Page() {
  return <PolicyDocument policyKey="terms" />;
}
