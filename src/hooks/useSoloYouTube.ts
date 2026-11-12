import { useSyncExternalStore } from 'react';
import { getSoloYouTubeStatus, subscribeSoloYouTube } from '../services/soloYouTube';
export const useSoloYouTube=()=>useSyncExternalStore(subscribeSoloYouTube,getSoloYouTubeStatus,getSoloYouTubeStatus);
