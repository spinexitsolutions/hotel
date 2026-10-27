import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SECTION_REGISTRY } from '@aurelle/shared';
import { HeroSection } from '@/sections/Hero';

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof IntersectionObserver;
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = vi.fn();
});

afterEach(cleanup);

const hero = (props: Record<string, unknown>) => SECTION_REGISTRY.hero.schema.parse({
  slides: [{ image: 'https://images.unsplash.com/photo-1', heading: 'A palace on the water' }], showBookingBar: false, ...props,
});

const renderHero = (props: Record<string, unknown>) =>
  render(<MemoryRouter><HeroSection props={hero(props)} first /></MemoryRouter>);

describe('HeroSection', () => {
  it('plays a muted, looping, inline, control-less cover video', () => {
    const { container } = renderHero({ videoUrl: '/videos/hero-1080p.mp4', focus: 'bottom' });
    const video = container.querySelector('video')!;
    expect(video).toBeInTheDocument();
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.autoplay).toBe(true);
    expect(video.hasAttribute('playsinline')).toBe(true);
    expect(video.controls).toBe(false);
    expect(video).toHaveClass('object-cover', 'object-[50%_78%]');
    expect(video.querySelector('source[type="video/mp4"]')).toHaveAttribute('src', '/videos/hero-1080p.mp4');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('A palace on the water');
  });

  it('lets visitors pause the background video', () => {
    renderHero({ videoUrl: '/videos/hero-1080p.mp4' });
    fireEvent.click(screen.getByRole('button', { name: 'Pause background video' }));
    expect(screen.getByRole('button', { name: 'Play background video' })).toBeInTheDocument();
  });

  it('falls back to the image slideshow when the video fails or is not set', () => {
    const { container } = renderHero({ videoUrl: '/videos/missing.mp4' });
    fireEvent.error(container.querySelector('source')!);
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('img')).toHaveAttribute('src', expect.stringContaining('photo-1'));

    const { container: noVideo } = renderHero({});
    expect(noVideo.querySelector('video')).toBeNull();
  });
});
