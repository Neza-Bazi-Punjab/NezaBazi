# Event Photography

Drop real photos into this folder using the filenames below, then replace the
matching `<ImagePlaceholder name="..." />` in the page with `next/image`:

```tsx
import Image from "next/image";

<Image src="/images/hero-rider.jpg" alt="..." width={900} height={1200} />
```

| Filename | Used on | Suggested shot |
| --- | --- | --- |
| `hero-rider.jpg` | Home hero | Rider at full charge (portrait, 3:4) |
| `about-sunset.jpg` | Home about section | Rider with lance at sunset (16:9) |
| `cta-charge.jpg` | Home CTA band | Full-gallop action (4:3) |
| `about-sport.jpg` | About page | Lance striking the peg (4:3) |
| `about-heritage.jpg` | About page | Riders in traditional dress (4:3) |
| `gallery-01.jpg` … `gallery-09.jpg` | Gallery grid | Mix of portrait (3:4) and landscape (4:3) |

Use JPEG around 1600px on the long edge for a good quality/size balance.
