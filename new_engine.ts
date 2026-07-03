export interface LifecycleStage {
  id: string; // "upcoming", "recruiting", "production", "shipping", "completed", "closed"
  name: string;
}

export interface HeroPresentation {
  title: string; // The title above the card, e.g. "ACTIVE GROUP" or "CURRENTLY IN PRODUCTION"
  headline: string; // e.g. batchName or "Production Has Started"
  subheadline: string;
  badgeText: string;
  badgeStyle: "pulsing-gold" | "red" | "gold-static" | "green";
  buttonText: string;
  buttonAction: "JOIN_BATCH" | "TRACK_BATCH" | "VIEW_GALLERY" | "CREATE_OWN";
  showCountdown: boolean;
  showProgress: boolean;
  productionPhase?: string;
  productionDescription?: string;
}

// ...
