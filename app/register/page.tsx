import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import AuthForm from "@/components/AuthForm";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  return (
    <main className="auth-shell">
      <section className="auth-hero">
        <div className="auth-logo">PI</div>
        <h1>Create your ecommerce content workspace.</h1>
        <p>Each account gets its own product drafts, activity history and connected Shopify stores.</p>
        <div className="security-points"><span>Hashed passwords</span><span>HttpOnly sessions</span><span>Per-user store isolation</span></div>
      </section>
      <section className="auth-card">
        <div className="auth-card-inner">
          <span className="eyebrow">CREATE ACCOUNT</span>
          <h2>Start a secure workspace</h2>
          <p className="muted">Use at least 10 characters for your password.</p>
          <AuthForm mode="register" />
          <p className="auth-switch">Already registered? <Link href="/login">Sign in</Link></p>
        </div>
      </section>
    </main>
  );
}
