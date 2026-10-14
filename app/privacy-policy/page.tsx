import PolicyDocument from "../legal/policy-document";
export const metadata = {
  title: "Privacy policy | Fisemarco",
  description:
    "Privacy policy for Fisemarco Passport and Cybersphere. Version 2026-10-04, draft for review.",
};
export default function Page() {
  return <PolicyDocument policyKey="privacy-policy" />;
}
