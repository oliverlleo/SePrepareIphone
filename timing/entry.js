import {createTimeMarkUI} from './time-mark-ui.js';
import {parseTimeMark,TIME_MARK_ATTRIBUTE,TIME_POINT_ATTRIBUTE} from './time-mark-core.js';
import {mountReaderTools} from './reader-tools.js';
import css from './timing.css';
const style=document.createElement('style');style.id='seprepare-timing-style';style.textContent=css;document.head.append(style);
window.SePrepareTiming={createTimeMarkUI,parseTimeMark,TIME_MARK_ATTRIBUTE,TIME_POINT_ATTRIBUTE,mountReaderTools};
