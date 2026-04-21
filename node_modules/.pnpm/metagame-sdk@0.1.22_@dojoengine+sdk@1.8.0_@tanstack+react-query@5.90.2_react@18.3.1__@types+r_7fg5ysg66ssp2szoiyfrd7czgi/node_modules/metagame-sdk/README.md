# Metagame SDK

A JavaScript/TypeScript SDK for interacting with Metagame components in Dojo.

## 🚀 Quick Start

### Installation

```shell
bun add metagame-sdk
# or
npm install metagame-sdk
```

### Basic Setup

```tsx
import { initMetagame, MetagameProvider } from 'metagame-sdk';

// Initialize the SDK (no provider required!)
const metagameClient = await initMetagame({
  toriiUrl: 'http://localhost:8080',
  worldAddress: '0x...', // Your world contract address
});

// Wrap your app with the provider
function App() {
  return (
    <MetagameProvider metagameClient={metagameClient}>
      <YourApp />
    </MetagameProvider>
  );
}
```

## 📦 Package Structure

The SDK is organized with **modular imports** for better tree-shaking and separation of concerns:

### 🎯 Core Package (Root Level)
Essential setup functions and types:

```typescript
import { 
  // Setup functions
  initMetagame, 
  MetagameClient, 
  MetagameProvider,
  
  // Essential types
  GameTokenData,
  GameMetadata,
  MetagameConfig,
  
  // Utilities
  feltToString,
  stringToFelt
} from 'metagame-sdk';
```

### 🔄 Subscription Hooks (Real-time Data)
For live data that updates automatically:

```typescript
import { 
  useSubscribeGameTokens, 
  useSubscribeMiniGames, 
  useSubscribeSettings, 
  useSubscribeObjectives 
} from 'metagame-sdk/subscriptions';
```

### 📊 SQL Hooks (Static Queries)
For one-time data fetching:

```typescript
import { 
  useGameTokens,
  useMiniGames,
  useSettings,
  useObjectives 
} from 'metagame-sdk/sql';
```

### 🛠️ Advanced Utilities
For custom data processing:

```typescript
import { 
  mergeGameEntities, 
  parseContextData,
  parseSettingsData,
  MetagameClient 
} from 'metagame-sdk/shared';
```

## 🎮 Usage Examples

### Real-time Game Tokens

```tsx
import { useSubscribeGameTokens } from 'metagame-sdk/subscriptions';

function GameTokensList() {
  const { games, isSubscribing, pagination } = useSubscribeGameTokens({
    owner: '0x123...',
    pagination: {
      pageSize: 10,
      sortBy: 'score',
      sortOrder: 'desc'
    }
  });

  if (isSubscribing) return <div>Loading...</div>;

  return (
    <div>
      {games.map(game => (
        <div key={game.token_id}>
          <h3>Token #{game.token_id}</h3>
          <p>Score: {game.score}</p>
          <p>Player: {game.player_name}</p>
        </div>
      ))}
    </div>
  );
}
```

### Static Data Queries

```tsx
import { useGameTokens } from 'metagame-sdk/sql';

function GameTokensQuery() {
  const { data: games, loading, error } = useGameTokens({
    owner: '0x123...',
    limit: 50
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {games.map(game => (
        <div key={game.token_id}>
          Token #{game.token_id} - Score: {game.score}
        </div>
      ))}
    </div>
  );
}
```

## 🔧 Configuration Options

```typescript
const metagameClient = await initMetagame({
  // Required
  toriiUrl: 'http://localhost:8080',
  
  // For automatic dojoSDK creation
  worldAddress: '0x...', // Your world contract address
  
  // Optional
  relayUrl: 'http://localhost:9090',
  namespace: 'your_namespace_0_0_1',
  domain: {
    name: 'CUSTOM_WORLD',
    version: '1.0',
    chainId: 'KATANA',
    revision: '1'
  },
  
  // Advanced: Provide your own dojoSDK instance
  dojoSDK: yourDojoSDK,
  toriiClient: yourToriiClient
});
```

## ✨ Key Benefits

- **🚫 No Provider Required**: Simplified setup without Starknet provider dependency
- **🌳 Tree Shaking**: Import only what you need with modular structure
- **🔄 Real-time & Static**: Choose between live subscriptions or one-time queries
- **📱 React Ready**: Built-in hooks and provider for React applications
- **🎯 Type Safe**: Full TypeScript support with comprehensive type definitions
- **⚡ Performance**: Optimized data fetching and caching

## 📚 API Reference

### Core Functions

- `initMetagame(config)` - Initialize the SDK
- `getMetagameClient()` - Get the initialized client instance
- `resetMetagame()` - Reset the SDK (useful for testing)

### Hook Categories

- **Subscriptions**: Real-time data with automatic updates
- **SQL**: Static queries for one-time data fetching
- **Shared**: Utilities and advanced data processing

### Types

- `GameTokenData` - Complete game token information
- `GameMetadata` - Mini game metadata
- `GameSettings` - Game configuration settings
- `MetagameConfig` - SDK configuration options

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.
