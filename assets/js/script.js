// Helper untuk sanitasi input (XSS prevention)
function sanitizeInput(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Konfigurasi Sistem
const SYSTEM_VERSION = 1;
const FAVICON_FALLBACK_COLORS = ['#007bff', '#28a745', '#ffc107', '#17a2b8', '#dc3545'];
const SEARCH_DEBOUNCE_DELAY = 200;
const MAX_FAVICON_CACHE_SIZE = 100;
const DOUBLE_CLICK_TIMEOUT = 300; // Waktu untuk detect double-click (ms)

// State Global
let links = [];
let faviconCache = {};
let modalAction = null;
let searchDebounceTimer = null;
let modalMergeAction = null;
let lastRenderQuery = null;
let dragState = {
    isDragging: false,
    draggedElement: null,
    draggedUrl: null,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0
};

// Inisialisasi Data dengan Versioning
function initData() {
    const stored = localStorage.getItem("linkBank");
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            // Cek versi sistem untuk kompatibilitas
            if (parsed.version !== SYSTEM_VERSION) {
                showModal(
                    "Perhatian",
                    "Data ditemukan dari versi lama. Akan dilakukan konversi otomatis.",
                    "Lanjutkan",
                    () => migrateOldData(parsed.data || [])
                );
                return;
            }
            links = parsed.data || [];
        } catch (err) {
            showModal(
                "Error",
                "Data tersimpan rusak. Akan menggunakan data baru.",
                "OK",
                () => links = []
            );
        }
    }
    render();
}

// Migrasikan data versi lama (jika ada)
function migrateOldData(oldData) {
    links = oldData.map(item => ({
        name: item.name || "",
        url: item.url || "",
        clicks: item.clicks || 0,
        lastUsed: item.lastUsed || new Date().toISOString()
    }));
    save();
    render();
}

// Simpan data dengan versioning
function save() {
    localStorage.setItem("linkBank", JSON.stringify({
        version: SYSTEM_VERSION,
        data: links
    }));
}

// Hitung skor dengan Exponential Decay
function calculateScore(link) {
    const now = Date.now();
    const lastUsed = link.lastUsed ? new Date(link.lastUsed).getTime() : now;
    const days = (now - lastUsed) / (1000 * 60 * 60 * 24);

    // Faktor decay eksponensial (0.15 = kecepatan decay yang optimal)
    const decayFactor = Math.exp(-0.15 * days);
    return (link.clicks || 0) * decayFactor;
}

// Validasi struktur link
function isValidLink(obj) {
    if (!obj || typeof obj !== "object") return false;
    return (
        typeof obj.name === "string" && obj.name.trim().length > 0 &&
        typeof obj.url === "string" && obj.url.trim().length > 0 &&
        (typeof obj.clicks === "number" || obj.clicks === undefined) &&
        (typeof obj.lastUsed === "string" || obj.lastUsed === undefined)
    );
}

// Dapatkan favicon dengan fallback global dan memory management
function getFavicon(url, name) {
    try {
        const domain = new URL(url).hostname;
        if (faviconCache[domain]) {
            // Update access time untuk LRU tracking
            faviconCache[domain].lastAccess = Date.now();
            return faviconCache[domain];
        }

        // Prevent cache memory leak - implement LRU cache eviction
        const cacheKeys = Object.keys(faviconCache);
        if (cacheKeys.length >= MAX_FAVICON_CACHE_SIZE) {
            // Hapus entry dengan lastAccess paling lama
            let oldestKey = cacheKeys[0];
            let oldestTime = faviconCache[oldestKey].lastAccess || Date.now();
            
            for (const key of cacheKeys) {
                const accessTime = faviconCache[key].lastAccess || Date.now();
                if (accessTime < oldestTime) {
                    oldestTime = accessTime;
                    oldestKey = key;
                }
            }
            delete faviconCache[oldestKey];
        }

        // Endpoint utama
        const iconUrl = `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;

        // Cache favicon dengan fallback color dan timestamp
        faviconCache[domain] = {
            url: iconUrl,
            fallback: {
                color: FAVICON_FALLBACK_COLORS[name.length % FAVICON_FALLBACK_COLORS.length]
            },
            lastAccess: Date.now()
        };
        return faviconCache[domain];
    } catch {
        return {
            url: "",
            fallback: {
                color: FAVICON_FALLBACK_COLORS[Math.floor(Math.random() * FAVICON_FALLBACK_COLORS.length)]
            }
        };
    }
}

// Tampilkan custom modal
function showModal(title, message, confirmText, action) {
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-message").textContent = message;
    document.getElementById("modal-confirm").textContent = confirmText;
    modalAction = action;
    modalMergeAction = null;
    lastRenderQuery = null;
    
    // Reset cancel button to default
    const cancelBtn = document.getElementById("modal-cancel");
    cancelBtn.textContent = "Batal";
    cancelBtn.onclick = hideModal;
    
    document.getElementById("modal").style.display = "flex";
}

// Sembunyikan modal
function hideModal() {
    document.getElementById("modal").style.display = "none";
    modalAction = null;
}

// Jalankan aksi dari modal
function executeModalAction() {
    if (modalAction) modalAction();
    hideModal();
}

// Hapus link dengan custom modal
function deleteLink(url) {
    showModal(
        "Konfirmasi Hapus",
        "Apakah Anda yakin ingin menghapus link ini? Tindakan ini tidak dapat dibatalkan.",
        "Hapus",
        () => {
            links = links.filter(link => link.url !== url);
            save();
            lastRenderQuery = null;
            render();
        }
    );
}

// Render dengan debounce untuk search
function render() {
    const search = document.getElementById("search").value.toLowerCase().trim();
    
    // Skip render jika query tidak berubah
    if (lastRenderQuery === search && document.getElementById("links").children.length > 0) {
        return;
    }
    lastRenderQuery = search;

    const container = document.getElementById("links");
    container.innerHTML = "";
    const fragment = document.createDocumentFragment();

    // Urutkan berdasarkan skor eksponensial
    const sortedLinks = [...links].sort((a, b) => calculateScore(b) - calculateScore(a));

    sortedLinks.forEach(link => {
        if (!link.name.toLowerCase().includes(search)) return;

        const div = document.createElement("div");
        div.className = "link-card";
        div.role = "button";
        div.tabIndex = 0;
        div.dataset.url = link.url;

        // Pointer Events Handler - Simplified untuk mengurangi redundansi
        let pressTimer = null;
        let isDoubleClick = false;
        let lastClickTime = 0;
        const card = div;

        // Helper: Reset card styling
        const resetCardStyle = () => {
            card.style.background = "";
            card.style.cursor = "";
            card.style.opacity = "";
            card.style.zIndex = "";
            card.style.transform = "";
        };

        // Helper: Apply drag styling
        const applyDragStyle = () => {
            card.style.background = "#e8f4fd";
            card.style.cursor = "grab";
        };

        // Helper: Apply dragging styling
        const applyDraggingStyle = () => {
            card.style.opacity = "0.7";
            card.style.cursor = "grabbing";
            card.style.zIndex = "999";
        };

        card.onpointerdown = (e) => {
            if (e.pointerType === "mouse" && e.button !== 0) return;

            const now = Date.now();
            const timeSinceLastClick = now - lastClickTime;
            
            // Detect double-click
            if (timeSinceLastClick < DOUBLE_CLICK_TIMEOUT) {
                isDoubleClick = true;
                applyDragStyle();
            } else {
                isDoubleClick = false;
                if (pressTimer) clearTimeout(pressTimer);
                
                // Long-press untuk delete (600ms)
                pressTimer = setTimeout(() => {
                    deleteLink(link.url);
                }, 600);
            }
            
            lastClickTime = now;
        };

        card.onpointermove = (e) => {
            // Handle drag hanya jika double-click detected dan mouse button ditekan
            if (isDoubleClick && e.buttons === 1) {
                if (!dragState.isDragging) {
                    dragState.isDragging = true;
                    dragState.draggedElement = card;
                    dragState.draggedUrl = link.url;
                    dragState.startX = e.clientX;
                    dragState.startY = e.clientY;
                    applyDraggingStyle();
                }

                if (dragState.isDragging) {
                    dragState.offsetX = e.clientX - dragState.startX;
                    dragState.offsetY = e.clientY - dragState.startY;
                    card.style.transform = `translate(${dragState.offsetX}px, ${dragState.offsetY}px)`;
                }
            }
        };

        card.onpointerup = () => {
            if (pressTimer) clearTimeout(pressTimer);
            
            if (dragState.isDragging && dragState.draggedElement === card) {
                // Handle drag completion - reorder links
                dragState.isDragging = false;
                dragState.draggedElement = null;
                resetCardStyle();
                
                const draggedLink = links.find(l => l.url === dragState.draggedUrl);
                if (draggedLink && Math.abs(dragState.offsetY) > 30) {
                    const currentIndex = links.indexOf(draggedLink);
                    const cardHeight = card.offsetHeight + 12;
                    const moveDistance = Math.round(dragState.offsetY / cardHeight);
                    const targetIndex = Math.max(0, Math.min(links.length - 1, currentIndex + moveDistance));
                    
                    if (currentIndex !== targetIndex) {
                        const [movedLink] = links.splice(currentIndex, 1);
                        links.splice(targetIndex, 0, movedLink);
                        save();
                        lastRenderQuery = null;
                        render();
                    }
                }
                resetCardStyle();
            } else {
                resetCardStyle();
            }
            isDoubleClick = false;
        };

        card.onpointerleave = () => {
            if (pressTimer && !dragState.isDragging) clearTimeout(pressTimer);
            if (!dragState.isDragging) resetCardStyle();
        };

        card.onclick = () => {
            if (dragState.isDragging || lastClickTime > Date.now() - DOUBLE_CLICK_TIMEOUT) {
                // Don't open link if dragging atau just double-clicked
                return;
            }
            openLink(link.url);
        };

        // Keyboard navigation support
        card.onkeydown = (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openLink(link.url);
            } else if (e.key === "Delete") {
                e.preventDefault();
                deleteLink(link.url);
            }
        };

        // Create icon element
        const iconData = getFavicon(link.url, link.name);
        const iconContainer = document.createElement("div");
        iconContainer.className = "icon-placeholder";

        if (iconData.url) {
            const img = document.createElement("img");
            img.src = iconData.url;
            img.alt = `${link.name} icon`;
            img.style.width = "100%";
            img.style.height = "100%";
            img.style.borderRadius = "50%";
            img.style.objectFit = "cover";
            img.loading = "lazy";
            img.decoding = "async";

            // Fallback visual jika gambar gagal dimuat atau timeout
            const loadTimeoutId = setTimeout(() => {
                if (img.parentNode && iconContainer.parentNode) {
                    img.remove();
                    createFallbackIcon(iconContainer, iconData);
                }
            }, 3000);

            img.onerror = () => {
                if (loadTimeoutId) clearTimeout(loadTimeoutId);
                if (img.parentNode && iconContainer.parentNode) {
                    img.remove();
                    createFallbackIcon(iconContainer, iconData);
                }
            };

            img.onload = () => {
                if (loadTimeoutId) clearTimeout(loadTimeoutId);
            };
            
            iconContainer.appendChild(img);
        } else {
            createFallbackIcon(iconContainer, iconData);
        }

        // Text element dengan sanitasi
        const text = document.createElement("div");
        text.className = "link-card-text";
        text.title = link.name;
        text.textContent = link.name;

        // Delete button - mobile-friendly dan accessible
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "link-card-delete";
        deleteBtn.setAttribute("aria-label", `Hapus ${link.name}`);
        deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
        deleteBtn.type = "button";
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteLink(link.url);
        };

        card.appendChild(iconContainer);
        card.appendChild(text);
        card.appendChild(deleteBtn);
        fragment.appendChild(card);
    });

    container.appendChild(fragment);
}

// Helper function untuk membuat fallback icon
function createFallbackIcon(container, iconData) {
    container.style.background = iconData.fallback.color;
    container.style.color = "white";
    container.innerHTML = "";
    container.setAttribute("aria-label", `favicon`);
}

// Buka link di tab baru
function openLink(url) {
    const link = links.find(l => l.url === url);
    if (link) {
        link.clicks = (link.clicks || 0) + 1;
        link.lastUsed = new Date().toISOString();
        save();
    }
    window.open(url, "_blank");
}

// Toggle form tambah link dengan state management
function toggleForm() {
    const form = document.getElementById("form");
    const isOpen = form.style.display !== "none";
    form.style.display = isOpen ? "none" : "block";
    
    if (!isOpen) {
        // Focus pada input pertama saat form dibuka
        setTimeout(() => document.getElementById("name").focus(), 100);
    } else {
        // Clear form saat ditutup
        clearForm();
    }
}

// Clear form input
function clearForm() {
    document.getElementById("name").value = "";
    document.getElementById("url").value = "";
}

// Tambah link dengan validasi ketat
function addLink() {
    const name = document.getElementById("name").value.trim();
    const urlInput = document.getElementById("url").value.trim();
    let url = urlInput;

    // Validasi input kosong
    if (!name || !url) {
        return showModal("Peringatan", "Nama dan URL tidak boleh kosong!", "OK", null);
    }

    // Validasi panjang nama
    if (name.length > 100) {
        return showModal("Peringatan", "Nama link terlalu panjang (max 100 karakter)!", "OK", null);
    }

    // Validasi panjang URL
    if (url.length > 2048) {
        return showModal("Peringatan", "URL terlalu panjang (max 2048 karakter)!", "OK", null);
    }

    // Tambahkan protokol jika belum ada
    if (!url.match(/^https?:\/\//i)) {
        url = `https://${url}`;
    }

    // Validasi URL format
    try {
        const urlObj = new URL(url);
        // Additional validation: check if domain is not empty
        if (!urlObj.hostname || urlObj.hostname.length === 0) {
            throw new Error("Domain tidak valid");
        }
    } catch {
        return showModal("Error", "URL yang dimasukkan tidak valid!", "OK", null);
    }

    // Duplikasi normalisasi URL untuk pengecekan
    const normalizedUrl = new URL(url).href;
    if (links.some(link => new URL(link.url).href === normalizedUrl)) {
        return showModal("Peringatan", "Link dengan URL ini sudah ada!", "OK", null);
    }

    // Tambahkan link baru dengan sanitasi
    links.unshift({
        name: sanitizeInput(name),
        url: normalizedUrl,
        clicks: 0,
        lastUsed: new Date().toISOString()
    });

    save();
    lastRenderQuery = null;
    render();
    clearForm();
    document.getElementById("form").style.display = "none";
}

// Export data dengan format terstruktur dan proper cleanup
function exportData() {
    try {
        const exportData = {
            version: SYSTEM_VERSION,
            exportedAt: new Date().toISOString(),
            data: links
        };
        const dataStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([dataStr], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `linkbank-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        
        // Cleanup: remove element dan revoke URL setelah download
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        
        showModal("Berhasil", "Data berhasil diekspor sebagai file JSON!", "OK", null);
    } catch (err) {
        showModal("Error", `Gagal mengekspor data: ${err.message}`, "OK", null);
    }
}

// Import data dengan validasi lengkap
function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const fileContent = e.target.result;
            const imported = JSON.parse(fileContent);

            // Validasi struktur dasar file import
            if (!imported || typeof imported !== "object") {
                throw new Error("Struktur file tidak valid");
            }

            // Siapkan data yang akan diimpor
            let importCandidates = [];
            if (imported.version && imported.data) {
                // File dari versi sistem yang sama
                if (imported.version !== SYSTEM_VERSION) {
                    showModal(
                        "Peringatan",
                        "File backup dari versi berbeda. Akan mencoba konversi data.",
                        "Lanjutkan",
                        () => processImportData(imported.data || [])
                    );
                    return;
                }
                importCandidates = imported.data || [];
            } else if (Array.isArray(imported)) {
                // File dari versi lama atau format array mentah
                importCandidates = imported;
            } else {
                throw new Error("Format file tidak dikenali");
            }

            processImportData(importCandidates);
        } catch (err) {
            showModal("Error", `Gagal mengimpor data: ${err.message}`, "OK", null);
        } finally {
            // Cleanup FileReader dan input
            event.target.value = "";
        }
    };
    
    reader.onerror = () => {
        showModal("Error", "Gagal membaca file. Silakan coba lagi.", "OK", null);
        event.target.value = "";
    };
    
    reader.readAsText(file);
}

// Proses data yang akan diimpor dengan validasi menyeluruh
function processImportData(candidates) {
    // Filter hanya data yang valid
    const validLinks = candidates.filter(link => {
        if (!isValidLink(link)) return false;
        // Tambahan: validasi URL bisa diparse
        try {
            const urlObj = new URL(link.url.trim());
            return urlObj.hostname && urlObj.hostname.length > 0;
        } catch {
            return false;
        }
    });
    
    const invalidCount = candidates.length - validLinks.length;

    // Tampilkan ringkasan sebelum import
    let message = `Ditemukan ${validLinks.length} link valid`;
    if (invalidCount > 0) {
        message += ` dan ${invalidCount} data tidak valid (akan diabaikan)`;
    }
    message += ". Ingin mengganti data saat ini atau menggabungkannya?";

    // Setup modal untuk konfirmasi import
    document.getElementById("modal-title").textContent = "Konfirmasi Impor";
    document.getElementById("modal-message").textContent = message;
    document.getElementById("modal-confirm").textContent = "Ganti";
    document.getElementById("modal-cancel").textContent = "Gabung";

    // Set primary action (Ganti)
    modalAction = () => {
        links = validLinks.map(link => ({
            name: sanitizeInput(link.name.trim()),
            url: new URL(link.url.trim()).href,
            clicks: parseInt(link.clicks) || 0,
            lastUsed: link.lastUsed || new Date().toISOString()
        }));
        save();
        lastRenderQuery = null;
        render();
        showModal("Berhasil", "Data berhasil diganti dengan yang baru!", "OK", null);
    };

    // Set merge action
    modalMergeAction = () => {
        let addedCount = 0;
        validLinks.forEach(newLink => {
            const normalizedUrl = new URL(newLink.url.trim()).href;
            if (!links.some(existing => new URL(existing.url).href === normalizedUrl)) {
                links.push({
                    name: sanitizeInput(newLink.name.trim()),
                    url: normalizedUrl,
                    clicks: parseInt(newLink.clicks) || 0,
                    lastUsed: newLink.lastUsed || new Date().toISOString()
                });
                addedCount++;
            }
        });
        save();
        lastRenderQuery = null;
        render();
        hideModal();
        showModal("Berhasil", `${addedCount} link baru berhasil ditambahkan!`, "OK", null);
    };

    // Setup cancel button to handle merge action
    const cancelBtn = document.getElementById("modal-cancel");
    cancelBtn.onclick = function(e) {
        e.preventDefault();
        if (modalMergeAction) {
            modalMergeAction();
        }
    };

    document.getElementById("modal").style.display = "flex";
}

// Debounced search handler
function handleSearch() {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        render();
    }, SEARCH_DEBOUNCE_DELAY);
}

// Inisialisasi sistem saat halaman dimuat
window.onload = function() {
    // Setup keyboard shortcuts
    document.addEventListener("keydown", (e) => {
        // Escape key untuk close modal/form
        if (e.key === "Escape") {
            const modal = document.getElementById("modal");
            const form = document.getElementById("form");
            if (modal.style.display === "flex") {
                hideModal();
            } else if (form.style.display !== "none") {
                toggleForm();
            }
        }
        // Ctrl/Cmd + K untuk focus search
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            document.getElementById("search").focus();
        }
    });

    // Setup form keyboard support
    const nameInput = document.getElementById("name");
    const urlInput = document.getElementById("url");
    
    // Consolidate space key handling untuk menghindari duplikasi
    const preventSpaceDefault = (e) => {
        if (e.key === " ") {
            e.stopPropagation();
        }
    };
    
    nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            urlInput.focus();
            e.preventDefault();
        }
        preventSpaceDefault(e);
    });

    urlInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            addLink();
            e.preventDefault();
        }
        preventSpaceDefault(e);
    });

    // Debounced search listener
    document.getElementById("search").addEventListener("input", handleSearch);

    initData();
};

// Cleanup saat page unload untuk mencegah memory leak
window.addEventListener("beforeunload", () => {
    // Clear global state
    links = [];
    faviconCache = {};
    modalAction = null;
    modalMergeAction = null;
    lastRenderQuery = null;
    dragState = {
        isDragging: false,
        draggedElement: null,
        draggedUrl: null,
        startX: 0,
        startY: 0,
        offsetX: 0,
        offsetY: 0
    };
    clearTimeout(searchDebounceTimer);
});
