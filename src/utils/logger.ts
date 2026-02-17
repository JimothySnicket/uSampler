import { DEBUG } from '../../constants';

export function debug(...args: any[]) {
    if (DEBUG) {
        console.log(...args);
    }
}

export function debugWarn(...args: any[]) {
    if (DEBUG) {
        console.warn(...args);
    }
}

export function debugError(...args: any[]) {
    if (DEBUG) {
        console.error(...args);
    }
}
