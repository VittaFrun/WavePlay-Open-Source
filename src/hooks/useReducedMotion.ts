import { useSystemReducedMotion } from './useSystemReducedMotion';
import { useAppearance } from '../providers/AppearanceProvider';

export function useReducedMotion() {
  const { reduceMotion } = useAppearance();
  const system=useSystemReducedMotion();
  return reduceMotion || system;
}
