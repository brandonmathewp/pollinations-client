// Configuration
const CONFIG = {
    API_BASE_URL: 'https://gen.pollinations.ai',
    STORAGE_KEY: 'pollinations_client_config',
    DEFAULT_SETTINGS: {
        apiKey: '',
        defaultModel: 'openai',
        theme: 'auto',
        fontSize: 'medium',
        maxResults: 20,
        autoRefreshBalance: true,
        cacheDuration: 10,
        contentFilter: true,
        clearHistory: false,
        autoSaveKey: true
    }
};

// State Management
let state = {
    apiKey: '',
    currentTab: 'chat',
    chatHistory: [],
    generatedImages: [],
    generatedTexts: [],
    availableModels: {
        text: [],
        image: [],
        video: []
    },
    userSettings: {...CONFIG.DEFAULT_SETTINGS},
    currentBalance: null,
    isLoading: false,
    isStreaming: false,
    abortController: null,
    uploads: {
        images: [],
        files: []
    }
};

// DOM Elements
const elements = {};

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    initializeElements();
    loadSettings();
    setupEventListeners();
    loadModels();
    updateUI();
    
    // Check for URL fragments (BYOP redirect)
    checkForURLToken();
});

function initializeElements() {
    // Get all DOM elements with IDs
    document.querySelectorAll('[id]').forEach(element => {
        elements[element.id] = element;
    });
    
    // Initialize additional elements
    elements.tabs = document.querySelectorAll('.tab');
    elements.tabContents = document.querySelectorAll('.tab-content');
    elements.filterBtns = document.querySelectorAll('.filter-btn');
    elements.presetBtns = document.querySelectorAll('.preset-btn');
    elements.imageUpload = document.getElementById('imageUpload');
    elements.fileUpload = document.getElementById('fileUpload');
    elements.settingsFile = document.getElementById('settingsFile');
}

function loadSettings() {
    const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            state.userSettings = {...state.userSettings, ...parsed};
            state.apiKey = state.userSettings.apiKey || '';
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    }
    
    // Apply settings
    applySettings();
}

function saveSettings() {
    state.userSettings.apiKey = state.apiKey;
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state.userSettings));
}

function applySettings() {
    // Apply theme
    const theme = state.userSettings.theme;
    if (theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.remove('dark-theme');
    }
    
    // Apply font size
    document.body.style.fontSize = state.userSettings.fontSize === 'small' ? '14px' :
                                  state.userSettings.fontSize === 'large' ? '18px' : '16px';
    
    // Update API key input
    if (elements.apiKey) {
        elements.apiKey.value = state.apiKey;
        updateKeyStatus();
    }
    
    // Update select elements
    if (elements.defaultModel) {
        elements.defaultModel.value = state.userSettings.defaultModel;
    }
    
    if (elements.autoSaveKey) {
        elements.autoSaveKey.checked = state.userSettings.autoSaveKey;
    }
}

function setupEventListeners() {
    // Tab navigation
    elements.tabs.forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    
    // API Key management
    elements.saveKey?.addEventListener('click', saveApiKey);
    elements.clearKey?.addEventListener('click', clearApiKey);
    elements.byopBtn?.addEventListener('click', showAuthModal);
    elements.apiKey?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveApiKey();
    });
    
    // Authentication modal
    elements.startAuth?.addEventListener('click', startBYOPAuth);
    elements.closeAuth?.addEventListener('click', hideAuthModal);
    
    // Chat functionality
    elements.sendMessage?.addEventListener('click', sendChatMessage);
    elements.messageInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    });
    elements.newChat?.addEventListener('click', startNewChat);
    elements.uploadImage?.addEventListener('click', () => elements.imageUpload.click());
    elements.uploadFile?.addEventListener('click', () => elements.fileUpload.click());
    elements.imageUpload?.addEventListener('change', handleImageUpload);
    elements.fileUpload?.addEventListener('change', handleFileUpload);
    
    // Image generation
    elements.generateImage?.addEventListener('click', generateImage);
    elements.batchGenerate?.addEventListener('click', () => generateBatchImages(4));
    elements.clearResults?.addEventListener('click', clearGeneratedImages);
    elements.downloadAll?.addEventListener('click', downloadAllImages);
    elements.randomSeed?.addEventListener('click', () => {
        elements.seed.value = Math.floor(Math.random() * 1000000);
    });
    elements.promptSamples?.addEventListener('click', showPromptSamples);
    elements.promptEnhancer?.addEventListener('click', enhancePrompt);
    
    // Text generation
    elements.generateText?.addEventListener('click', generateText);
    elements.stopGeneration?.addEventListener('click', stopGeneration);
    elements.copyText?.addEventListener('click', copyGeneratedText);
    elements.clearText?.addEventListener('click', clearGeneratedText);
    
    // Model filters
    elements.filterBtns?.forEach(btn => {
        btn.addEventListener('click', () => filterModels(btn.dataset.type));
    });
    
    // Preset buttons
    elements.presetBtns?.forEach(btn => {
        btn.addEventListener('click', () => applyTextPreset(btn.dataset.preset));
    });
    
    // Settings
    elements.saveSettings?.addEventListener('click', saveUserSettings);
    elements.resetSettings?.addEventListener('click', resetSettings);
    elements.exportSettings?.addEventListener('click', exportSettings);
    elements.importSettings?.addEventListener('click', () => elements.settingsFile.click());
    elements.settingsFile?.addEventListener('change', importSettings);
    
    // Real-time updates for sliders
    const sliders = document.querySelectorAll('input[type="range"]');
    sliders.forEach(slider => {
        const valueSpan = document.getElementById(slider.id + 'Value');
        if (valueSpan) {
            slider.addEventListener('input', () => {
                valueSpan.textContent = slider.value;
            });
        }
    });
    
    // Model change handlers
    elements.imageModel?.addEventListener('change', toggleVideoSettings);
    
    // Close modal buttons
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(modal => {
                modal.style.display = 'none';
            });
        });
    });
    
    // Close modals when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });
}

// API Functions
async function callAPI(endpoint, options = {}) {
    if (!state.apiKey) {
        showError('API key is required');
        return null;
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
        const response = await fetch(`${CONFIG.API_BASE_URL}${endpoint}`, {
            ...defaultOptions,
            ...options
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || `API Error: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        if (error.name !== 'AbortError') {
            showError(error.message);
        }
        return null;
    }
}

async function loadModels() {
    showLoading('Loading available models...');
    
    try {
        // Load text models
        const textResponse = await callAPI('/v1/models');
        if (textResponse && textResponse.data) {
            state.availableModels.text = textResponse.data.map(model => ({
                id: model.id,
                name: model.id,
                type: 'text'
            }));
        }
        
        // Load image models
        const imageResponse = await callAPI('/image/models');
        if (Array.isArray(imageResponse)) {
            state.availableModels.image = imageResponse.filter(m => 
                !m.name.toLowerCase().includes('video')
            ).map(model => ({
                id: model.name,
                name: model.name,
                description: model.description,
                pricing: model.pricing,
                type: 'image'
            }));
            
            state.availableModels.video = imageResponse.filter(m => 
                m.name.toLowerCase().includes('video') || 
                ['veo', 'seedance'].includes(m.name.toLowerCase())
            ).map(model => ({
                id: model.name,
                name: model.name,
                description: model.description,
                pricing: model.pricing,
                type: 'video'
            }));
        }
        
        updateModelsDisplay();
    } catch (error) {
        console.error('Failed to load models:', error);
    } finally {
        hideLoading();
    }
}

async function sendChatMessage() {
    const message = elements.messageInput.value.trim();
    if (!message && state.uploads.images.length === 0) {
        showError('Please enter a message or upload an image');
        return;
    }
    
    // Add user message to chat
    addChatMessage('user', message, state.uploads.images);
    
    // Clear input and preview
    elements.messageInput.value = '';
    clearUploads();
    
    // Prepare API request
    const messages = [...state.chatHistory];
    const model = elements.chatModel?.value || state.userSettings.defaultModel;
    const temperature = parseFloat(elements.temperature?.value || 1);
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
        }
    } catch (error) {
        console.error('Chat error:', error);
    } finally {
        hideLoading();
    }
}

async function generateImage() {
    const prompt = elements.imagePrompt?.value.trim();
    if (!prompt) {
        showError('Please enter a prompt');
        return;
    }
    
    const model = elements.imageModel?.value || 'flux';
    const width = parseInt(elements.width?.value || 1024);
    const height = parseInt(elements.height?.value || 1024);
    const seed = parseInt(elements.seed?.value || 0);
    const negativePrompt = elements.negativePrompt?.value || 'worst quality, blurry';
    const enhance = elements.enhance?.checked || false;
    const safe = elements.safe?.checked || false;
    
    showLoading(`Generating ${model === 'veo' || model === 'seedance' ? 'video' : 'image'}...`);
    
    try {
        const promptParam = encodeURIComponent(prompt);
        let url = `${CONFIG.API_BASE_URL}/image/${promptParam}?model=${model}&width=${width}&height=${height}&seed=${seed}`;
        
        if (negativePrompt) url += `&negative_prompt=${encodeURIComponent(negativePrompt)}`;
        if (enhance) url += '&enhance=true';
        if (safe) url += '&safe=true';
        
        // Add reference image if provided
        const refImage = elements.referenceImage?.value;
        if (refImage) {
            url += `&image=${encodeURIComponent(refImage)}`;
        }
        
        // Video-specific parameters
        if (model === 'veo' || model === 'seedance') {
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
            type: model === 'veo' || model === 'seedance' ? 'video' : 'image'
        };
        
        state.generatedImages.unshift(imageData);
        displayGeneratedImages();
        
    } catch (error) {
        showError(`Failed to generate image: ${error.message}`);
    } finally {
        hideLoading();
    }
}

async function generateText() {
    const prompt = elements.textPrompt?.value.trim();
    if (!prompt) {
        showError('Please enter a prompt');
        return;
    }
    
    const model = elements.textModel?.value || state.userSettings.defaultModel;
    const systemPrompt = elements.systemPrompt?.value;
    const maxTokens = parseInt(elements.maxTokens?.value || 1000);
    const temperature = parseFloat(elements.textTemperature?.value || 0.7);
    const stream = elements.textStreaming?.checked || false;
    const jsonMode = elements.jsonMode?.checked || false;
    
    showLoading('Generating text...');
    elements.stopGeneration.disabled = false;
    state.isStreaming = stream;
    
    const startTime = Date.now();
    
    try {
        const messages = [];
        
        if (systemPrompt) {
            messages.push({
                role: 'system',
                content: systemPrompt
            });
        }
        
        messages.push({
            role: 'user',
            content: prompt
        });
        
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
            }
        }
        
        const endTime = Date.now();
        updateResponseTime(endTime - startTime);
        
    } catch (error) {
        console.error('Text generation error:', error);
    } finally {
        hideLoading();
        elements.stopGeneration.disabled = true;
        state.isStreaming = false;
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
        elements.textOutput.innerHTML = '';
        elements.textOutput.classList.remove('placeholder');
        
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
                                elements.textOutput.textContent = accumulatedText;
                                elements.textOutput.scrollTop = elements.textOutput.scrollHeight;
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
        
    } catch (error) {
        if (error.name !== 'AbortError') {
            throw error;
        }
    }
}

// UI Update Functions
function updateUI() {
    updateKeyStatus();
    updateBalanceDisplay();
    updateChatDisplay();
    updateModelsDisplay();
    updateSettingsDisplay();
}

function updateKeyStatus() {
    const statusElement = elements.keyStatus;
    if (!statusElement) return;
    
    if (state.apiKey) {
        const isValid = state.apiKey.startsWith('sk_') || state.apiKey.startsWith('pk_');
        statusElement.textContent = isValid ? 'API Key Valid' : 'Invalid Key Format';
        statusElement.className = isValid ? 'valid' : '';
    } else {
        statusElement.textContent = 'No API Key';
        statusElement.className = '';
    }
}

async function updateBalanceDisplay() {
    if (!state.apiKey || !state.userSettings.autoRefreshBalance) return;
    
    try {
        // Note: Actual balance endpoint might differ
        // This is a placeholder - you might need to adjust based on actual API
        const response = await callAPI('/usage');
        if (response) {
            state.currentBalance = response;
            if (elements.balanceDisplay) {
                elements.balanceDisplay.querySelector('span').textContent = 
                    `Balance: ${response.balance || 'N/A'}`;
            }
        }
    } catch (error) {
        console.error('Failed to fetch balance:', error);
    }
}

function updateChatDisplay() {
    if (!elements.chatMessages) return;
    
    elements.chatMessages.innerHTML = '';
    
    if (state.chatHistory.length === 0) {
        elements.chatMessages.innerHTML = `
            <div class="welcome-message">
                <h3>Welcome to Pollinations AI Chat</h3>
                <p>Start by entering your API key above, then type a message below to begin chatting!</p>
            </div>
        `;
        return;
    }
    
    state.chatHistory.forEach(message => {
        addChatMessage(message.role, message.content, message.images, false);
    });
    
    // Scroll to bottom
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function addChatMessage(role, content, images = [], saveToHistory = true) {
    if (!elements.chatMessages) return;
    
    // Remove welcome message if present
    const welcomeMsg = elements.chatMessages.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}-message`;
    
    const header = document.createElement('div');
    header.className = 'message-header';
    header.innerHTML = `
        <i class="fas fa-${role === 'user' ? 'user' : 'robot'}"></i>
        <span>${role === 'user' ? 'You' : 'Assistant'}</span>
        <span class="timestamp">${new Date().toLocaleTimeString()}</span>
    `;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    if (typeof content === 'string') {
        contentDiv.textContent = content;
    } else if (Array.isArray(content)) {
        content.forEach(part => {
            if (part.type === 'text') {
                const textSpan = document.createElement('span');
                textSpan.textContent = part.text;
                contentDiv.appendChild(textSpan);
            } else if (part.type === 'image_url') {
                const img = document.createElement('img');
                img.src = part.image_url.url;
                img.alt = 'Uploaded image';
                contentDiv.appendChild(img);
            }
        });
    }
    
    // Add uploaded images
    if (images && images.length > 0) {
        images.forEach(image => {
            const img = document.createElement('img');
            img.src = image.data;
            img.alt = 'Uploaded image';
            contentDiv.appendChild(img);
        });
    }
    
    messageDiv.appendChild(header);
    messageDiv.appendChild(contentDiv);
    elements.chatMessages.appendChild(messageDiv);
    
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
        
        updateChatHistoryList();
    }
    
    // Scroll to bottom
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function updateChatHistoryList() {
    if (!elements.historyList) return;
    
    elements.historyList.innerHTML = '';
    
    state.chatHistory.reverse().forEach((chat, index) => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.textContent = chat.content.substring(0, 50) + '...';
        item.addEventListener('click', () => loadChatFromHistory(chat));
        elements.historyList.appendChild(item);
    });
}

function displayGeneratedImages() {
    if (!elements.imagesGrid) return;
    
    elements.imagesGrid.innerHTML = '';
    
    if (state.generatedImages.length === 0) {
        elements.imagesGrid.innerHTML = `
            <div class="placeholder">
                <i class="fas fa-image"></i>
                <p>Your generated images will appear here</p>
            </div>
        `;
        return;
    }
    
    state.generatedImages.forEach((image, index) => {
        const card = document.createElement('div');
        card.className = 'image-card';
        
        const media = image.type === 'video' ? 
            `<video src="${image.url}" controls></video>` :
            `<img src="${image.url}" alt="${image.prompt}">`;
        
        card.innerHTML = `
            ${media}
            <div class="image-info">
                <p><strong>Model:</strong> ${image.model}</p>
                <p><strong>Size:</strong> ${image.width}x${image.height}</p>
                <div class="image-actions">
                    <button onclick="downloadImage('${image.url}', 'pollinations_${index}.${image.type === 'video' ? 'mp4' : 'jpg'}')">
                        <i class="fas fa-download"></i> Download
                    </button>
                    <button onclick="viewImage('${image.url}')">
                        <i class="fas fa-expand"></i> View
                    </button>
                    <button onclick="deleteImage(${index})" class="danger-btn">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>
        `;
        
        elements.imagesGrid.appendChild(card);
    });
}

function displayTextResult(text, usage = null) {
    if (!elements.textOutput) return;
    
    elements.textOutput.innerHTML = '';
    elements.textOutput.classList.remove('placeholder');
    elements.textOutput.textContent = text;
    
    // Update token count
    if (usage) {
        elements.tokenCount.textContent = `Tokens: ${usage.total_tokens}`;
        updateUsageStats(usage);
    }
}

// Utility Functions
function switchTab(tabId) {
    // Update active tab
    elements.tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabId);
    });
    
    // Show active content
    elements.tabContents.forEach(content => {
        content.classList.toggle('active', content.id === tabId);
    });
    
    state.currentTab = tabId;
    
    // Update current model display
    if (tabId === 'chat') {
        elements.currentModel.textContent = `Model: ${elements.chatModel?.value || 'openai'}`;
    } else if (tabId === 'image') {
        elements.currentModel.textContent = `Model: ${elements.imageModel?.value || 'flux'}`;
    } else if (tabId === 'text') {
        elements.currentModel.textContent = `Model: ${elements.textModel?.value || 'openai'}`;
    }
}

function saveApiKey() {
    const key = elements.apiKey.value.trim();
    
    if (!key) {
        showError('Please enter an API key');
        return;
    }
    
    if (!key.startsWith('sk_') && !key.startsWith('pk_')) {
        showError('Invalid API key format. Must start with "sk_" or "pk_"');
        return;
    }
    
    state.apiKey = key;
    updateKeyStatus();
    
    if (state.userSettings.autoSaveKey) {
        saveSettings();
    }
    
    showSuccess('API key saved successfully');
    updateBalanceDisplay();
}

function clearApiKey() {
    state.apiKey = '';
    if (elements.apiKey) {
        elements.apiKey.value = '';
    }
    updateKeyStatus();
    saveSettings();
    showSuccess('API key cleared');
}

function showAuthModal() {
    elements.authModal.style.display = 'flex';
}

function hideAuthModal() {
    elements.authModal.style.display = 'none';
}

function startBYOPAuth() {
    const redirectUrl = encodeURIComponent(window.location.href);
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
        showSuccess('API key received from authentication');
        
        // Clean URL
        window.location.hash = '';
    }
}

function startNewChat() {
    state.chatHistory = [];
    updateChatDisplay();
    showSuccess('New chat started');
}

function handleImageUpload(event) {
    const files = Array.from(event.target.files);
    
    files.forEach(file => {
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
            showSuccess(`Uploaded: ${file.name}`);
        };
        reader.readAsText(file);
    });
    
    event.target.value = '';
}

function updatePreviewArea() {
    if (!elements.previewArea) return;
    
    elements.previewArea.innerHTML = '';
    
    if (state.uploads.images.length === 0) {
        return;
    }
    
    const previewTitle = document.createElement('div');
    previewTitle.className = 'preview-title';
    previewTitle.textContent = 'Uploaded Images:';
    elements.previewArea.appendChild(previewTitle);
    
    const previewContainer = document.createElement('div');
    previewContainer.className = 'preview-images';
    
    state.uploads.images.forEach((image, index) => {
        const preview = document.createElement('div');
        preview.className = 'image-preview';
        
        const img = document.createElement('img');
        img.src = image.data;
        img.alt = image.name;
        
        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        removeBtn.className = 'remove-preview';
        removeBtn.onclick = () => {
            state.uploads.images.splice(index, 1);
            updatePreviewArea();
        };
        
        preview.appendChild(img);
        preview.appendChild(removeBtn);
        previewContainer.appendChild(preview);
    });
    
    elements.previewArea.appendChild(previewContainer);
}

function clearUploads() {
    state.uploads.images = [];
    state.uploads.files = [];
    updatePreviewArea();
}

function generateBatchImages(count) {
    for (let i = 0; i < count; i++) {
        // Randomize seed for each image
        if (elements.seed) {
            elements.seed.value = Math.floor(Math.random() * 1000000);
        }
        
        // Add small delay between requests
        setTimeout(() => generateImage(), i * 1000);
    }
}

function clearGeneratedImages() {
    state.generatedImages = [];
    displayGeneratedImages();
    showSuccess('All images cleared');
}

function downloadAllImages() {
    if (state.generatedImages.length === 0) {
        showError('No images to download');
        return;
    }
    
    state.generatedImages.forEach((image, index) => {
        downloadImage(image.url, `pollinations_${index}.${image.type === 'video' ? 'mp4' : 'jpg'}`);
    });
}

function downloadImage(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function viewImage(url) {
    elements.modalContent.innerHTML = `
        <img src="${url}" style="max-width: 100%; max-height: 70vh; border-radius: 8px;">
    `;
    elements.resultModal.style.display = 'flex';
}

function deleteImage(index) {
    state.generatedImages.splice(index, 1);
    displayGeneratedImages();
    showSuccess('Image deleted');
}

function stopGeneration() {
    if (state.abortController) {
        state.abortController.abort();
        state.isStreaming = false;
        elements.stopGeneration.disabled = true;
        showSuccess('Generation stopped');
    }
}

function copyGeneratedText() {
    const text = elements.textOutput.textContent;
    if (!text || text.includes('Your generated text will appear here')) {
        showError('No text to copy');
        return;
    }
    
    navigator.clipboard.writeText(text)
        .then(() => showSuccess('Text copied to clipboard'))
        .catch(() => showError('Failed to copy text'));
}

function clearGeneratedText() {
    elements.textOutput.innerHTML = `
        <div class="placeholder">
            <i class="fas fa-keyboard"></i>
            <p>Your generated text will appear here</p>
        </div>
    `;
    elements.textOutput.classList.add('placeholder');
}

function filterModels(type) {
    elements.filterBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });
    
    updateModelsDisplay(type);
}

function updateModelsDisplay(filter = 'all') {
    if (!elements.modelsGrid) return;
    
    let models = [];
    
    if (filter === 'all') {
        models = [
            ...state.availableModels.text,
            ...state.availableModels.image,
            ...state.availableModels.video
        ];
    } else if (filter === 'text') {
        models = state.availableModels.text;
    } else if (filter === 'image') {
        models = state.availableModels.image;
    } else if (filter === 'video') {
        models = state.availableModels.video;
    }
    
    elements.modelsGrid.innerHTML = '';
    
    if (models.length === 0) {
        elements.modelsGrid.innerHTML = `
            <div class="loading">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Loading available models...</p>
            </div>
        `;
        return;
    }
    
    models.forEach(model => {
        const card = document.createElement('div');
        card.className = 'model-card';
        card.dataset.modelId = model.id;
        card.dataset.modelType = model.type;
        
        card.innerHTML = `
            <h4>${model.name}</h4>
            <p class="model-type">${model.type.toUpperCase()}</p>
            ${model.description ? `<p class="model-desc">${model.description}</p>` : ''}
            ${model.pricing ? `<p class="model-price">Price: ${JSON.stringify(model.pricing)}</p>` : ''}
        `;
        
        card.addEventListener('click', () => showModelDetails(model));
        elements.modelsGrid.appendChild(card);
    });
}

function showModelDetails(model) {
    const details = document.getElementById('modelDetails');
    if (!details) return;
    
    details.innerHTML = `
        <div class="model-detail-card">
            <h3>${model.name}</h3>
            <div class="detail-item">
                <span class="detail-label">Type:</span>
                <span class="detail-value">${model.type}</span>
            </div>
            ${model.description ? `
            <div class="detail-item">
                <span class="detail-label">Description:</span>
                <span class="detail-value">${model.description}</span>
            </div>` : ''}
            ${model.pricing ? `
            <div class="detail-item">
                <span class="detail-label">Pricing:</span>
                <span class="detail-value">${JSON.stringify(model.pricing, null, 2)}</span>
            </div>` : ''}
            <div class="model-actions">
                <button onclick="useModel('${model.id}', '${model.type}')" class="primary-btn">
                    <i class="fas fa-play"></i> Use This Model
                </button>
            </div>
        </div>
    `;
}

function useModel(modelId, type) {
    if (type === 'text') {
        switchTab('text');
        if (elements.textModel) {
            elements.textModel.value = modelId;
        }
    } else if (type === 'image' || type === 'video') {
        switchTab('image');
        if (elements.imageModel) {
            elements.imageModel.value = modelId;
            toggleVideoSettings();
        }
    } else {
        switchTab('chat');
        if (elements.chatModel) {
            elements.chatModel.value = modelId;
        }
    }
    
    elements.currentModel.textContent = `Model: ${modelId}`;
    showSuccess(`Switched to ${modelId}`);
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
    }
}

function enhancePrompt() {
    const originalPrompt = elements.imagePrompt?.value;
    if (!originalPrompt) {
        showError('Please enter a prompt first');
        return;
    }
    
    // Simple enhancement - in production, you might want to use an AI model for this
    const enhanced = `High quality, professional, detailed, 4k, masterpiece, ${originalPrompt}`;
    if (elements.imagePrompt) {
        elements.imagePrompt.value = enhanced;
    }
    showSuccess('Prompt enhanced');
}

function applyTextPreset(preset) {
    const presets = {
        creative: {
            system: "You are a creative writer. Write in an engaging, descriptive style.",
            prompt: "Write a short story about a time traveler who accidentally changes a minor historical event."
        },
        code: {
            system: "You are an expert programmer. Write clean, efficient, and well-documented code.",
            prompt: "Write a Python function that takes a list of numbers and returns a dictionary with statistics (mean, median, mode)."
        },
        analysis: {
            system: "You are an analytical thinker. Break down complex topics and provide clear explanations.",
            prompt: "Analyze the impact of artificial intelligence on modern education."
        },
        translation: {
            system: "You are a professional translator. Provide accurate translations while maintaining cultural context.",
            prompt: "Translate the following English text to Spanish: 'The quick brown fox jumps over the lazy dog.'"
        }
    };
    
    const selected = presets[preset];
    if (selected) {
        if (elements.systemPrompt) {
            elements.systemPrompt.value = selected.system;
        }
        if (elements.textPrompt) {
            elements.textPrompt.value = selected.prompt;
        }
        showSuccess(`Applied ${preset} preset`);
    }
}

function saveUserSettings() {
    // Collect all settings
    state.userSettings = {
        ...state.userSettings,
        defaultModel: elements.defaultModel?.value || 'openai',
        theme: elements.themeSelect?.value || 'auto',
        fontSize: elements.fontSize?.value || 'medium',
        maxResults: parseInt(elements.maxResults?.value || 20),
        autoRefreshBalance: elements.autoRefreshBalance?.checked || false,
        cacheDuration: parseInt(elements.cacheDuration?.value || 10),
        contentFilter: elements.contentFilter?.checked || true,
        clearHistory: elements.clearHistory?.checked || false,
        autoSaveKey: elements.autoSaveKey?.checked || true
    };
    
    saveSettings();
    applySettings();
    showSuccess('Settings saved successfully');
}

function resetSettings() {
    if (confirm('Are you sure you want to reset all settings to default?')) {
        state.userSettings = {...CONFIG.DEFAULT_SETTINGS};
        saveSettings();
        applySettings();
        showSuccess('Settings reset to default');
    }
}

function exportSettings() {
    const settings = {
        ...state.userSettings,
        apiKey: '' // Don't export the API key for security
    };
    
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pollinations_settings.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showSuccess('Settings exported successfully');
}

function importSettings() {
    const file = elements.settingsFile.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            state.userSettings = { ...state.userSettings, ...imported };
            saveSettings();
            applySettings();
            showSuccess('Settings imported successfully');
        } catch (error) {
            showError('Failed to import settings: Invalid format');
        }
    };
    reader.readAsText(file);
    
    elements.settingsFile.value = '';
}

function updateUsageStats(usage) {
    if (elements.tokensUsed) {
        elements.tokensUsed.textContent = `Tokens: ${usage.total_tokens}`;
    }
    
    // Simple cost estimation (adjust based on your pricing)
    const estimatedCost = (usage.total_tokens / 1000) * 0.002; // Example: $0.002 per 1K tokens
    if (elements.costEstimate) {
        elements.costEstimate.textContent = `Cost: $${estimatedCost.toFixed(4)}`;
    }
}

function updateResponseTime(timeMs) {
    if (elements.responseTime) {
        elements.responseTime.textContent = `Response: ${timeMs}ms`;
    }
}

function updateSettingsDisplay() {
    // Update all setting controls
    if (elements.defaultModel) {
        elements.defaultModel.value = state.userSettings.defaultModel;
    }
    if (elements.themeSelect) {
        elements.themeSelect.value = state.userSettings.theme;
    }
    if (elements.fontSize) {
        elements.fontSize.value = state.userSettings.fontSize;
    }
    if (elements.maxResults) {
        elements.maxResults.value = state.userSettings.maxResults;
    }
    if (elements.autoRefreshBalance) {
        elements.autoRefreshBalance.checked = state.userSettings.autoRefreshBalance;
    }
    if (elements.cacheDuration) {
        elements.cacheDuration.value = state.userSettings.cacheDuration;
    }
    if (elements.contentFilter) {
        elements.contentFilter.checked = state.userSettings.contentFilter;
    }
    if (elements.clearHistory) {
        elements.clearHistory.checked = state.userSettings.clearHistory;
    }
    if (elements.autoSaveKey) {
        elements.autoSaveKey.checked = state.userSettings.autoSaveKey;
    }
}

// UI Helper Functions
function showLoading(message = 'Loading...') {
    state.isLoading = true;
    if (elements.loadingOverlay) {
        elements.loadingOverlay.style.display = 'flex';
        elements.loadingMessage.textContent = message;
    }
}

function hideLoading() {
    state.isLoading = false;
    if (elements.loadingOverlay) {
        elements.loadingOverlay.style.display = 'none';
    }
}

function showError(message) {
    alert(`Error: ${message}`);
}

function showSuccess(message) {
    // Create a temporary success message
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    successDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: var(--success-color);
        color: white;
        padding: 12px 20px;
        border-radius: var(--radius-md);
        z-index: 10000;
        animation: slideInRight 0.3s ease, fadeOut 0.3s ease 2.7s;
    `;
    
    document.body.appendChild(successDiv);
    
    setTimeout(() => {
        if (successDiv.parentNode) {
            successDiv.parentNode.removeChild(successDiv);
        }
    }, 3000);
}

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes fadeOut {
        from {
            opacity: 1;
        }
        to {
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
