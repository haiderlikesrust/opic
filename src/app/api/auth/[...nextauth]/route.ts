import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";

const bypassPayment = process.env.BYPASS_PAYMENT === "true";

export const authOptions = {
  providers: [
    ...(bypassPayment
      ? [
          CredentialsProvider({
            id: "dev",
            name: "Dev bypass (no wallet)",
            credentials: {
              dev: { label: "Dev", type: "text", placeholder: "any" },
            },
            async authorize() {
              let user = await prisma.user.findFirst({
                where: { walletAddress: "dev-bypass" },
              });
              if (!user) {
                user = await prisma.user.create({
                  data: {
                    walletAddress: "dev-bypass",
                    name: "Dev User",
                  },
                });
              }
              return {
                id: user.id,
                email: user.email ?? undefined,
                name: user.name ?? undefined,
                image: null,
                walletAddress: "dev-bypass",
              };
            },
          }),
        ]
      : []),
    CredentialsProvider({
      id: "wallet",
      name: "Solana Wallet",
      credentials: {
        wallet: { label: "Wallet", type: "text" },
      },
      async authorize(creds) {
        if (!creds?.wallet) return null;
        const wallet = (creds.wallet as string).trim();
        if (!wallet) return null;
        let user = await prisma.user.findFirst({ where: { walletAddress: wallet } });
        if (!user) {
          user = await prisma.user.create({
            data: { walletAddress: wallet, name: wallet.slice(0, 8) + "…" },
          });
        }
        return {
          id: user.id,
          email: user.email ?? undefined,
          name: user.name ?? undefined,
          image: null,
          walletAddress: user.walletAddress ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.walletAddress = (user as unknown as { walletAddress?: string }).walletAddress;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as unknown as { id: string; walletAddress?: string }).id = token.id as string;
        (session.user as unknown as { walletAddress?: string }).walletAddress = token.walletAddress as string | undefined;
      }
      return session;
    },
  },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/dashboard" },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
