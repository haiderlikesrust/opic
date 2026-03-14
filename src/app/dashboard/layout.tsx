"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";

const nav = [
  { href: "/dashboard", label: "Agents" },
  { href: "/dashboard/create", label: "Create agent" },
  { href: "/dashboard/billing", label: "Billing" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { publicKey, connected } = useWallet();
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSignIn = async () => {
    if (connected && publicKey) {
      await signIn("wallet", {
        wallet: publicKey.toBase58(),
        redirect: false,
        callbackUrl: "/dashboard",
      });
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_15%_-5%,rgba(34,211,166,0.12),transparent_34%),radial-gradient(circle_at_85%_-10%,rgba(84,168,255,0.16),transparent_36%),linear-gradient(180deg,#060a14_0%,#040814_55%,#030611_100%)] text-[var(--oracle-text)]">
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(138,144,165,0.35)_1px,transparent_1px),linear-gradient(90deg,rgba(138,144,165,0.35)_1px,transparent_1px)] [background-size:40px_40px]" />
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b1120]/72 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-2">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image
              src="/oracle-logo.svg"
              alt="Opic"
              width={32}
              height={32}
              className="h-8 w-8"
            />
            <span className="font-mono text-lg font-semibold tracking-wide text-[var(--oracle-accent)]">
              Opic
            </span>
          </Link>
          <nav className="flex items-center gap-1 rounded-xl border border-white/10 bg-[#0f172a]/60 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            {nav.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  (href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href))
                    ? "bg-white/8 text-[var(--oracle-accent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    : "text-[var(--oracle-muted)] hover:text-[var(--oracle-text)]"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {status === "loading" ? (
              <span className="text-sm text-[var(--oracle-muted)]">Loading…</span>
            ) : session ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0f172a]/65 px-2.5 py-1.5 text-sm hover:border-[var(--oracle-accent)]/45"
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--oracle-border)] text-xs font-semibold text-[var(--oracle-text)]">
                    {((session.user as unknown as { walletAddress?: string })?.walletAddress ?? "U").slice(0, 1)}
                  </span>
                  <span className="text-[var(--oracle-muted)]">
                    {(session.user as unknown as { walletAddress?: string })?.walletAddress?.slice(0, 6)}…
                  </span>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 z-30 mt-2 w-44 rounded-xl border border-white/10 bg-[#0f172a] p-1 shadow-2xl">
                    <Link
                      href="/dashboard"
                      onClick={() => setMenuOpen(false)}
                      className="block rounded-md px-3 py-2 text-sm text-[var(--oracle-muted)] hover:bg-[var(--oracle-border)] hover:text-[var(--oracle-text)]"
                    >
                      Profile
                    </Link>
                    <button
                      type="button"
                      onClick={() => signOut({ callbackUrl: "/dashboard" })}
                      className="block w-full rounded-md px-3 py-2 text-left text-sm text-[var(--oracle-muted)] hover:bg-[var(--oracle-border)] hover:text-[var(--oracle-text)]"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                {mounted ? (
                  <WalletMultiButton />
                ) : (
                  <button type="button" className="wallet-adapter-button" disabled>
                    Select Wallet
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSignIn}
                  className="rounded-xl bg-gradient-to-r from-[var(--oracle-accent)] to-[#53abff] px-3 py-1.5 text-sm font-semibold text-[#041018] hover:brightness-105"
                >
                  Sign in with wallet
                </button>
                {process.env.NEXT_PUBLIC_BYPASS_PAYMENT === "true" && (
                  <button
                    type="button"
                    onClick={() => signIn("dev", { callbackUrl: "/dashboard" })}
                    className="rounded-lg border border-amber-500/50 px-3 py-1.5 text-sm text-amber-400 hover:bg-amber-500/10"
                  >
                    Sign in (dev bypass)
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </header>
      <main className="relative mx-auto w-full max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
