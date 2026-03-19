import AuthForm from "@/components/AuthForm";

export const metadata = {
  title: "Sign In or Sign Up — PortfolioIQ",
};

export default function AuthPage() {
  return <AuthForm defaultMode="signin" />;
}
