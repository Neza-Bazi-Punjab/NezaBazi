/* The 2026 championship photos used by the home, Champions and Gallery
   pages. The files in public/images/2026/ are web copies of Mani's photos
   (the logo-free copies where one exists), at most 2400 px on the long side
   with the camera metadata removed; next/image serves each at the size the
   screen needs. Width and height are the files' own, so every photo keeps
   its shape. */
export type Photo = { src: string; width: number; height: number; alt: string };

const EVENT = "Neza Bazi Punjab Championship 2026, Amritsar";

const photo = (file: string, width: number, height: number, alt = EVENT): Photo => ({
  src: `/images/2026/${file}.jpg`,
  width,
  height,
  alt,
});

export const photos = {
  hero: photo("IMG_3592-hero", 1320, 1632, "A rider carries the peg at full gallop"),
  trophies: photo("trophies", 1320, 1742, "The 2026 trophies"),
  groupPhoto: photo(
    "1st_place_team_groupphoto",
    2400,
    1800,
    "The winning team with riders and organisers at the prize-giving"
  ),
  replayPoster: photo("DSC01232", 2400, 1800, ""),
  bhai_sukhbir_singh: photo("bhai_sukhbir_singh", 1200, 1500),
  solos_podium: photo("solos_podium", 2400, 1800, "The solo podium at the prize-giving"),
  jasveer_singh1: photo("jasveer_singh1", 1200, 1500),
  DSC01442: photo("DSC01442", 1968, 1730),
  gursewak_dotcom: photo("gursewak_dotcom", 1800, 2400),
  DSC01198: photo("DSC01198", 2400, 1800),
  live_camera: photo("live_camera", 1800, 2400),
  firstTeam: photo(
    "1st_place_team",
    2400,
    1800,
    "Dal Baba Bidhi Chand Sahib with the 1st place trophy"
  ),
  secondTeam: photo(
    "2nd_place_team",
    2400,
    1800,
    "Punjab Armed Police with the 2nd place trophy"
  ),
  thirdTeam: photo("3rd_place_team", 2400, 1800, "Jangi Horse Club with the 3rd place trophy"),
  // The same photo as the hero, from its logo-free copy.
  IMG_3592: photo("IMG_3592-hero", 1320, 1632),
  DSC01234: photo("DSC01234", 2400, 1800),
  IMG_8905: photo("IMG_8905", 1920, 2400),
  DSC00494: photo("DSC00494", 1800, 2400),
  IMG_3593: photo("IMG_3593", 1320, 1628),
  firstTrophy: photo("1st_place_trophy", 1320, 1753),
  IMG_8894: photo("IMG_8894", 1920, 2400),
  nbp_media_panel: photo("nbp_media_panel", 1200, 1500),
  IMG_8881: photo("IMG_8881", 2400, 1800),
  IMG_8904: photo("IMG_8904", 1920, 2400),
  main_ref: photo("main_ref", 1920, 2400),
  IMG_3317: photo("IMG_3317", 1320, 2223),
  participation_medals: photo("participation_medals", 1320, 1727),
  DSC01285: photo("DSC01285", 2400, 1800),
  IMG_8901: photo("IMG_8901", 1200, 1500),
  stream_setup: photo("stream_setup", 1920, 2400),
  DSC01445: photo("DSC01445", 2400, 1800),
  DSC01187: photo("DSC01187", 2400, 1800),
  IMG_8883: photo("IMG_8883", 2400, 1800),
} satisfies Record<string, Photo>;

/* The home page's sideways photo strip, in order. */
export const homeStrip: Photo[] = [
  photos.bhai_sukhbir_singh,
  photos.solos_podium,
  photos.jasveer_singh1,
  photos.DSC01442,
  photos.gursewak_dotcom,
  photos.DSC01198,
  photos.live_camera,
];

/* The Gallery page, in reading order: the draft's default list of 28, then
   one more (galleryEvener) that fills the short left column so the bottom of
   the grid lines up. */
export const galleryPhotos: Photo[] = [
  photos.IMG_3592,
  photos.bhai_sukhbir_singh,
  photos.DSC01234,
  photos.trophies,
  photos.IMG_8905,
  photos.live_camera,
  photos.groupPhoto,
  photos.DSC00494,
  photos.jasveer_singh1,
  photos.IMG_3593,
  photos.solos_podium,
  photos.gursewak_dotcom,
  photos.DSC01442,
  photos.firstTrophy,
  photos.IMG_8894,
  photos.nbp_media_panel,
  photos.IMG_8881,
  photos.IMG_8904,
  photos.main_ref,
  photos.secondTeam,
  photos.IMG_3317,
  photos.participation_medals,
  photos.DSC01285,
  photos.IMG_8901,
  photos.thirdTeam,
  photos.stream_setup,
  photos.DSC01445,
  photos.DSC01187,
  photos.IMG_8883,
];

/* The last gallery photo, added to even out the 4- and 2-column layouts. The
   3-column layout is already even without it, so it is left out there (it
   still opens in the viewer). */
export const galleryEvener = photos.IMG_8883;
