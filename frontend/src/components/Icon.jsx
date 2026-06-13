// Central icon registry. All Font Awesome icons used anywhere in the app
// are imported here and exposed through a single <Icon name="..."/>
// component. Tree-shake friendly + terse call sites everywhere else.
import { library } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { faHouse } from '@fortawesome/free-solid-svg-icons/faHouse';
import { faClipboardList } from '@fortawesome/free-solid-svg-icons/faClipboardList';
import { faRulerCombined } from '@fortawesome/free-solid-svg-icons/faRulerCombined';
import { faDumbbell } from '@fortawesome/free-solid-svg-icons/faDumbbell';
import { faScaleBalanced } from '@fortawesome/free-solid-svg-icons/faScaleBalanced';
import { faGear } from '@fortawesome/free-solid-svg-icons/faGear';

import { faArrowUp } from '@fortawesome/free-solid-svg-icons/faArrowUp';
import { faArrowDown } from '@fortawesome/free-solid-svg-icons/faArrowDown';
import { faRightLeft } from '@fortawesome/free-solid-svg-icons/faRightLeft';
import { faXmark } from '@fortawesome/free-solid-svg-icons/faXmark';
import { faPlus } from '@fortawesome/free-solid-svg-icons/faPlus';
import { faMinus } from '@fortawesome/free-solid-svg-icons/faMinus';
import { faCaretUp } from '@fortawesome/free-solid-svg-icons/faCaretUp';
import { faCaretDown } from '@fortawesome/free-solid-svg-icons/faCaretDown';
import { faChevronLeft } from '@fortawesome/free-solid-svg-icons/faChevronLeft';
import { faChevronRight } from '@fortawesome/free-solid-svg-icons/faChevronRight';

import { faStopwatch } from '@fortawesome/free-solid-svg-icons/faStopwatch';
import { faCalendarDays } from '@fortawesome/free-solid-svg-icons/faCalendarDays';
import { faPen } from '@fortawesome/free-solid-svg-icons/faPen';
import { faFlagCheckered } from '@fortawesome/free-solid-svg-icons/faFlagCheckered';
import { faScroll } from '@fortawesome/free-solid-svg-icons/faScroll';
import { faArrowsRotate } from '@fortawesome/free-solid-svg-icons/faArrowsRotate';
import { faFloppyDisk } from '@fortawesome/free-solid-svg-icons/faFloppyDisk';

import { faFaceFlushed } from '@fortawesome/free-solid-svg-icons/faFaceFlushed';
import { faFaceFrown } from '@fortawesome/free-solid-svg-icons/faFaceFrown';
import { faFaceMehBlank } from '@fortawesome/free-solid-svg-icons/faFaceMehBlank';
import { faFaceSmile } from '@fortawesome/free-solid-svg-icons/faFaceSmile';
import { faFaceGrinStars } from '@fortawesome/free-solid-svg-icons/faFaceGrinStars';

import { faFileExport } from '@fortawesome/free-solid-svg-icons/faFileExport';
import { faFileImport } from '@fortawesome/free-solid-svg-icons/faFileImport';
import { faPersonRunning } from '@fortawesome/free-solid-svg-icons/faPersonRunning';
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons/faCircleInfo';
import { faTrash } from '@fortawesome/free-solid-svg-icons/faTrash';

import { faRightFromBracket } from '@fortawesome/free-solid-svg-icons/faRightFromBracket';
import { faUser } from '@fortawesome/free-solid-svg-icons/faUser';

library.add(
  faHouse, faClipboardList, faRulerCombined, faDumbbell, faScaleBalanced, faGear,
  faArrowUp, faArrowDown, faRightLeft, faXmark, faPlus, faMinus,
  faCaretUp, faCaretDown, faChevronLeft, faChevronRight,
  faStopwatch, faCalendarDays, faPen, faFlagCheckered, faScroll, faArrowsRotate, faFloppyDisk,
  faFaceFlushed, faFaceFrown, faFaceMehBlank, faFaceSmile, faFaceGrinStars,
  faFileExport, faFileImport,
  faRightFromBracket, faUser, faPersonRunning, faCircleInfo, faTrash,
);

const REGISTRY = {
  house: faHouse,
  clipboard: faClipboardList,
  ruler: faRulerCombined,
  dumbbell: faDumbbell,
  running: faPersonRunning,
  'circle-info': faCircleInfo,
  trash: faTrash,
  scale: faScaleBalanced,
  gear: faGear,

  'arrow-up': faArrowUp,
  'arrow-down': faArrowDown,
  swap: faRightLeft,
  xmark: faXmark,
  plus: faPlus,
  minus: faMinus,
  'caret-up': faCaretUp,
  'caret-down': faCaretDown,
  'chevron-left': faChevronLeft,
  'chevron-right': faChevronRight,

  stopwatch: faStopwatch,
  calendar: faCalendarDays,
  edit: faPen,
  'flag-checkered': faFlagCheckered,
  scroll: faScroll,
  refresh: faArrowsRotate,
  save: faFloppyDisk,

  'face-flushed': faFaceFlushed,
  'face-frown': faFaceFrown,
  'face-meh': faFaceMehBlank,
  'face-smile': faFaceSmile,
  'face-stars': faFaceGrinStars,

  export: faFileExport,
  import: faFileImport,

  'sign-out': faRightFromBracket,
  user: faUser,
};

// Mood emoji → icon name. Keep storing the emoji as the value to stay
// backward-compatible with existing rows, but render the matching icon.
export const MOOD_ICON = {
  '🤮': 'face-flushed',
  '🙁': 'face-frown',
  '😑': 'face-meh',
  '🙂': 'face-smile',
  '🤩': 'face-stars',
};

// Usage: <Icon name="dumbbell" />, <Icon name="house" fw />
export default function Icon({ name, fw = false, ...rest }) {
  const def = REGISTRY[name];
  if (!def) return null;
  return <FontAwesomeIcon icon={def} fixedWidth={fw} {...rest} />;
}
