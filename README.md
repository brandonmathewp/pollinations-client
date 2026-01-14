# Pollinations AI Web Client

A comprehensive web client for the Pollinations AI API, providing access to text generation, image generation, video creation, and chat capabilities.

## Features

### 🎯 Core Features
- **Text Generation**: Multiple AI models (OpenAI, Gemini, Claude, etc.)
- **Image Generation**: Support for Flux, ZImage, GPT Image, and more
- **Video Generation**: Create videos with Veo and Seedance models
- **AI Chat**: Conversational interface with vision capabilities
- **BYOP (Bring Your Own Pollen)**: User-based authentication and billing

### 🛠️ Advanced Features
- **Streaming Responses**: Real-time text generation
- **Batch Image Generation**: Generate multiple images at once
- **Prompt Enhancement**: AI-assisted prompt improvement
- **Model Browser**: Browse and filter available models
- **Settings Management**: Customizable interface and preferences

### 🔒 Security & Privacy
- Local API key storage (optional encryption)
- BYOP authentication flow
- Content filtering options
- Clear data controls

## Setup

1. **Clone or download** the project files
2. **Open `index.html`** in a modern web browser
3. **Get an API key** from [enter.pollinations.ai](https://enter.pollinations.ai)
4. **Enter your API key** in the header section

## API Key Types

- **Secret Keys (`sk_`)**: Server-side use, no rate limits, can spend Pollen
- **Publishable Keys (`pk_`)**: Client-side safe, IP rate-limited

## BYOP Authentication

To enable users to use their own Pollen:

1. Click "BYOP Auth" button
2. Users authenticate with Pollinations
3. API key is automatically retrieved and saved
4. All usage is billed to the user's account

## Usage Examples

### Image Generation
1. Navigate to Image Generation tab
2. Enter a detailed prompt
3. Adjust settings (size, model, etc.)
4. Click Generate

### Text Generation
1. Go to Text Generation tab
2. Enter your prompt
3. Select a model
4. Choose preset or custom settings
5. Generate

### AI Chat
1. Go to Chat tab
2. Type your message
3. Upload images (optional)
4. Send and receive AI responses
