# This project is no longer maintained.

> **Notice:** RomM Mobile is no longer actively maintained. The repository is kept available for reference only, and issues or pull requests may not be reviewed or merged.

# RomM Mobile

<div align="center">
  <img src="./assets/images/icon.png" alt="RomM Mobile Logo" width="128" height="128" />
  
  <p><strong>A React Native companion app for RomM - ROM Management made easy</strong></p>
  
  [![Expo](https://img.shields.io/badge/Expo-53.0.19-blue.svg)](https://expo.dev/)
  [![React Native](https://img.shields.io/badge/React%20Native-0.79.5-green.svg)](https://reactnative.dev/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue.svg)](https://www.typescriptlang.org/)
</div>

## 📱 About

RomM Mobile is a mobile companion app for [RomM](https://github.com/rommapp/romm), a beautiful, powerful, self-hosted ROM manager. This app allows you to browse, manage, and organize your retro gaming collection directly from your Android and iOS devices.

> **🧪 iOS Support**: iOS support is currently experimental. While core functionality works, some features may have limitations compared to the Android version.

### ✨ Features

- 🎮 **Browse ROM Collections**: Explore your games organized by platform
- 🔐 **Secure Authentication**: Login with your RomM server credentials
- 📱 **Retrohandled-Optimized Interface**: Beautiful, responsive design built for retrohandleds
- 📁 **File Management**: Download and manage ROM files on your device
- 🍎 **Cross-Platform**: Available for both Android and iOS devices (iOS experimental)

## 📸 Screenshots

<div align="center">
  <table>
    <tr>
      <td align="center">
        <img src="./screenshots/library_screen.png" alt="Library Screen" width="1000"/>
        <br>
        <em>Library & Recently Added</em>
      </td>
      <td align="center">
        <img src="./screenshots/collections_screen.png" alt="Collections Screen" width="1000"/>
        <br>
        <em>Collections View</em>
      </td>
      <td align="center">
        <img src="./screenshots/platform_screen.png" alt="Platform Screen" width="1000"/>
        <br>
        <em>Platform ROMs</em>
      </td>
    </tr>
  </table>
</div>

## 🚀 Getting Started

### Installation

#### Android
1. **Download the APK**: Get the latest release from the [Releases page](https://github.com/mattsays/romm-mobile/releases)
2. **Install the APK**: Enable installation from unknown sources in your Android settings, then install the downloaded APK
3. **Open the App**: Launch RomM Mobile and log in with your RomM server credentials

#### iOS (Experimental)
> **⚠️ Important**: Due to Expo's architecture, iOS builds are currently only available for development testing. Production IPA files are not yet available for sideloading.

**Development Testing (Recommended)**:
1. **Prerequisites**: 
   - macOS computer with Xcode installed
   - iOS device connected via USB or wireless debugging
   - Apple Developer account (free account works)

2. **Setup and Run**:
   ```bash
   git clone https://github.com/mattsays/romm-mobile.git
   cd romm-mobile
   expo run:ios --device
   ```

3. **Device Selection**: Choose your connected iOS device when prompted

4. **Trust Developer**: Go to Settings → General → VPN & Device Management → Trust the developer certificate

5. **Open the App**: Launch RomM Mobile and log in with your RomM server credentials

> **Note**: The app will run in development mode and requires the Expo development server to remain active. Production iOS builds via sideloading (Sideloadly, AltStore) will be available in future releases.

## 📁 How To - Folder Management

RomM Mobile uses a sophisticated folder management system that allows you to organize your ROM files efficiently. Here's how it works:

### Overview

The app manages folders in two main ways:
- **Platform-specific folders**: Each gaming platform (NES, SNES, PlayStation, etc.) can have its own dedicated folder
- **Automatic folder selection**: When you download your first ROM for a platform, the app will prompt you to select a folder

### How Folder Management Works

#### 1. **First-time Setup**
When you download your first ROM for any platform:
1. The app checks if a folder is already configured for that platform
2. If no folder exists, it automatically prompts you to select one
3. You'll see a dialog asking you to choose a folder for that specific platform
4. Once selected, all future ROMs for that platform will be saved in the same folder

#### 2. **Folder Configuration**
- **Automatic**: Prompted when downloading first ROM of a platform
- **Manual**: Configure folders in Settings → Platform Folders
- **Per-platform**: Each platform can have its own unique folder
- **Flexible**: You can change folder locations anytime

#### 3. **Storage Access Framework (SAF)**
The app uses Android's Storage Access Framework which:
- ✅ Works with any storage location (internal, SD card, cloud storage)
- ✅ Maintains permissions across app updates
- ✅ Provides secure access to your files
- ✅ No need for broad storage permissions

### Managing Folders

#### In Settings
Navigate to **Settings → Platform Folders** to:
- View all configured platform folders
- Change folder location for any platform
- Remove folder configuration for a platform
- Remove all platform folder configurations

#### During Download
When downloading a ROM:
1. App checks if platform folder exists
2. If exists: ROM downloads directly to that folder
3. If missing: Shows folder selection dialog
4. Selected folder is saved for future downloads of that platform

#### Folder Selection Dialog
The folder selection dialog shows:
- **Current folder** (if one is already configured)
- **Platform name** you're configuring
- Options to **Change** or **Cancel**

### Key Features

#### Smart File Detection
- Automatically detects if a ROM is already downloaded
- Prevents duplicate downloads


## 🔧 Development


### Prerequisites

- [Node.js](https://nodejs.org/) (version 18 or higher)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- Android Studio (for Android development)
- Xcode (for iOS development - macOS only)
- A running [RomM server](https://github.com/rommapp/romm)

### Installation



1. **Clone the repository**
   ```bash
   git clone https://github.com/mattsays/romm-mobile.git
   cd romm-mobile
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm start
   ```

4. **Run on Android**
   ```bash
   npm run android
   ```

5. **Run on iOS** (macOS only)
   ```bash
   npm run ios
   ```

### Project Structure

```
romm-mobile/
├── app/                    # Expo Router pages
│   ├── auth/              # Authentication screens
│   ├── game/              # Game detail screens
│   └── platform/          # Platform browsing screens
├── components/            # Reusable React components
├── contexts/              # React contexts (AuthContext)
├── hooks/                 # Custom React hooks
├── locales/               # Internationalization files
├── services/              # API services and utilities
└── assets/                # Images, fonts, and static assets
```

### Available Scripts

- `npm start` - Start the Expo development server
- `npm run android` - Run on Android device/emulator
- `npm run ios` - Run on iOS device/simulator (macOS only)

### Technology Stack

- **Framework**: [Expo](https://expo.dev/) with Expo Router
- **Language**: TypeScript
- **UI**: React Native with custom components
- **Navigation**: Expo Router (file-based routing)
- **State Management**: React Context + Custom Hooks
- **Storage**: Expo SecureStore for sensitive data
- **HTTP Client**: Fetch API with custom wrapper
- **Internationalization**: Custom i18n implementation

## 📋 Requirements

### Device Compatibility

#### Android
- Android 7.0 (API level 24) or higher
- ARM64 or x86_64 architecture

#### iOS (Experimental)
- iOS 13.0 or higher
- iPhone 6s or newer, iPad Air 2 or newer
- Sideloading capability (Sideloadly, AltStore, or Developer Account)

### Permissions

#### Android Permissions
The app requires the following permissions:
- `READ_EXTERNAL_STORAGE` - Access ROM files
- `WRITE_EXTERNAL_STORAGE` - Download and save ROMs
- `INTERNET` - Connect to RomM server

#### iOS Permissions
- Storage access for downloading ROMs
- Network access for RomM server connection

### RomM Server Compatibility

This app is compatible with RomM API version 3.10.2 and above.

## 🔒 Security

- All authentication tokens are stored securely using Expo SecureStore
- HTTPS connection to RomM server is recommended for production use
- No sensitive data is logged or cached in plain text

## 🤝 Contributing

We welcome contributions! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Guidelines

1. Follow the existing code style and TypeScript patterns
2. Add appropriate types for all new code
3. Test your changes on both Android and iOS devices/emulators
4. Update documentation as needed
5. Note any platform-specific limitations or differences

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Related Projects

- [RomM](https://github.com/rommapp/romm) - The main RomM server application
- [RomM Documentation](https://github.com/rommapp/romm/wiki) - Official documentation

## 📞 Support

- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/mattsays/romm-mobile/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/mattsays/romm-mobile/discussions)
- 📖 **Documentation**: [Wiki](https://github.com/mattsays/romm-mobile/wiki)

## 🙏 Acknowledgments

- [RomM Team](https://github.com/rommapp/romm) for creating the amazing ROM management platform
- [Expo Team](https://expo.dev/) for the excellent React Native development experience
- The retro gaming community for inspiration and feedback

---

<div align="center">
  <p>Made with ❤️ for the retro gaming community</p>
</div>
