// Configuration
const CONFIG = {
    API_BASE_URL: 'https://gen.pollinations.ai',
    STORAGE_KEY: 'pollinations_mobile_config',
    DEFAULT_SETTINGS: {
        apiKey: '',
        defaultModel: 'openai',
        theme: 'auto',
        fontSize: 'medium',
        maxResults: 20,
        autoRefreshBalance: true,
        contentFilter: true,
        clearHistory: false,
        autoSaveKey: true,
        quickActions: true,
        hapticFeedback: true,
        offlineMode: false
    },
    MODELS: {
        text: [
            { id: 'openai', name: 'OpenAI', type: 'text', description: 'General purpose model' },
            { id: 'gemini', name: 'Gemini', type: 'text', description: 'Google\'s AI model' },
            { id: 'claude', name: 'Claude', type: 'text', description: 'Anthropic\'s AI assistant' },
            { id: 'deepseek', name: 'DeepSeek', type: 'text', description: 'Open source model' }
        ],
        image: [
            { id: 'flux', name: 'Flux', type: 'image', description: 'High quality image generation' },
            { id: 'zimage', name: 'ZImage', type: 'image', description: 'Fast image generation' },
            { id: 'turbo', name: 'Turbo', type: 'image', description: 'Very fast image generation' },
            { id: 'gptimage', name: 'GPT Image', type: 'image', description: 'OpenAI image model' }
        ],
        video: [
            { id: 'veo', name: 'Veo', type: 'video', description: 'Google video generation' },
            { id: 'seedance', name: 'Seedance', type: 'video', description: 'Text-to-video model' }
        ]
    }
};

// State Management
let state = {
    apiKey: '',
    currentTab: 'chat',
    chatHistory: [],
    generatedImages: [],
    generatedTexts: [],
    availableModels: [],
    userSettings: { ...CONFIG.DEFAULT_SETTINGS },
    currentBalance: null,
    isLoading: false,
    isStreaming: false,
    abortController: null,
    uploads: {
        images: [],
        files: []
    },
    selectedModel: null,
    pendingActions: []
};

// DOM Elements
const elements = {};

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    initializeElements();
    loadSettings();
    setupEventListeners();
    setupTouchEvents();
    initializeModels();
    updateUI();
    checkForURLToken();
    setupOfflineDetection();
    
    // Initialize service worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(console.error);
    }
});

function initializeElements() {
    // Get all DOM elements with IDs
    document.querySelectorAll('[id]').forEach(element => {
        elements[element.id] = element;
    });
    
    // Initialize tab buttons
    elements.tabButtons = document.querySelectorAll('.nav-btn');
    elements.filterBtns = document.querySelectorAll('.filter-btn');
    elements.presetBtns = document.querySelectorAll('.preset-btn');
    elements.sizeBtns = document.querySelectorAll('.size-btn');
    
    // Initialize file inputs
    elements.imageUpload = document.getElementById('imageUpload');
    elements.fileUpload = document.getElementById('fileUpload');
    
    // Set initial model
    state.selectedModel = CONFIG.MODELS.text[0];
}

function loadSettings() {
    try {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            state.userSettings = { ...state.userSettings, ...parsed };
            state.apiKey = state.userSettings.apiKey || '';
        }
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
    
    applySettings();
}

function saveSettings() {
    state.userSettings.apiKey = state.apiKey;
    try {
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state.userSettings));
    } catch (e) {
        console.error('Failed to save settings:', e);
    }
}

function applySettings() {
    // Apply theme
    const theme = state.userSettings.theme;
    if (theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.body.classList.add('dark-theme');
        document.body.classList.remove('light-theme');
    } else if (theme === 'light') {
        document.body.classList.add('light-theme');
        document.body.classList.remove('dark-theme');
    } else {
        document.body.classList.remove('dark-theme', 'light-theme');
    }
    
    // Update API key
    if (elements.apiKey) {
        elements.apiKey.value = state.apiKey;
        updateKeyStatus();
    }
    
    // Update theme selector
    if (elements.themeSelect) {
        elements.themeSelect.value = state.userSettings.theme;
    }
    
    // Update other settings
    if (elements.autoRefreshBalance) {
        elements.autoRefreshBalance.checked = state.userSettings.autoRefreshBalance;
    }
    if (elements.contentFilter) {
        elements.contentFilter.checked = state.userSettings.contentFilter;
    }
}

function setupEventListeners() {
    // Tab navigation
    elements.tabButtons?.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    
    // Menu buttons
    elements.menuBtn?.addEventListener('click', openMenu);
    elements.closeMenu?.addEventListener('click', closeMenu);
    elements.menuOverlay?.addEventListener('click', closeMenu);
    elements.userBtn?.addEventListener('click', () => switchTab('more'));
    
    // API Key management
    elements.saveKey?.addEventListener('click', saveApiKey);
    elements.clearKeyBtn?.addEventListener('click', clearApiKey);
    elements.apiKey?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveApiKey();
    });
    
    // BYOP Authentication
    elements.byopBtn?.addEventListener('click', showAuthModal);
    elements.startAuth?.addEventListener('click', startBYOPAuth);
    elements.closeAuth?.addEventListener('click', hideAuthModal);
    
    // Chat functionality
    elements.sendMessage?.addEventListener('click', sendChatMessage);
    elements.messageInput?.addEventListener('input', autoResizeTextarea);
    elements.messageInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    });
    
    // Temperature controls
    elements.tempUp?.addEventListener('click', () => adjustTemperature(0.1));
    elements.tempDown?.addEventListener('click', () => adjustTemperature(-0.1));
    
    // Attachment buttons
    elements.attachImage?.addEventListener('click', () => elements.imageUpload.click());
    elements.attachFile?.addEventListener('click', () => elements.fileUpload.click());
    elements.attachAudio?.addEventListener('click', startAudioRecording);
    elements.imageUpload?.addEventListener('change', handleImageUpload);
    elements.fileUpload?.addEventListener('change', handleFileUpload);
    
    // Image generation
    elements.generateImage?.addEventListener('click', generateImage);
    elements.batchGenerate?.addEventListener('click', () => generateBatchImages(4));
    elements.imageSettingsBtn?.addEventListener('click', showImageSettings);
    elements.closeImageSettings?.addEventListener('click', hideImageSettings);
    elements.randomSeed?.addEventListener('click', generateRandomSeed);
    elements.promptSamples?.addEventListener('click', showPromptSamples);
    elements.promptEnhancer?.addEventListener('click', enhancePrompt);
    elements.clearResults?.addEventListener('click', clearGeneratedImages);
    
    // Size buttons
    elements.sizeBtns?.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.sizeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const [width, height] = btn.dataset.size.split('x');
            if (elements.width) elements.width.value = width;
            if (elements.height) elements.height.value = height;
        });
    });
    
    // Text generation
    elements.generateText?.addEventListener('click', generateText);
    elements.stopGeneration?.addEventListener('click', stopGeneration);
    elements.textPresetsBtn?.addEventListener('click', showTextPresets);
    elements.closeTextPresets?.addEventListener('click', hideTextPresets);
    elements.copyText?.addEventListener('click', copyGeneratedText);
    elements.clearText?.addEventListener('click', clearGeneratedText);
    
    // Preset buttons
    elements.presetBtns?.forEach(btn => {
        btn.addEventListener('click', () => applyTextPreset(btn.dataset.preset));
    });
    
    // Model filters
    elements.filterBtns?.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterModels(btn.dataset.type);
        });
    });
    
    // Model selection
    elements.modelsList?.addEventListener('click', (e) => {
        const modelCard = e.target.closest('.model-card');
        if (modelCard) {
            selectModel(modelCard.dataset.modelId);
        }
    });
    
    // Settings
    elements.themeSelect?.addEventListener('change', (e) => {
        state.userSettings.theme = e.target.value;
        saveSettings();
        applySettings();
        showToast('Theme updated', 'success');
    });
    
    elements.autoRefreshBalance?.addEventListener('change', (e) => {
        state.userSettings.autoRefreshBalance = e.target.checked;
        saveSettings();
    });
    
    elements.contentFilter?.addEventListener('change', (e) => {
        state.userSettings.contentFilter = e.target.checked;
        saveSettings();
    });
    
    // Modal close buttons
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal').classList.remove('show');
        });
    });
    
    // Loading overlay
    elements.cancelLoading?.addEventListener('click', cancelLoading);
    
    // Export/Import
    elements.exportBtn?.addEventListener('click', exportSettings);
    elements.resetBtn?.addEventListener('click', resetSettings);
    elements.aboutBtn?.addEventListener('click', showAbout);
    elements.apiDocs?.addEventListener('click', showAPIDocs);
    elements.support?.addEventListener('click', showSupport);
    elements.quickStart?.addEventListener('click', showQuickStart);
    
    // Model change handlers
    elements.imageModel?.addEventListener('change', toggleVideoSettings);
    
    // Slider value updates
    elements.maxTokens?.addEventListener('input', (e) => {
        if (elements.maxTokensValue) {
            elements.maxTokensValue.textContent = e.target.value;
        }
    });
    
    elements.textTemperature?.addEventListener('input', (e) => {
        if (elements.textTempValue) {
            elements.textTempValue.textContent = e.target.value;
        }
    });
    
    // System preset buttons
    document.querySelectorAll('[data-preset]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            applySystemPreset(e.target.dataset.preset);
        });
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
}

function setupTouchEvents() {
    // Swipe gestures for navigation
    let touchStartX = 0;
    let touchEndX = 0;
    
    document.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    });
    
    document.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    });
    
    function handleSwipe() {
        const swipeThreshold = 50;
        const swipeDistance = touchEndX - touchStartX;
        
        if (Math.abs(swipeDistance) < swipeThreshold) return;
        
        const tabs = ['chat', 'image', 'text', 'models', 'more'];
        const currentIndex = tabs.indexOf(state.currentTab);
        
        if (swipeDistance > 0 && currentIndex > 0) {
            // Swipe right - go to previous tab
            switchTab(tabs[currentIndex - 1]);
            provideHapticFeedback();
        } else if (swipeDistance < 0 && currentIndex < tabs.length - 1) {
            // Swipe left - go to next tab
            switchTab(tabs[currentIndex + 1]);
            provideHapticFeedback();
        }
    }
    
    // Long press for quick actions
    let longPressTimer;
    
    document.addEventListener('touchstart', (e) => {
        const target = e.target;
        if (target.classList.contains('nav-btn') || target.closest('.nav-btn')) {
            longPressTimer = setTimeout(() => {
                showQuickActions(e.target.closest('.nav-btn'));
                provideHapticFeedback('medium');
            }, 500);
        }
    });
    
    document.addEventListener('touchend', () => {
        clearTimeout(longPressTimer);
    });
    
    document.addEventListener('touchmove', () => {
        clearTimeout(longPressTimer);
    });
}

function setupOfflineDetection() {
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    
    function updateOnlineStatus() {
        if (navigator.onLine) {
            showToast('Back online', 'success');
            // Retry pending actions
            retryPendingActions();
        } else {
            showToast('You are offline', 'warning');
        }
    }
}

// API Functions
async function callAPI(endpoint, options = {}) {
    if (!navigator.onLine) {
        throw new Error('You are offline. Please check your connection.');
    }
    
    if (!state.apiKey) {
        throw new Error('API key is required');
    }
    
    const controller = new AbortController();
    state.abortController = controller;
    
    const defaultOptions = {
        headers: {
            'Authorization': `Bearer ${state.apiKey}`,
            'Content-Type': 'application/json'
        },
        signal: controller.signal
    };
    
    try {
        const startTime = Date.now();
        const response = await fetch(`${CONFIG.API_BASE_URL}${endpoint}`, {
            ...defaultOptions,
            ...options
        });
        
        const responseTime = Date.now() - startTime;
        console.log(`API call to ${endpoint} took ${responseTime}ms`);
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || `API Error: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        if (error.name !== 'AbortError') {
            // Queue for retry if offline
            if (!navigator.onLine) {
                state.pendingActions.push({ endpoint, options });
                savePendingActions();
            }
            throw error;
        }
        return null;
    }
}

function retryPendingActions() {
    if (state.pendingActions.length === 0) return;
    
    showToast(`Retrying ${state.pendingActions.length} pending actions...`, 'info');
    
    state.pendingActions.forEach(async (action) => {
        try {
            await callAPI(action.endpoint, action.options);
            state.pendingActions = state.pendingActions.filter(a => a !== action);
            savePendingActions();
        } catch (error) {
            console.error('Failed to retry action:', error);
        }
    });
}

function savePendingActions() {
    try {
        localStorage.setItem('pending_actions', JSON.stringify(state.pendingActions));
    } catch (e) {
        console.error('Failed to save pending actions:', e);
    }
}

function loadPendingActions() {
    try {
        const saved = localStorage.getItem('pending_actions');
        if (saved) {
            state.pendingActions = JSON.parse(saved);
        }
    } catch (e) {
        console.error('Failed to load pending actions:', e);
    }
}

// UI Functions
function switchTab(tabId) {
    // Update active tab button
    elements.tabButtons?.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    
    // Update menu items
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.toggle('active', item.dataset.tab === tabId);
    });
    
    // Show active content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === tabId);
    });
    
    state.currentTab = tabId;
    
    // Close menu if open
    closeMenu();
    
    // Update header
    updateHeaderForTab(tabId);
    
    // Provide haptic feedback
    provideHapticFeedback('light');
}

function updateHeaderForTab(tabId) {
    const tabNames = {
        'chat': 'AI Chat',
        'image': 'Image Generator',
        'text': 'Text Generator',
        'models': 'AI Models',
        'more': 'Settings'
    };
    
    // You could update a title element here if needed
}

function openMenu() {
    elements.sideMenu.classList.add('open');
    elements.menuOverlay.classList.add('show');
    document.body.style.overflow = 'hidden';
    provideHapticFeedback('light');
}

function closeMenu() {
    elements.sideMenu.classList.remove('open');
    elements.menuOverlay.classList.remove('show');
    document.body.style.overflow = '';
}

function autoResizeTextarea() {
    const textarea = elements.messageInput;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

function updateKeyStatus() {
    const statusElement = elements.keyStatus;
    if (!statusElement) return;
    
    const icon = statusElement.querySelector('i');
    const text = statusElement.querySelector('span');
    
    if (state.apiKey) {
        const isValid = state.apiKey.startsWith('sk_') || state.apiKey.startsWith('pk_');
        icon.className = isValid ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
        text.textContent = isValid ? 'Key Valid' : 'Invalid Key';
        statusElement.classList.toggle('valid', isValid);
    } else {
        icon.className = 'fas fa-key';
        text.textContent = 'No Key';
        statusElement.classList.remove('valid');
    }
}

async function updateBalance() {
    if (!state.apiKey || !state.userSettings.autoRefreshBalance) return;
    
    try {
        // Note: This endpoint might need adjustment based on actual API
        const response = await callAPI('/usage');
        if (response && elements.balanceDisplay) {
            state.currentBalance = response;
            elements.balanceDisplay.textContent = response.balance || 'N/A';
        }
    } catch (error) {
        console.error('Failed to fetch balance:', error);
    }
}

// Chat Functions
async function sendChatMessage() {
    const message = elements.messageInput.value.trim();
    if (!message && state.uploads.images.length === 0) {
        showToast('Please enter a message or upload an image', 'warning');
        return;
    }
    
    // Add user message to chat
    addChatMessage('user', message, state.uploads.images);
    
    // Clear input and preview
    elements.messageInput.value = '';
    autoResizeTextarea();
    clearUploads();
    
    // Prepare API request
    const messages = [...state.chatHistory];
    const model = elements.chatModel?.value || state.userSettings.defaultModel;
    const temperature = parseFloat(elements.tempValue?.textContent || 1);
    const stream = elements.streaming?.checked || false;
    
    const requestData = {
        model,
        messages,
        temperature,
        stream
    };
    
    // Add vision capabilities if images are uploaded
    if (state.uploads.images.length > 0) {
        const lastMessage = requestData.messages[requestData.messages.length - 1];
        if (Array.isArray(lastMessage.content)) {
            lastMessage.content = [
                ...lastMessage.content,
                ...state.uploads.images.map(img => ({
                    type: 'image_url',
                    image_url: { url: img.data }
                }))
            ];
        }
    }
    
    showLoading('Generating response...');
    
    try {
        const response = await callAPI('/v1/chat/completions', {
            method: 'POST',
            body: JSON.stringify(requestData)
        });
        
        if (response && response.choices && response.choices[0]) {
            const assistantMessage = response.choices[0].message.content;
            addChatMessage('assistant', assistantMessage);
            
            // Update usage stats
            if (response.usage) {
                updateUsageStats(response.usage);
            }
            
            showToast('Response received', 'success');
        }
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

function addChatMessage(role, content, images = [], saveToHistory = true) {
    const chatMessages = elements.chatMessages;
    if (!chatMessages) return;
    
    // Remove welcome message if present
    const welcomeMsg = chatMessages.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    let contentHTML = '';
    if (typeof content === 'string') {
        contentHTML = `<div class="message-content">${escapeHtml(content)}</div>`;
    } else if (Array.isArray(content)) {
        contentHTML = content.map(part => {
            if (part.type === 'text') {
                return `<div class="message-content">${escapeHtml(part.text)}</div>`;
            } else if (part.type === 'image_url') {
                return `<img src="${part.image_url.url}" alt="Uploaded image" style="max-width: 100%; border-radius: 8px; margin-top: 8px;">`;
            }
            return '';
        }).join('');
    }
    
    // Add uploaded images
    if (images && images.length > 0) {
        contentHTML += images.map(img => 
            `<img src="${img.data}" alt="Uploaded image" style="max-width: 100%; border-radius: 8px; margin-top: 8px;">`
        ).join('');
    }
    
    messageDiv.innerHTML = `
        ${contentHTML}
        <div class="message-time">${time}</div>
    `;
    
    chatMessages.appendChild(messageDiv);
    
    // Save to history
    if (saveToHistory) {
        state.chatHistory.push({
            role,
            content,
            timestamp: new Date().toISOString(),
            images
        });
        
        // Limit history size
        if (state.chatHistory.length > 50) {
            state.chatHistory.shift();
        }
    }
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Image Generation Functions
async function generateImage() {
    const prompt = elements.imagePrompt?.value.trim();
    if (!prompt) {
        showToast('Please enter a prompt', 'warning');
        return;
    }
    
    const model = elements.imageModel?.value || 'flux';
    const width = elements.width?.value || 1024;
    const height = elements.height?.value || 1024;
    const seed = elements.seed?.value || 0;
    const quality = elements.quality?.value || 'medium';
    const enhance = elements.enhance?.checked || false;
    const safe = elements.safe?.checked || false;
    
    const isVideo = model === 'veo' || model === 'seedance';
    showLoading(`Generating ${isVideo ? 'video' : 'image'}...`);
    
    try {
        const promptParam = encodeURIComponent(prompt);
        let url = `${CONFIG.API_BASE_URL}/image/${promptParam}?model=${model}&width=${width}&height=${height}&seed=${seed}&quality=${quality}`;
        
        if (enhance) url += '&enhance=true';
        if (safe) url += '&safe=true';
        
        // Add negative prompt if provided
        const negativePrompt = elements.negativePrompt?.value;
        if (negativePrompt && negativePrompt.trim()) {
            url += `&negative_prompt=${encodeURIComponent(negativePrompt.trim())}`;
        }
        
        // Video-specific parameters
        if (isVideo) {
            const duration = elements.duration?.value;
            const aspectRatio = elements.aspectRatio?.value;
            const audio = elements.audio?.checked;
            
            if (duration) url += `&duration=${duration}`;
            if (aspectRatio) url += `&aspectRatio=${aspectRatio}`;
            if (audio) url += '&audio=true';
        }
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${state.apiKey}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const blob = await response.blob();
        const objectURL = URL.createObjectURL(blob);
        
        // Add to generated images
        const imageData = {
            url: objectURL,
            prompt,
            model,
            timestamp: new Date().toISOString(),
            width,
            height,
            seed,
            type: isVideo ? 'video' : 'image'
        };
        
        state.generatedImages.unshift(imageData);
        displayGeneratedImages();
        
        showToast(`${isVideo ? 'Video' : 'Image'} generated successfully!`, 'success');
        provideHapticFeedback('success');
        
    } catch (error) {
        showToast(`Failed to generate: ${error.message}`, 'error');
        provideHapticFeedback('error');
    } finally {
        hideLoading();
    }
}

async function generateBatchImages(count) {
    const prompt = elements.imagePrompt?.value.trim();
    if (!prompt) {
        showToast('Please enter a prompt first', 'warning');
        return;
    }
    
    showLoading(`Generating ${count} images...`);
    elements.generateImage.disabled = true;
    elements.batchGenerate.disabled = true;
    
    try {
        const promises = [];
        for (let i = 0; i < count; i++) {
            // Generate random seed for each image
            elements.seed.value = Math.floor(Math.random() * 1000000);
            
            // Create a promise for each image generation
            promises.push(generateImageInternal(prompt, i));
            
            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        await Promise.all(promises);
        showToast(`Generated ${count} images successfully!`, 'success');
        provideHapticFeedback('success');
        
    } catch (error) {
        showToast(`Batch generation failed: ${error.message}`, 'error');
    } finally {
        elements.generateImage.disabled = false;
        elements.batchGenerate.disabled = false;
        hideLoading();
    }
}

async function generateImageInternal(prompt, index) {
    // This is a simplified version of generateImage for batch processing
    const model = elements.imageModel?.value || 'flux';
    const width = elements.width?.value || 1024;
    const height = elements.height?.value || 1024;
    const seed = elements.seed?.value || 0;
    
    const promptParam = encodeURIComponent(prompt);
    let url = `${CONFIG.API_BASE_URL}/image/${promptParam}?model=${model}&width=${width}&height=${height}&seed=${seed}`;
    
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${state.apiKey}`
        }
    });
    
    if (!response.ok) {
        throw new Error(`Image ${index + 1}: HTTP ${response.status}`);
    }
    
    const blob = await response.blob();
    const objectURL = URL.createObjectURL(blob);
    
    const imageData = {
        url: objectURL,
        prompt,
        model,
        timestamp: new Date().toISOString(),
        width,
        height,
        seed,
        type: 'image'
    };
    
    state.generatedImages.unshift(imageData);
    displayGeneratedImages();
}

function displayGeneratedImages() {
    const imagesScroll = elements.imagesScroll;
    if (!imagesScroll) return;
    
    imagesScroll.innerHTML = '';
    
    if (state.generatedImages.length === 0) {
        imagesScroll.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-image"></i>
                <p>Your generated images will appear here</p>
            </div>
        `;
        return;
    }
    
    state.generatedImages.slice(0, 10).forEach((image, index) => {
        const imageCard = document.createElement('div');
        imageCard.className = 'image-card';
        
        const media = image.type === 'video' ? 
            `<video src="${image.url}" controls style="width: 100%; height: 200px; object-fit: cover; border-radius: 12px;"></video>` :
            `<img src="${image.url}" alt="${image.prompt.substring(0, 50)}..." loading="lazy" style="width: 100%; height: 200px; object-fit: cover; border-radius: 12px;">`;
        
        imageCard.innerHTML = `
            ${media}
            <div class="image-info">
                <div class="image-title">${image.prompt.substring(0, 50)}${image.prompt.length > 50 ? '...' : ''}</div>
                <div class="image-meta">${image.model} • ${image.width}x${image.height}</div>
                <div class="image-actions">
                    <button onclick="downloadImage('${image.url}', 'pollinations_${index}.${image.type === 'video' ? 'mp4' : 'jpg'}')">
                        <i class="fas fa-download"></i>
                    </button>
                    <button onclick="shareImage('${image.url}', '${image.prompt}')">
                        <i class="fas fa-share"></i>
                    </button>
                    <button onclick="deleteImage(${index})" style="color: var(--danger);">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
        
        imagesScroll.appendChild(imageCard);
    });
}

// Text Generation Functions
async function generateText() {
    const prompt = elements.textPrompt?.value.trim();
    if (!prompt) {
        showToast('Please enter a prompt', 'warning');
        return;
    }
    
    const model = elements.textModel?.value || state.userSettings.defaultModel;
    const maxTokens = parseInt(elements.maxTokens?.value || 500);
    const temperature = parseFloat(elements.textTempValue?.textContent || 0.7);
    const stream = elements.textStreaming?.checked || false;
    const jsonMode = elements.jsonMode?.checked || false;
    
    showLoading('Generating text...');
    elements.generateText.disabled = true;
    elements.stopGeneration.disabled = false;
    state.isStreaming = stream;
    
    const startTime = Date.now();
    
    try {
        const messages = [{
            role: 'user',
            content: prompt
        }];
        
        const requestData = {
            model,
            messages,
            max_tokens: maxTokens,
            temperature,
            stream
        };
        
        if (jsonMode) {
            requestData.response_format = { type: 'json_object' };
        }
        
        if (stream) {
            await streamTextResponse(requestData);
        } else {
            const response = await callAPI('/v1/chat/completions', {
                method: 'POST',
                body: JSON.stringify(requestData)
            });
            
            if (response && response.choices && response.choices[0]) {
                const text = response.choices[0].message.content;
                displayTextResult(text, response.usage);
                showToast('Text generated successfully!', 'success');
                provideHapticFeedback('success');
            }
        }
        
        const endTime = Date.now();
        updateResponseTime(endTime - startTime);
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
        provideHapticFeedback('error');
    } finally {
        elements.generateText.disabled = false;
        elements.stopGeneration.disabled = true;
        state.isStreaming = false;
        hideLoading();
    }
}

async function streamTextResponse(requestData) {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedText = '';
        
        // Clear previous output
        const textOutput = elements.textOutput;
        textOutput.innerHTML = '';
        textOutput.classList.remove('empty-state');
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;
                    
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta) {
                            const delta = parsed.choices[0].delta;
                            if (delta.content) {
                                accumulatedText += delta.content;
                                textOutput.textContent = accumulatedText;
                                textOutput.scrollTop = textOutput.scrollHeight;
                            }
                        }
                    } catch (e) {
                        console.error('Failed to parse stream data:', e);
                    }
                }
            }
        }
        
        // Save the generated text
        state.generatedTexts.unshift({
            text: accumulatedText,
            prompt: requestData.messages[requestData.messages.length - 1].content,
            model: requestData.model,
            timestamp: new Date().toISOString()
        });
        
        showToast('Streaming completed', 'success');
        
    } catch (error) {
        if (error.name !== 'AbortError') {
            throw error;
        }
    }
}

function displayTextResult(text, usage = null) {
    const textOutput = elements.textOutput;
    if (!textOutput) return;
    
    textOutput.innerHTML = '';
    textOutput.classList.remove('empty-state');
    
    // Format the text with proper line breaks
    const formattedText = text.replace(/\n/g, '<br>').replace(/  /g, ' &nbsp;');
    textOutput.innerHTML = formattedText;
    
    // Update token count
    if (usage) {
        updateUsageStats(usage);
    }
}

// Utility Functions
function saveApiKey() {
    const key = elements.apiKey.value.trim();
    
    if (!key) {
        showToast('Please enter an API key', 'warning');
        return;
    }
    
    if (!key.startsWith('sk_') && !key.startsWith('pk_')) {
        showToast('Invalid API key format. Must start with "sk_" or "pk_"', 'error');
        return;
    }
    
    state.apiKey = key;
    updateKeyStatus();
    
    if (state.userSettings.autoSaveKey) {
        saveSettings();
    }
    
    showToast('API key saved successfully', 'success');
    provideHapticFeedback('success');
    updateBalance();
}

function clearApiKey() {
    if (!state.apiKey) {
        showToast('No API key to clear', 'info');
        return;
    }
    
    if (confirm('Are you sure you want to clear your API key?')) {
        state.apiKey = '';
        if (elements.apiKey) {
            elements.apiKey.value = '';
        }
        updateKeyStatus();
        saveSettings();
        showToast('API key cleared', 'success');
        provideHapticFeedback('success');
    }
}

function showAuthModal() {
    elements.authModal.classList.add('show');
    provideHapticFeedback('medium');
}

function hideAuthModal() {
    elements.authModal.classList.remove('show');
}

function startBYOPAuth() {
    const redirectUrl = encodeURIComponent(window.location.href.split('#')[0]);
    window.location.href = `https://enter.pollinations.ai/authorize?redirect_url=${redirectUrl}`;
}

function checkForURLToken() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const apiKey = params.get('api_key');
    
    if (apiKey) {
        state.apiKey = apiKey;
        if (elements.apiKey) {
            elements.apiKey.value = apiKey;
        }
        updateKeyStatus();
        saveSettings();
        showToast('API key received from authentication', 'success');
        provideHapticFeedback('success');
        
        // Clean URL
        window.location.hash = '';
    }
}

function adjustTemperature(delta) {
    const tempElement = elements.tempValue;
    if (!tempElement) return;
    
    let currentTemp = parseFloat(tempElement.textContent);
    currentTemp = Math.max(0, Math.min(2, currentTemp + delta));
    tempElement.textContent = currentTemp.toFixed(1);
    provideHapticFeedback('light');
}

function handleImageUpload(event) {
    const files = Array.from(event.target.files);
    
    if (files.length > 3) {
        showToast('Maximum 3 images allowed', 'warning');
        return;
    }
    
    files.forEach(file => {
        if (!file.type.startsWith('image/')) {
            showToast(`${file.name} is not an image file`, 'error');
            return;
        }
        
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            showToast(`${file.name} is too large (max 5MB)`, 'error');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const imageData = {
                name: file.name,
                type: file.type,
                data: e.target.result,
                size: file.size
            };
            
            state.uploads.images.push(imageData);
            updatePreviewArea();
            showToast(`Uploaded: ${file.name}`, 'success');
        };
        reader.readAsDataURL(file);
    });
    
    event.target.value = '';
}

function handleFileUpload(event) {
    const files = Array.from(event.target.files);
    
    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const fileData = {
                name: file.name,
                type: file.type,
                data: e.target.result,
                size: file.size
            };
            
            state.uploads.files.push(fileData);
            showToast(`Uploaded: ${file.name}`, 'success');
        };
        reader.readAsText(file);
    });
    
    event.target.value = '';
}

function updatePreviewArea() {
    const previewArea = elements.previewArea;
    if (!previewArea) return;
    
    previewArea.innerHTML = '';
    
    if (state.uploads.images.length === 0) {
        return;
    }
    
    const previewContainer = document.createElement('div');
    previewContainer.style.display = 'flex';
    previewContainer.style.gap = '8px';
    previewContainer.style.overflowX = 'auto';
    previewContainer.style.padding = '8px 0';
    
    state.uploads.images.forEach((image, index) => {
        const preview = document.createElement('div');
        preview.style.position = 'relative';
        preview.style.flexShrink = '0';
        
        const img = document.createElement('img');
        img.src = image.data;
        img.alt = image.name;
        img.style.width = '60px';
        img.style.height = '60px';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '8px';
        
        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        removeBtn.style.position = 'absolute';
        removeBtn.style.top = '-4px';
        removeBtn.style.right = '-4px';
        removeBtn.style.width = '20px';
        removeBtn.style.height = '20px';
        removeBtn.style.background = 'var(--danger)';
        removeBtn.style.color = 'white';
        removeBtn.style.border = 'none';
        removeBtn.style.borderRadius = '50%';
        removeBtn.style.fontSize = '10px';
        removeBtn.style.cursor = 'pointer';
        removeBtn.style.display = 'flex';
        removeBtn.style.alignItems = 'center';
        removeBtn.style.justifyContent = 'center';
        removeBtn.onclick = () => {
            state.uploads.images.splice(index, 1);
            updatePreviewArea();
        };
        
        preview.appendChild(img);
        preview.appendChild(removeBtn);
        previewContainer.appendChild(preview);
    });
    
    previewArea.appendChild(previewContainer);
}

function clearUploads() {
    state.uploads.images = [];
    state.uploads.files = [];
    updatePreviewArea();
}

function generateRandomSeed() {
    const seed = Math.floor(Math.random() * 1000000);
    if (elements.seed) {
        elements.seed.value = seed;
    }
    provideHapticFeedback('light');
}

function showPromptSamples() {
    const samples = [
        "A majestic dragon soaring over a mystical forest at sunset, digital art, vibrant colors",
        "A futuristic cityscape with flying cars and neon lights, cyberpunk style",
        "A cute cartoon character exploring a magical garden, animated movie style",
        "An astronaut riding a horse on Mars, surreal art, detailed painting",
        "A serene Japanese garden with cherry blossoms and koi pond, watercolor style"
    ];
    
    const randomSample = samples[Math.floor(Math.random() * samples.length)];
    if (elements.imagePrompt) {
        elements.imagePrompt.value = randomSample;
        elements.imagePrompt.focus();
    }
    showToast('Example prompt loaded', 'info');
    provideHapticFeedback('light');
}

function enhancePrompt() {
    const originalPrompt = elements.imagePrompt?.value;
    if (!originalPrompt) {
        showToast('Please enter a prompt first', 'warning');
        return;
    }
    
    // Simple enhancement - in production, you might want to use an AI model for this
    const enhanced = `High quality, professional, detailed, 4k, masterpiece, ${originalPrompt}`;
    if (elements.imagePrompt) {
        elements.imagePrompt.value = enhanced;
        elements.imagePrompt.focus();
    }
    showToast('Prompt enhanced', 'success');
    provideHapticFeedback('light');
}

function clearGeneratedImages() {
    if (state.generatedImages.length === 0) {
        showToast('No images to clear', 'info');
        return;
    }
    
    if (confirm(`Clear ${state.generatedImages.length} generated images?`)) {
        state.generatedImages = [];
        displayGeneratedImages();
        showToast('All images cleared', 'success');
        provideHapticFeedback('success');
    }
}

function showImageSettings() {
    elements.imageSettingsModal.classList.add('show');
    provideHapticFeedback('medium');
}

function hideImageSettings() {
    elements.imageSettingsModal.classList.remove('show');
}

function toggleVideoSettings() {
    const model = elements.imageModel?.value;
    const videoSettings = document.getElementById('videoSettings');
    
    if (videoSettings) {
        if (model === 'veo' || model === 'seedance') {
            videoSettings.style.display = 'block';
        } else {
            videoSettings.style.display = 'none';
        }
    }
}

function stopGeneration() {
    if (state.abortController) {
        state.abortController.abort();
        state.isStreaming = false;
        elements.stopGeneration.disabled = true;
        showToast('Generation stopped', 'info');
        provideHapticFeedback('medium');
    }
}

function copyGeneratedText() {
    const text = elements.textOutput?.textContent;
    if (!text || text.includes('Your generated text will appear here')) {
        showToast('No text to copy', 'warning');
        return;
    }
    
    navigator.clipboard.writeText(text)
        .then(() => {
            showToast('Text copied to clipboard', 'success');
            provideHapticFeedback('success');
        })
        .catch(() => showToast('Failed to copy text', 'error'));
}

function clearGeneratedText() {
    const textOutput = elements.textOutput;
    if (!textOutput) return;
    
    textOutput.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-file-alt"></i>
            <p>Your generated text will appear here</p>
        </div>
    `;
    textOutput.classList.add('empty-state');
    showToast('Text cleared', 'success');
    provideHapticFeedback('light');
}

function showTextPresets() {
    elements.textPresetsModal.classList.add('show');
    provideHapticFeedback('medium');
}

function hideTextPresets() {
    elements.textPresetsModal.classList.remove('show');
}

function applyTextPreset(preset) {
    const presets = {
        creative: {
            text: "Write a short story about a time traveler who accidentally changes a minor historical event.",
            system: "You are a creative writer. Write in an engaging, descriptive style."
        },
        code: {
            text: "Write a Python function that takes a list of numbers and returns a dictionary with statistics (mean, median, mode).",
            system: "You are an expert programmer. Write clean, efficient, and well-documented code."
        },
        analysis: {
            text: "Analyze the impact of artificial intelligence on modern education.",
            system: "You are an analytical thinker. Break down complex topics and provide clear explanations."
        },
        translation: {
            text: "Translate the following English text to Spanish: 'The quick brown fox jumps over the lazy dog.'",
            system: "You are a professional translator. Provide accurate translations while maintaining cultural context."
        }
    };
    
    const selected = presets[preset];
    if (selected) {
        if (elements.textPrompt) {
            elements.textPrompt.value = selected.text;
        }
        if (elements.systemPrompt) {
            elements.systemPrompt.value = selected.system;
        }
        showToast(`${preset} preset applied`, 'success');
        provideHapticFeedback('light');
    }
}

function applySystemPreset(preset) {
    const presets = {
        assistant: "You are a helpful AI assistant. Provide accurate and useful information.",
        creative: "You are a creative writer. Write in an engaging, descriptive style.",
        coder: "You are an expert programmer. Write clean, efficient, and well-documented code.",
        analyst: "You are a data analyst. Provide clear, data-driven insights and analysis."
    };
    
    if (presets[preset] && elements.systemPrompt) {
        elements.systemPrompt.value = presets[preset];
        showToast(`System prompt: ${preset}`, 'success');
        provideHapticFeedback('light');
    }
}

function initializeModels() {
    // Combine all models
    state.availableModels = [
        ...CONFIG.MODELS.text,
        ...CONFIG.MODELS.image,
        ...CONFIG.MODELS.video
    ];
    
    displayModels();
}

function displayModels(filter = 'all') {
    const modelsList = elements.modelsList;
    if (!modelsList) return;
    
    let filteredModels = state.availableModels;
    
    if (filter !== 'all') {
        filteredModels = state.availableModels.filter(model => model.type === filter);
    }
    
    modelsList.innerHTML = '';
    
    if (filteredModels.length === 0) {
        modelsList.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-info-circle"></i>
                <p>No models found</p>
            </div>
        `;
        return;
    }
    
    filteredModels.forEach(model => {
        const modelCard = document.createElement('div');
        modelCard.className = 'model-card';
        modelCard.dataset.modelId = model.id;
        
        modelCard.innerHTML = `
            <div class="model-header">
                <div class="model-name">${model.name}</div>
                <div class="model-type">${model.type.toUpperCase()}</div>
            </div>
            <div class="model-description">${model.description}</div>
            <div class="model-pricing">Price: Pollen</div>
        `;
        
        modelsList.appendChild(modelCard);
    });
}

function filterModels(type) {
    displayModels(type);
}

function selectModel(modelId) {
    const model = state.availableModels.find(m => m.id === modelId);
    if (!model) return;
    
    state.selectedModel = model;
    
    // Update model details
    const modelDetails = elements.modelDetails;
    if (modelDetails) {
        modelDetails.innerHTML = `
            <div class="model-detail-card">
                <h3>${model.name}</h3>
                <div class="detail-item">
                    <span class="detail-label">Type:</span>
                    <span class="detail-value">${model.type}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Description:</span>
                    <span class="detail-value">${model.description}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Pricing:</span>
                    <span class="detail-value">Paid with Pollen</span>
                </div>
                <div class="model-actions">
                    <button onclick="useModel('${model.id}')" class="btn-primary">
                        <i class="fas fa-play"></i> Use This Model
                    </button>
                </div>
            </div>
        `;
    }
    
    // Highlight selected model
    document.querySelectorAll('.model-card').forEach(card => {
        card.classList.remove('selected');
        if (card.dataset.modelId === modelId) {
            card.classList.add('selected');
        }
    });
    
    showToast(`Selected: ${model.name}`, 'info');
    provideHapticFeedback('light');
}

function useModel(modelId) {
    const model = state.availableModels.find(m => m.id === modelId);
    if (!model) return;
    
    switch (model.type) {
        case 'text':
            switchTab('text');
            if (elements.textModel) {
                elements.textModel.value = model.id;
            }
            break;
        case 'image':
        case 'video':
            switchTab('image');
            if (elements.imageModel) {
                elements.imageModel.value = model.id;
                toggleVideoSettings();
            }
            break;
    }
    
    showToast(`Using ${model.name}`, 'success');
    provideHapticFeedback('success');
}

function startAudioRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('Audio recording not supported on this device', 'error');
        return;
    }
    
    showToast('Audio recording not implemented yet', 'info');
    // Note: Audio recording implementation would require additional setup
    // and proper permissions handling
}

function updateUsageStats(usage) {
    // Update UI with usage statistics
    console.log('Usage:', usage);
    // You could update a status bar or usage display here
}

function updateResponseTime(timeMs) {
    console.log(`Response time: ${timeMs}ms`);
    // Update response time display if needed
}

function showLoading(message = 'Processing...') {
    state.isLoading = true;
    if (elements.loadingOverlay) {
        elements.loadingOverlay.classList.add('show');
        elements.loadingMessage.textContent = message;
    }
    
    // Disable interactive elements
    document.querySelectorAll('button, input, textarea, select').forEach(el => {
        if (!el.classList.contains('cancel')) {
            el.disabled = true;
        }
    });
}

function hideLoading() {
    state.isLoading = false;
    if (elements.loadingOverlay) {
        elements.loadingOverlay.classList.remove('show');
    }
    
    // Re-enable interactive elements
    document.querySelectorAll('button, input, textarea, select').forEach(el => {
        el.disabled = false;
    });
}

function cancelLoading() {
    if (state.abortController) {
        state.abortController.abort();
    }
    hideLoading();
    showToast('Operation cancelled', 'info');
    provideHapticFeedback('medium');
}

function showToast(message, type = 'info') {
    const toastContainer = elements.toastContainer;
    if (!toastContainer) return;
    
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-icon">
            <i class="${icons[type]}"></i>
        </div>
        <div class="toast-content">
            <div class="toast-message">${escapeHtml(message)}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    toastContainer.appendChild(toast);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 5000);
    
    // Provide haptic feedback based on toast type
    if (type === 'success') {
        provideHapticFeedback('success');
    } else if (type === 'error') {
        provideHapticFeedback('error');
    } else {
        provideHapticFeedback('light');
    }
}

function provideHapticFeedback(type = 'light') {
    if (!state.userSettings.hapticFeedback || !navigator.vibrate) return;
    
    const patterns = {
        light: [50],
        medium: [100],
        heavy: [200],
        success: [50, 50, 100],
        error: [200, 100, 200],
        warning: [150, 75, 150]
    };
    
    navigator.vibrate(patterns[type] || patterns.light);
}

function updateUI() {
    updateKeyStatus();
    updateBalance();
    
    // Update chat display if needed
    if (state.chatHistory.length > 0 && elements.chatMessages) {
        updateChatDisplay();
    }
}

function updateChatDisplay() {
    const chatMessages = elements.chatMessages;
    if (!chatMessages || state.chatHistory.length === 0) return;
    
    // Clear and rebuild chat messages
    chatMessages.innerHTML = '';
    state.chatHistory.forEach(msg => {
        addChatMessage(msg.role, msg.content, msg.images, false);
    });
}

function exportSettings() {
    const settings = {
        ...state.userSettings,
        apiKey: '' // Don't export the API key
    };
    
    const dataStr = JSON.stringify(settings, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = 'pollinations_settings.json';
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    showToast('Settings exported', 'success');
    provideHapticFeedback('success');
}

function resetSettings() {
    if (confirm('Are you sure you want to reset all settings to default?')) {
        state.userSettings = { ...CONFIG.DEFAULT_SETTINGS };
        state.apiKey = '';
        saveSettings();
        applySettings();
        showToast('Settings reset to default', 'success');
        provideHapticFeedback('success');
    }
}

function showAbout() {
    showToast('Pollinations AI Mobile Client v1.0.0', 'info');
}

function showAPIDocs() {
    window.open('https://pollinations.ai/docs', '_blank');
}

function showSupport() {
    window.open('https://github.com/pollinations/pollinations/issues', '_blank');
}

function showQuickStart() {
    showToast('Check the menu for quick access to all features!', 'info');
}

function handleKeyboardShortcuts(e) {
    // Ctrl/Cmd + K to focus API key input
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        elements.apiKey?.focus();
    }
    
    // Escape to close modals
    if (e.key === 'Escape') {
        closeMenu();
        hideAuthModal();
        hideImageSettings();
        hideTextPresets();
        cancelLoading();
    }
}

function showQuickActions(button) {
    const tab = button.dataset.tab;
    const actions = {
        chat: ['New Chat', 'Clear History', 'Export Chat'],
        image: ['Quick Generate', 'Batch Mode', 'View Gallery'],
        text: ['Quick Generate', 'Copy Last', 'Save Template'],
        models: ['Refresh List', 'View Details', 'Compare Models'],
        more: ['Backup Settings', 'Clear Cache', 'About']
    };
    
    // Create quick action menu
    const menu = document.createElement('div');
    menu.className = 'quick-actions-menu';
    menu.style.cssText = `
        position: absolute;
        bottom: 60px;
        background: var(--bg-surface);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        min-width: 150px;
    `;
    
    actions[tab]?.forEach(action => {
        const item = document.createElement('button');
        item.textContent = action;
        item.style.cssText = `
            display: block;
            width: 100%;
            padding: 12px;
            border: none;
            background: none;
            text-align: left;
            color: var(--text-primary);
            border-radius: 8px;
            cursor: pointer;
        `;
        item.onmouseover = () => item.style.background = 'var(--bg-secondary)';
        item.onmouseout = () => item.style.background = 'none';
        item.onclick = () => {
            menu.remove();
            showToast(`Quick action: ${action}`, 'info');
        };
        menu.appendChild(item);
    });
    
    button.parentNode.appendChild(menu);
    
    // Remove menu on outside click
    setTimeout(() => {
        const removeMenu = (e) => {
            if (!menu.contains(e.target) && e.target !== button) {
                menu.remove();
                document.removeEventListener('click', removeMenu);
            }
        };
        document.addEventListener('click', removeMenu);
    }, 100);
}

// Utility Functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function downloadImage(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Image downloaded', 'success');
    provideHapticFeedback('success');
}

function shareImage(url, prompt) {
    if (navigator.share) {
        navigator.share({
            title: 'Pollinations AI Generated Image',
            text: prompt,
            url: url
        }).then(() => {
            showToast('Shared successfully', 'success');
        }).catch(error => {
            console.error('Share failed:', error);
            showToast('Share cancelled', 'info');
        });
    } else {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(prompt + '\n\n' + url)
            .then(() => {
                showToast('Copied to clipboard', 'success');
                provideHapticFeedback('success');
            })
            .catch(() => showToast('Failed to copy', 'error'));
    }
}

function deleteImage(index) {
    state.generatedImages.splice(index, 1);
    displayGeneratedImages();
    showToast('Image deleted', 'success');
    provideHapticFeedback('light');
}

// Initialize
updateUI();
