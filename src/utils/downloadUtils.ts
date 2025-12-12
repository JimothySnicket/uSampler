/**
 * Download utilities using Chrome Downloads API
 * Provides store-compliant file export with folder configuration support
 */

// Chrome API type declarations
declare const chrome: {
    downloads?: {
        download: (
            options: {
                url: string;
                filename?: string;
                saveAs?: boolean;
                conflictAction?: 'uniquify' | 'overwrite' | 'prompt';
            },
            callback?: (downloadId: number) => void
        ) => void;
        showDefaultFolder?: () => void;
    };
    storage?: {
        local: {
            get: (keys: string[] | { [key: string]: any } | null) => Promise<{ [key: string]: any }>;
            set: (items: { [key: string]: any }) => Promise<void>;
            remove: (keys: string | string[]) => Promise<void>;
        };
    };
    runtime?: {
        lastError?: { message: string };
    };
} | undefined;

export interface DownloadOptions {
    /** Whether to show Save As dialog (default: true) */
    saveAs?: boolean;
    /** Suggested folder path (e.g., "uSampler/Samples") */
    suggestedFolder?: string;
    /** Whether to open folder after download (default: false) */
    openFolder?: boolean;
    /** Conflict action: 'uniquify', 'overwrite', or 'prompt' (default: 'uniquify') */
    conflictAction?: 'uniquify' | 'overwrite' | 'prompt';
}

/**
 * Download a blob using Chrome Downloads API
 * This allows us to specify folder paths (e.g., "uSampler/filename.wav")
 * The Chrome Downloads API supports relative paths in the filename parameter
 */
export async function downloadBlob(
    blob: Blob,
    filename: string,
    options: DownloadOptions = {}
): Promise<void> {
    // Use Chrome Downloads API to support folder paths
    if (typeof chrome !== 'undefined' && chrome.downloads) {
        const url = URL.createObjectURL(blob);
        
        // Build the full filename with folder path if specified
        const fullFilename = options.suggestedFolder 
            ? `${options.suggestedFolder}/${filename}`
            : filename;
        
        return new Promise((resolve, reject) => {
            chrome.downloads!.download({
                url: url,
                filename: fullFilename,
                saveAs: options.saveAs ?? false,
                conflictAction: options.conflictAction || 'uniquify'
            }, (downloadId) => {
                // Clean up the blob URL after a short delay
                setTimeout(() => {
                    URL.revokeObjectURL(url);
                }, 1000);
                
                if (chrome.runtime?.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve();
                }
            });
        });
    }
    
    // Fallback to <a download> if Chrome API is not available
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

/**
 * Get user's configured export folder from storage
 */
export async function getExportFolder(): Promise<string | null> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
        return null;
    }

    try {
        const result = await chrome.storage.local.get(['exportFolder']);
        return result.exportFolder || null;
    } catch (error) {
        console.error('Failed to get export folder:', error);
        return null;
    }
}

/**
 * Save user's export folder preference
 */
export async function setExportFolder(folder: string | null): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
        return;
    }

    try {
        if (folder) {
            await chrome.storage.local.set({ exportFolder: folder });
        } else {
            await chrome.storage.local.remove('exportFolder');
        }
    } catch (error) {
        console.error('Failed to set export folder:', error);
        throw error;
    }
}

/**
 * Download with default uSampler folder
 * Always uses 'uSampler' as the default folder path
 */
export async function downloadBlobWithPreference(
    blob: Blob,
    filename: string,
    options: DownloadOptions = {}
): Promise<void> {
    // Always use 'uSampler' as the default folder
    // Don't show Save As dialog by default (let Chrome handle it)
    const saveAs = options.saveAs ?? false;
    const suggestedFolder = 'uSampler';

    console.log('[downloadUtils] Downloading to uSampler folder:', `${suggestedFolder}/${filename}`, 'saveAs:', saveAs);

    return downloadBlob(blob, filename, {
        ...options,
        saveAs,
        suggestedFolder
    });
}

