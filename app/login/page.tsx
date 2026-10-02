import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import AuthForm from "@/components/AuthForm";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "ADMIN" ? "/admin" : "/dashboard");
  return (
    <main className="auth-shell">
      <section className="auth-hero">
        <div className="auth-logo">PI</div>
        <h1>Product importing without the spreadsheet chaos.</h1>
        <p>Import product facts, create original SEO content, manage connected stores and send reviewed products to Shopify as drafts.</p>
        <div className="security-points"><span>Protected user accounts</span><span>Encrypted Shopify tokens</span><span>Draft-first publishing</span></div>
      </section>
      <section className="auth-card">
        <div className="auth-card-inner">
          <span className="eyebrow">WELCOME BACK</span>
          <h2>Sign in to your workspace</h2>
          <p className="muted">Your products and stores are isolated to your account.</p>
          <AuthForm mode="login" />
          <p className="auth-switch">New here? <Link href="/register">Create an account</Link></p>
        </div>
      </section>
    </main>
  );
}
