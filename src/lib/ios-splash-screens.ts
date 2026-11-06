/* iPhone launch images: what an iPhone shows for the moment between tapping
   the home-screen icon and the page arriving (otherwise a black, then white,
   screen). Each is a picture of the bronze splash (src/components/AppSplash.tsx)
   at one iPhone screen size; iPhone only uses an image that matches its
   screen exactly, so every current size is listed.

   Used by src/app/layout.tsx (the <link rel="apple-touch-startup-image">
   tags) and scripts/make-ios-splash.mjs (which makes the images).
   iPhone saves these when the app is added to the home screen, so a phone
   that added it earlier must remove and re-add it to get them.
   iOS 26 ignores them (in the iOS 26.5 simulator it never even downloads
   them); they are for iPhones on older iOS. */

export type IosSplashScreen = {
  /* Screen size in CSS pixels (points), portrait. */
  width: number;
  height: number;
  /* Device pixel ratio. */
  ratio: 2 | 3;
  /* Example phones, for whoever updates the list. */
  phones: string;
};

export const IOS_SPLASH_SCREENS: IosSplashScreen[] = [
  { width: 320, height: 568, ratio: 2, phones: "iPhone SE (1st gen), 5s" },
  { width: 375, height: 667, ratio: 2, phones: "iPhone SE (2nd/3rd gen), 6, 7, 8" },
  { width: 414, height: 736, ratio: 3, phones: "iPhone 6/7/8 Plus" },
  { width: 375, height: 812, ratio: 3, phones: "iPhone X, XS, 11 Pro, 12/13 mini" },
  { width: 414, height: 896, ratio: 2, phones: "iPhone XR, 11" },
  { width: 414, height: 896, ratio: 3, phones: "iPhone XS Max, 11 Pro Max" },
  { width: 390, height: 844, ratio: 3, phones: "iPhone 12, 13, 14, 16e" },
  { width: 428, height: 926, ratio: 3, phones: "iPhone 12/13 Pro Max, 14 Plus" },
  { width: 393, height: 852, ratio: 3, phones: "iPhone 14 Pro, 15, 15 Pro, 16" },
  { width: 430, height: 932, ratio: 3, phones: "iPhone 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus" },
  { width: 402, height: 874, ratio: 3, phones: "iPhone 16 Pro, 17, 17 Pro" },
  { width: 420, height: 912, ratio: 3, phones: "iPhone Air" },
  { width: 440, height: 956, ratio: 3, phones: "iPhone 16 Pro Max, 17 Pro Max" },
];

export const iosSplashFile = ({ width, height, ratio }: IosSplashScreen) =>
  `/splash/iphone-${width}x${height}@${ratio}x.png`;

export const iosSplashMedia = ({ width, height, ratio }: IosSplashScreen) =>
  `screen and (device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`;
