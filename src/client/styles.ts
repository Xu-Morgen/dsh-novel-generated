/** I188 / design §14.34: sole style composition; theme and controls serve the entire desktop root. */
import { THEME_STYLES } from './styles/tokens.js';
import { CONTROLS_STYLES } from './styles/controls.js';
import { BASE_STYLES } from './styles/base.js';
import { NAVIGATION_STYLES } from './styles/navigation.js';
import { FORMS_STYLES } from './styles/forms.js';
import { CHAPTERS_STYLES } from './styles/chapters.js';
import { LAYERS_STYLES } from './styles/layers.js';
import { ONBOARDING_STYLES } from './styles/onboarding.js';
import { PANELS_STYLES } from './styles/panels.js';
import { RESPONSIVE_STYLES } from './styles/responsive.js';

export {
  CINNABAR, CINNABAR_DARK, GRID, RESPONSIVE_BREAKPOINT_COMPACT, RESPONSIVE_BREAKPOINT_NAV, SANS_STACK, SERIF_STACK,
} from './styles/tokens.js';

export const WORKBENCH_STYLES = `${THEME_STYLES}${CONTROLS_STYLES}${BASE_STYLES}${NAVIGATION_STYLES}${FORMS_STYLES}${CHAPTERS_STYLES}${LAYERS_STYLES}${ONBOARDING_STYLES}${PANELS_STYLES}${RESPONSIVE_STYLES}`;
