import StatsSeason, { seasonFromParam, seasonParams, statsMetadata } from "../StatsSeason";

/* /stats/<year>: that season, riders. Every listed season is built at deploy
   time; any other year is a 404. */
export const dynamicParams = false;
export function generateStaticParams() {
  return seasonParams();
}

type Props = { params: Promise<{ season: string }> };

export async function generateMetadata({ params }: Props) {
  return statsMetadata(seasonFromParam((await params).season), "riders");
}

export default async function StatsSeasonPage({ params }: Props) {
  return <StatsSeason year={seasonFromParam((await params).season)} view="riders" />;
}
