import {
  Baby, Bath, BedDouble, Car, Clock, ConciergeBell, Coffee, Crown, Dog, Dumbbell, Flower2, Gem, Heart, Leaf, Map, Mountain, Music,
  Palmtree, Plane, Shield, Ship, Sparkles, Star, Sun, Tv, UtensilsCrossed, Waves, Wifi, Wine, type LucideIcon,
} from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
  sparkles: Sparkles, waves: Waves, utensils: UtensilsCrossed, wine: Wine, flower: Flower2, dumbbell: Dumbbell, car: Car, plane: Plane, wifi: Wifi,
  concierge: ConciergeBell, bed: BedDouble, bath: Bath, sun: Sun, mountain: Mountain, palmtree: Palmtree, heart: Heart, gem: Gem, crown: Crown, coffee: Coffee,
  music: Music, baby: Baby, dog: Dog, shield: Shield, leaf: Leaf, ship: Ship, map: Map, clock: Clock, star: Star, tv: Tv,
};

export function Icon({ name, className, strokeWidth = 1.2 }: { name: string; className?: string; strokeWidth?: number }) {
  const C = MAP[name] ?? Sparkles;
  return <C className={className} strokeWidth={strokeWidth} aria-hidden />;
}
export const ICON_NAMES = Object.keys(MAP);
