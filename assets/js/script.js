// Helper untuk sanitasi input (XSS prevention)
function sanitizeInput(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Konfigurasi Sistem
const SYSTEM_VERSION = 2;
const FAVICON_FALLBACK_COLORS = ['#ff6b6b', '#ff6b9d', '#845ef7', '#339af0', '#1c7ed6', '#51cf66', '#ffd43b', '#ff922b'];
const SEARCH_DEBOUNCE_DELAY = 200;
const MAX_FAVICON_CACHE_SIZE = 100;
const LONG_PRESS_TIMEOUT = 350;
const TOAST_DURATION = 3500;

// Sort Options
const SORT_OPTIONS = {
    manual: 'Manual Order',
    recent: 'Paling Baru Ditambah',
    mostUsed: 'Paling Sering Digunakan',
    alphabetical: 'A-Z'
};

// State Global
let links = [];
let faviconCache = {};
let modalAction = null;
let searchDebounceTimer = null;
let lastRenderQuery = null;
let currentSort = 'manual';
let currentTheme = 'light';
let dragState = {
    isDragging: false,
    draggedElement: null,
    draggingFromIndex: null,
    lastHoverIndex: null,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0
};

// Inisialisasi Data dengan Versioning
function initData() {
    loadTheme();
    currentSort = localStorage.getItem('sortOption') || 'manual';
    const stored = localStorage.getItem("linkBank");
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (parsed.version !== SYSTEM_VERSION) {
                showModal(
                    "Data Lama Ditemukan",
                    "Data Anda akan dikonversi ke format terbaru. Tekan 'Lanjutkan'.",
                    "Lanjutkan",
                    {type: 'info'},
                    () => migrateOldData(parsed.data || [])
                );
                return;
            }
            links = parsed.data || [];
        } catch (err) {
            showModal("Error", "Data tersimpan rusak. Akan menggunakan data baru.", "OK", {type: 'error'});
            links = [];
        }
    }
    setupKeyboardShortcuts();
    render();
}

// Migrasikan data versi lama
function migrateOldData(oldData) {
    links = oldData.map(item => ({
        name: item.name || "",
        url: item.url || "",
        clicks: item.clicks || 0,
        lastUsed: item.lastUsed || new Date().toISOString(),
        color: "",
        favorite: false
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

// Setup Keyboard Shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'k') {
                e.preventDefault();
                document.getElementById('search').focus();
            } else if (e.key === 'n') {
                e.preventDefault();
                toggleForm();
            }
        }
    });
}

// Dark Mode Toggle
function toggleDarkMode() {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme();
    localStorage.setItem('theme', currentTheme);
    showToast(`Mode ${currentTheme === 'dark' ? 'Gelap' : 'Terang'} Diaktifkan`, 'info');
}

function applyTheme() {
    document.documentElement.setAttribute('data-theme', currentTheme);
    const themeIcon = document.getElementById('theme-toggle');
    if (themeIcon) {
        themeIcon.innerHTML = currentTheme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    }
}

function loadTheme() {
    currentTheme = localStorage.getItem('theme') || 'light';
    applyTheme();
}

// Hitung skor dengan Exponential Decay
function calculateScore(link) {
    const now = Date.now();
    const lastUsed = link.lastUsed ? new Date(link.lastUsed).getTime() : now;
    const days = (now - lastUsed) / (1000 * 60 * 60 * 24);
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

// Dapatkan favicon dengan fallback dan memory management
function getFavicon(url, name) {
    try {
        const domain = new URL(url).hostname;
        if (faviconCache[domain]) {
            faviconCache[domain].lastAccess = Date.now();
            return faviconCache[domain];
        }

        const cacheKeys = Object.keys(faviconCache);
        if (cacheKeys.length >= MAX_FAVICON_CACHE_SIZE) {
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

        const iconUrl = `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;
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

// Toast Notification System
function showToast(message, type = 'info', duration = TOAST_DURATION) {
    const toast = document.getElementById('toast');
    toast.textContent = '';
    toast.className = `toast ${type} show`;
    
    const iconMap = {
        success: '<i class="fas fa-check-circle"></i>',
        error: '<i class="fas fa-exclamation-circle"></i>',
        warning: '<i class="fas fa-exclamation-triangle"></i>',
        info: '<i class="fas fa-info-circle"></i>'
    };
    
    toast.innerHTML = `${iconMap[type] || iconMap.info} <span>${message}</span>`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

// Tampilkan custom modal
function showModal(title, message, confirmText, options = {}, action) {
    const { type = 'info'} = options;
    
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-message").textContent = message;
    document.getElementById("modal-confirm").textContent = confirmText;
    
    const modalContent = document.getElementById("modal-content");
    modalContent.className = `modal-content modal-${type}`;
    
    const iconContainer = document.getElementById("modal-icon");
    const iconMap = {
        success: { icon: '<i class="fas fa-check-circle"></i>', class: 'success' },
        error: { icon: '<i class="fas fa-times-circle"></i>', class: 'error' },
        warning: { icon: '<i class="fas fa-exclamation-circle"></i>', class: 'warning' },
        info: { icon: '<i class="fas fa-info-circle"></i>', class: 'info' }
    };
    
    const iconData = iconMap[type] || iconMap.info;
    iconContainer.innerHTML = iconData.icon;
    iconContainer.className = `modal-icon ${iconData.class}`;
    
    modalAction = action || null;
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
        "Apakah Anda yakin ingin menghapus link ini?",
        "Hapus",
        { type: 'warning' },
        () => {
            links = links.filter(link => link.url !== url);
            save();
            lastRenderQuery = null;
            render();
            showToast("Link berhasil dihapus", 'success');
        }
    );
}

// Toggle Favorites
function toggleFavorite(url) {
    const link = links.find(l => l.url === url);
    if (link) {
        link.favorite = !link.favorite;
        save();
        render();
        showToast(link.favorite ? "Ditambahkan ke favorit" : "Dihapus dari favorit", 'info');
    }
}

// Change Sort Option
function changeSortOption() {
    const sortSelect = document.getElementById('sort-select');
    currentSort = sortSelect.value;
    localStorage.setItem('sortOption', currentSort);
    lastRenderQuery = null;
    render();
}

// Apply Sorting
function applySorting(filteredLinks) {
    const sorted = [...filteredLinks];
    switch (currentSort) {
        case 'recent':
            sorted.sort((a, b) => new Date(b.lastUsed || 0) - new Date(a.lastUsed || 0));
            break;
        case 'mostUsed':
            sorted.sort((a, b) => calculateScore(b) - calculateScore(a));
            break;
        case 'alphabetical':
            sorted.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'manual':
        default:
            // Keep original order
            break;
    }
    return sorted;
}

// Render dengan debounce untuk search
function render() {
    // Update sort dropdown
    document.getElementById('sort-select').value = currentSort;
    
    const search = document.getElementById("search").value.toLowerCase().trim();
    
    // Skip render jika query tidak berubah
    if (lastRenderQuery === search && document.getElementById("links").children.length > 0) {
        return;
    }
    lastRenderQuery = search;

    const container = document.getElementById("links");
    container.innerHTML = "";
    const fragment = document.createDocumentFragment();

    // Filter based on search
    const filteredLinks = links.filter(link => 
        link.name.toLowerCase().includes(search) || 
        link.url.toLowerCase().includes(search)
    );
    
    // Apply sorting
    const visibleLinks = applySorting(filteredLinks);
    
    // Update stats
    const statsCount = document.getElementById('links-count');
    if (statsCount) {
        statsCount.textContent = visibleLinks.length;
    }
    
    // Show/hide empty states
    const emptyState = document.getElementById('empty-state');
    const noResultsState = document.getElementById('no-results-state');
    
    if (links.length === 0) {
        // Truly empty
        if (emptyState) emptyState.style.display = 'flex';
        if (noResultsState) noResultsState.style.display = 'none';
        if (container) container.style.display = 'none';
        return;
    } else if (visibleLinks.length === 0 && search) {
        // Search returned no results
        if (emptyState) emptyState.style.display = 'none';
        if (noResultsState) noResultsState.style.display = 'flex';
        if (container) container.style.display = 'none';
        return;
    } else {
        // Show cards
        if (emptyState) emptyState.style.display = 'none';
        if (noResultsState) noResultsState.style.display = 'none';
        if (container) container.style.display = 'grid';
    }
    
    // Reset drag state saat render ulang
    dragState.isDragging = false;
    dragState.draggedElement = null;
    dragState.draggingFromIndex = null;
    dragState.lastHoverIndex = null;

    visibleLinks.forEach((link, index) => {
        const div = document.createElement("div");
        div.className = "link-card" + (link.favorite ? " favorite" : "");
        if (link.color) {
            div.setAttribute("data-color", link.color);
        }
        if (currentSort === 'manual') {
            div.classList.add("drag-handle");
        }
        div.role = "button";
        div.tabIndex = 0;
        div.dataset.url = link.url;
        div.dataset.index = index;
        div.dataset.originalIndex = index;

        // Local drag state per card
        let pressTimer = null;
        let dragStarted = false;
        const card = div;

        // Reset styling
        const resetStyle = () => {
            card.style.opacity = "";
            card.style.cursor = "";
            card.style.zIndex = "";
            card.style.transform = "";
            card.style.filter = "";
            card.classList.remove("dragging-card");
        };

        // Apply drag styling
        const applyDragStyle = () => {
            card.style.opacity = "0.5";
            card.style.cursor = "grabbing";
            card.style.zIndex = "1000";
            card.style.filter = "drop-shadow(0 8px 16px rgba(0,0,0,0.3))";
            card.classList.add("dragging-card");
        };

        card.onpointerdown = (e) => {
            if (e.pointerType === "mouse" && e.button !== 0) return;
            if (currentSort !== 'manual') return; // Only drag in manual mode
            
            pressTimer = setTimeout(() => {
                dragStarted = true;
                dragState.isDragging = true;
                dragState.draggedElement = card;
                dragState.draggingFromIndex = index;
                dragState.lastHoverIndex = index;
                dragState.startX = e.clientX;
                dragState.startY = e.clientY;
                dragState.offsetX = 0;
                dragState.offsetY = 0;
                applyDragStyle();
            }, LONG_PRESS_TIMEOUT);
        };

        card.onpointermove = (e) => {
            if (!dragStarted || !dragState.isDragging) return;

            dragState.offsetX = e.clientX - dragState.startX;
            dragState.offsetY = e.clientY - dragState.startY;
            card.style.transform = `translate(${dragState.offsetX}px, ${dragState.offsetY}px)`;

            const cardHeight = card.offsetHeight + 16;
            const estimatedIndex = dragState.draggingFromIndex + Math.round(dragState.offsetY / cardHeight);
            const newIndex = Math.max(0, Math.min(visibleLinks.length - 1, estimatedIndex));

            if (newIndex !== dragState.lastHoverIndex) {
                dragState.lastHoverIndex = newIndex;

                const temp = visibleLinks[dragState.draggingFromIndex];
                visibleLinks.splice(dragState.draggingFromIndex, 1);
                visibleLinks.splice(newIndex, 0, temp);
                dragState.draggingFromIndex = newIndex;

                const allCards = container.querySelectorAll(".link-card");
                allCards.forEach((c) => {
                    if (c === card) return;
                    const idx = visibleLinks.findIndex(l => l.url === c.dataset.url);
                    const origIdx = parseInt(c.dataset.originalIndex);
                    const distance = (idx - origIdx) * cardHeight;
                    c.style.transform = distance !== 0 ? `translateY(${distance}px)` : "";
                    c.style.transition = "transform 0.15s ease-out";
                });
            }
        };

        card.onpointerup = () => {
            if (pressTimer) clearTimeout(pressTimer);

            if (dragStarted && dragState.isDragging) {
                dragStarted = false;
                dragState.isDragging = false;

                const initialIndex = parseInt(card.dataset.originalIndex);
                if (dragState.lastHoverIndex !== initialIndex) {
                    links = visibleLinks;
                    save();
                }

                const cardHeight = card.offsetHeight + 16;
                const finalDistance = (dragState.lastHoverIndex - initialIndex) * cardHeight;
                
                card.style.transition = "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)";
                card.style.transform = `translateY(${finalDistance}px)`;
                card.style.opacity = "1";

                setTimeout(() => {
                    dragState.draggedElement = null;
                    dragState.draggingFromIndex = null;
                    dragState.lastHoverIndex = null;
                    render();
                }, 300);
            }

            resetStyle();
        };

        card.onpointerleave = () => {
            if (pressTimer) clearTimeout(pressTimer);
            if (!dragState.isDragging) {
                dragStarted = false;
                resetStyle();
            }
        };

        card.onclick = (e) => {
            if (dragState.isDragging) {
                e.preventDefault();
                e.stopPropagation();
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
            img.style.borderRadius = "12px";
            img.style.objectFit = "cover";
            img.loading = "lazy";
            img.decoding = "async";

            const loadTimeoutId = setTimeout(() => {
                if (img.parentNode && iconContainer.parentNode) {
                    img.remove();
                    createFallbackIcon(iconContainer, iconData);
                }
            }, 1500);

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

        // Text element
        const text = document.createElement("div");
        text.className = "link-card-text";
        text.title = link.name;
        text.textContent = link.name;

        // Favorite button
        const favoriteBtn = document.createElement("button");
        favoriteBtn.className = "link-card-favorite";
        favoriteBtn.setAttribute("aria-label", `Toggle ${link.name} favorit`);
        favoriteBtn.innerHTML = link.favorite ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
        favoriteBtn.type = "button";
        favoriteBtn.onclick = (e) => {
            e.stopPropagation();
            toggleFavorite(link.url);
        };

        // Delete button
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
        card.appendChild(favoriteBtn);
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
    try {
        const urlObj = new URL(url);
        window.open(urlObj.href, "_blank");
    } catch (err) {
        showModal("Error", "URL tidak valid. Silakan coba lagi.", "OK", {type: 'error'});
    }
}

// Toggle form tambah link
function toggleForm() {
    const formContainer = document.getElementById("form-container");
    const form = document.getElementById("form");
    const isOpen = form.style.display !== "none";
    
    if (isOpen) {
        formContainer.classList.add("collapsed");
        form.style.display = "none";
        clearForm();
    } else {
        formContainer.classList.remove("collapsed");
        form.style.display = "block";
        setTimeout(() => document.getElementById("name").focus(), 100);
    }
}

// Clear form input
function clearForm() {
    document.getElementById("name").value = "";
    document.getElementById("url").value = "";
    document.getElementById("color-none").checked = true;
}

// Tambah link dengan validasi ketat
function addLink() {
    const name = document.getElementById("name").value.trim();
    const urlInput = document.getElementById("url").value.trim();
    const color = document.querySelector('input[name="color"]:checked').value;
    let url = urlInput;

    if (!name || !url) {
        showModal("Peringatan", "Nama dan URL tidak boleh kosong!", "OK", {type: 'warning'});
        return;
    }

    if (name.length > 100) {
        showModal("Peringatan", "Nama link terlalu panjang (max 100 karakter)!", "OK", {type: 'warning'});
        return;
    }

    if (url.length > 2048) {
        showModal("Peringatan", "URL terlalu panjang (max 2048 karakter)!", "OK", {type: 'warning'});
        return;
    }

    if (!url.match(/^https?:\/\//i)) {
        url = `https://${url}`;
    }

    try {
        const urlObj = new URL(url);
        if (!urlObj.hostname || urlObj.hostname.length === 0) {
            throw new Error("Domain tidak valid");
        }
    } catch {
        showModal("Error", "URL yang dimasukkan tidak valid!", "OK", {type: 'error'});
        return;
    }

    const normalizedUrl = new URL(url).href;
    if (links.some(link => new URL(link.url).href === normalizedUrl)) {
        showModal("Peringatan", "Link dengan URL ini sudah ada!", "OK", {type: 'warning'});
        return;
    }

    links.unshift({
        name: sanitizeInput(name),
        url: normalizedUrl,
        clicks: 0,
        lastUsed: new Date().toISOString(),
        color: color || "",
        favorite: false
    });

    save();
    lastRenderQuery = null;
    render();
    clearForm();
    toggleForm();
    showToast("Link berhasil ditambahkan", 'success');
}

// Export data
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
        
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        
        showToast("Data berhasil diekspor", 'success');
    } catch (err) {
        showModal("Error", `Gagal mengekspor data: ${err.message}`, "OK", {type: 'error'});
    }
}

// Import data
function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const fileContent = e.target.result;
            const imported = JSON.parse(fileContent);

            if (!imported || typeof imported !== "object") {
                throw new Error("Struktur file tidak valid");
            }

            let importCandidates = [];
            if (imported.version && imported.data) {
                if (imported.version !== SYSTEM_VERSION) {
                    showModal(
                        "Peringatan",
                        "File backup dari versi berbeda. Akan mencoba konversi.",
                        "Lanjutkan",
                        {type: 'warning'},
                        () => processImportData(imported.data || [])
                    );
                    return;
                }
                importCandidates = imported.data || [];
            } else if (Array.isArray(imported)) {
                importCandidates = imported;
            } else {
                throw new Error("Format file tidak dikenali");
            }

            processImportData(importCandidates);
        } catch (err) {
            showModal("Error", `Gagal mengimpor: ${err.message}`, "OK", {type: 'error'});
        }
    };
    reader.readAsText(file);
    event.target.value = "";
}

function processImportData(importedArray) {
    const validLinks = importedArray.filter(item => isValidLink(item));
    
    if (validLinks.length === 0) {
        showModal("Error", "Tidak ada data valid di file ini.", "OK", {type: 'error'});
        return;
    }

    showModal(
        "Konfirmasi Impor",
        `Ditemukan ${validLinks.length} link. Pilih aksi:`,
        "Ganti",
        {type: 'info'},
        () => {
            links = validLinks;
            save();
            render();
            showToast(`${validLinks.length} link berhasil diimpor`, 'success');
        }
    );
}

// Search with debounce
document.addEventListener('DOMContentLoaded', () => {
    initData();
    
    const searchInput = document.getElementById("search");
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                render();
            }, SEARCH_DEBOUNCE_DELAY);
        });
    }
});
