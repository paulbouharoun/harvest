import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import Experience from "@/components/Experience";
import Surveying from "@/components/Surveying";
import type { Harvest } from "@/lib/types";
import { HarvestError, USERNAME_RE, getHarvest, parseYear } from "@/lib/github";

export async function generateMetadata({ params, searchParams }: PageProps<"/[user]">): Promise<Metadata> {
  const { user } = await params;
  const year = parseYear((await searchParams).year);
  if (!USERNAME_RE.test(user)) return {};
  const q = year ? `?year=${year}` : "";
  const title = `@${user}'s year in code · Harvest`;
  return {
    title,
    openGraph: { title, images: [{ url: `/card/${user}${q}`, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, images: [`/card/${user}${q}`] },
  };
}

async function Field({ params, searchParams }: PageProps<"/[user]">) {
  await connection();
  const { user } = await params;
  const year = parseYear((await searchParams).year);
  let harvest: Harvest;
  try {
    harvest = await getHarvest(user, year);
  } catch (e) {
    if (e instanceof HarvestError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  const now = new Date().getUTCFullYear();
  return <Experience harvest={harvest} years={[now, now - 1, now - 2]} />;
}

export default function Page(props: PageProps<"/[user]">) {
  return (
    <Suspense fallback={<Surveying />}>
      <Field {...props} />
    </Suspense>
  );
}
