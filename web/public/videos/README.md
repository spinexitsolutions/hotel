# Hero background video

The home page hero plays `hero-1080p.mp4` (desktop) and `hero-720p.mp4` (phones) from this folder.
Until those files exist, the hero shows its poster image and the image slideshow, so the site never breaks.
You can also paste any https video URL into **Admin → Pages → Home → Cinematic hero**.

## 1. Choose licensed footage

Use only footage whose licence allows commercial use on a website, for example:

| Source | Licence | Search for |
|---|---|---|
| [Pexels Videos](https://www.pexels.com/search/videos/luxury%20hotel/) | [Pexels License](https://www.pexels.com/license/) (free, commercial, no attribution) | luxury hotel, hotel lobby, infinity pool, hotel suite |
| [Pixabay Videos](https://pixabay.com/videos/search/luxury%20hotel/) | [Pixabay Content License](https://pixabay.com/service/license-summary/) | luxury hotel, resort pool |
| [Mixkit](https://mixkit.co/free-stock-video/hotel/) | [Mixkit Stock Video Free License](https://mixkit.co/license/#videoFree) | hotel, resort |
| [Coverr](https://coverr.co/s?q=hotel) | [Coverr License](https://coverr.co/license) | hotel, resort |

Pick (or edit together) 20–40 s of slow, steady shots: exterior at dusk, the lobby, a suite, the pool, the restaurant.
Download the **1920×1080** or **3840×2160** file and check every frame: no watermark, logos, burned-in text or people
facing the camera (they would need a model release). Keep the licence page URL and download date with your records.

## 2. Encode for the web (ffmpeg)

```bash
# Desktop: 1080p H.264, no audio, fast start (moov atom first so playback starts before the download ends)
ffmpeg -i source.mp4 -an -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080" \
  -c:v libx264 -profile:v high -preset slow -crf 23 -pix_fmt yuv420p -movflags +faststart hero-1080p.mp4

# Optional 4K master (only if the source is 4K; much larger file)
ffmpeg -i source.mp4 -an -vf "scale=3840:2160" -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p -movflags +faststart hero-2160p.mp4

# Phones: 720p, smaller file
ffmpeg -i source.mp4 -an -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720" \
  -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart hero-720p.mp4

# Optional WebM (VP9) for smaller desktop downloads
ffmpeg -i source.mp4 -an -vf "scale=1920:1080" -c:v libvpx-vp9 -b:v 0 -crf 33 -row-mt 1 hero-1080p.webm

# Poster: the first frame, so there is no visible jump when the video starts
ffmpeg -i hero-1080p.mp4 -frames:v 1 -q:v 2 hero-poster.jpg
```

Targets: about 8–15 MB for 1080p and 3–6 MB for 720p. Upload `hero-poster.jpg` through the media library and set it
as the hero's **Poster image**, and use the **Video focal point** setting to keep the main subject in frame on phones.

Use a new file name (e.g. `hero-1080p-v2.mp4`) when you replace a video: files here are cached for a year.
