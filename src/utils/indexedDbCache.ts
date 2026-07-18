const DB_NAME = "SSTR_Photos_Cache";
const STORE_NAME = "images";
const DB_VERSION = 1;

// Global synchronous in-RAM cache to make IDB data accessible synchronously to localStorage monkey-patch
if (!(window as any).sstr_image_cache) {
  (window as any).sstr_image_cache = new Map<string, string>();
}

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * Loads all cached photos from IndexedDB into the synchronous in-RAM cache.
 * Call this during app initialization.
 */
export async function initImageCacheFromIDB(): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    
    // Use openCursor to load all keys and values
    return new Promise((resolve) => {
      const request = store.openCursor();
      request.onsuccess = (event: any) => {
        const cursor = event.target.result;
        if (cursor) {
          if (cursor.key && cursor.value) {
            (window as any).sstr_image_cache.set(cursor.key.toString(), cursor.value);
          }
          cursor.continue();
        } else {
          console.log(`[IDB Cache] Synchronous image cache populated with ${(window as any).sstr_image_cache.size} assets.`);
          resolve();
        }
      };
      request.onerror = () => {
        console.warn("[IDB Cache] Failed to load image cursor.");
        resolve();
      };
    });
  } catch (e) {
    console.error("[IDB Cache] Initialization failed:", e);
  }
}

/**
 * Saves photo to both IndexedDB and synchronous in-RAM cache.
 */
export async function savePhotoToIDB(id: string, base64: string): Promise<void> {
  if (!id || !base64) return;
  
  // Set in synchronous RAM cache immediately
  (window as any).sstr_image_cache.set(id, base64);
  
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(base64, id);
    
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        console.error("[IDB Cache] Store put failed:", tx.error);
        resolve();
      };
    });
  } catch (e) {
    console.error("[IDB Cache] Failed to persist photo to IDB:", e);
  }
}

/**
 * Gets a photo from the synchronous cache, or falls back to reading IndexedDB.
 */
export async function getPhotoFromCacheOrIDB(id: string): Promise<string | null> {
  if (!id) return null;
  const ramValue = (window as any).sstr_image_cache.get(id);
  if (ramValue) return ramValue;
  
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    
    return new Promise((resolve) => {
      request.onsuccess = () => {
        const val = request.result || null;
        if (val) {
          (window as any).sstr_image_cache.set(id, val);
        }
        resolve(val);
      };
      request.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

/**
 * Helper to process any JSON string before storing in localStorage,
 * stripping heavy images into IDB and replacing them with 'idb:ID'
 */
export function extractImagesToIDB(jsonString: string): string {
  if (!jsonString || !jsonString.includes("data:image")) return jsonString;
  
  try {
    const data = JSON.parse(jsonString);
    let changed = false;
    
    const traverseAndPrune = (obj: any) => {
      if (!obj || typeof obj !== "object") return;
      
      // If it's a request/vale with a heavy base64 fotoUrl
      if (obj.id && obj.fotoUrl && obj.fotoUrl.startsWith("data:image")) {
        const photoId = `photo_req_${obj.id}`;
        savePhotoToIDB(photoId, obj.fotoUrl); // Async write in background
        obj.fotoUrl = `idb:${photoId}`;
        changed = true;
      }
      
      // Support sub instances (like originalRequest inside Vales)
      if (obj.originalRequest && obj.originalRequest.id && obj.originalRequest.fotoUrl && obj.originalRequest.fotoUrl.startsWith("data:image")) {
        const photoId = `photo_req_${obj.originalRequest.id}`;
        savePhotoToIDB(photoId, obj.originalRequest.fotoUrl); // Async write in background
        obj.originalRequest.fotoUrl = `idb:${photoId}`;
        changed = true;
      }
      
      for (const key in obj) {
        if (typeof obj[key] === "object") {
          traverseAndPrune(obj[key]);
        }
      }
    };
    
    traverseAndPrune(data);
    return changed ? JSON.stringify(data) : jsonString;
  } catch (e) {
    return jsonString;
  }
}

/**
 * Helper to restore heavy images from RAM cache back into JSON string when reading from localStorage
 */
export function restoreImagesFromCache(jsonString: string): string {
  if (!jsonString || !jsonString.includes("idb:")) return jsonString;
  
  try {
    const data = JSON.parse(jsonString);
    let changed = false;
    
    const traverseAndRestore = (obj: any) => {
      if (!obj || typeof obj !== "object") return;
      
      if (obj.fotoUrl && obj.fotoUrl.startsWith("idb:")) {
        const photoKey = obj.fotoUrl.substring(4);
        const ramVal = (window as any).sstr_image_cache.get(photoKey);
        if (ramVal) {
          obj.fotoUrl = ramVal;
          changed = true;
        }
      }
      
      if (obj.originalRequest && obj.originalRequest.fotoUrl && obj.originalRequest.fotoUrl.startsWith("idb:")) {
        const photoKey = obj.originalRequest.fotoUrl.substring(4);
        const ramVal = (window as any).sstr_image_cache.get(photoKey);
        if (ramVal) {
          obj.originalRequest.fotoUrl = ramVal;
          changed = true;
        }
      }
      
      for (const key in obj) {
        if (typeof obj[key] === "object") {
          traverseAndRestore(obj[key]);
        }
      }
    };
    
    traverseAndRestore(data);
    return changed ? JSON.stringify(data) : jsonString;
  } catch (e) {
    return jsonString;
  }
}
