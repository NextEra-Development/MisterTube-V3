# MisterTube

A lightweight, open-source browser extension that improves your YouTube experience with essential quality-of-life enhancements while respecting your privacy.

![YouTube Enhancer Logo](youtube-enhancer/icons/icon128.png)

> **Note**: This extension is currently in development and may not be fully functional. Please report any issues you encounter.

## Features

- **Cleaner Interface**: Removes ads, promotional content, and other distractions
- **Enhanced Video Grid**: Improves the video browsing experience with a better grid layout
- **Focus Mode**: One-click immersive viewing experience
- **Advanced Playback Controls**: Easily adjust video speed with a convenient dropdown menu
- **Subs Comment**: Subscription and comment enhancements
- **Shortz Block**: Blocks YouTube Shorts and redirects to the homepage
- **Performance Optimized**: Minimal impact on browser performance

## Installation
> **Support MisterTube**: If you'd like to support the development of YouTube Enhancer and help us reach the Chrome Web Store, consider making a donation. Your contribution will bring us closer to making this extension available to a wider audience.

### Manual Installation (Developer Mode)
1. Download or clone this repository to your local machine
2. Open Chrome/Edge/Brave and navigate to `chrome://extensions/`
3. Enable "Developer mode" at the top-right corner
4. Click "Load unpacked" and select the extension directory
5. YouTube Enhancer is now installed!
## Usage

After installation, navigate to YouTube.com to experience the following enhancements:

- **Cleaner Interface**: The extension automatically removes ads and distractions for a more streamlined YouTube experience.
- **Enhanced Video Grid**: A better video grid layout is implemented for easier browsing and discovery of content.
- **Advanced Playback Controls**: Enhanced playback controls are added to the video player, including a convenient dropdown menu for adjusting video speed.
- **Shorts to Long Videos**: The extension automatically redirects YouTube Shorts to their full-length video versions.
- **Focus Mode**: To enter focus mode, click the "Focus" button (represented by an eye icon) in the player controls. This feature dims the page and centers the video for an immersive, distraction-free viewing experience.
- **Speed Control**: To adjust the playback speed, click the speed button (initially set to "1x") in the player controls. This opens a dropdown menu where you can select your preferred playback speed.

## Known Issues

- **TrustedHTML Warnings**: Occasionally, Chrome may log TrustedHTML warnings in the console. These warnings do not affect the functionality of the extension.
- **YouTube Updates**: Due to the frequent updates to YouTube's UI, there may be occasional layout issues. We are working to address these as quickly as possible.
- **Multi Device Support**: Currently, this extension is designed for desktop browsers only. We are exploring options for multi-device support in the future.


## Contributing

Contributions are welcome! If you'd like to help improve YouTube Enhancer:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup

```bash
# Clone the repository
git clone git@github.com:Prarambha369/YouTube_Enhancer.git

# Navigate to the extension directory
cd youtube-enhancer
```

No dependencies to install — load the `youtube-enhancer/` directory unpacked as described above.

## Code Structure

```
youtube-enhancer/
├── manifest.json        # Extension configuration
├── content.js           # Main content script loader
├── popup.html           # Extension popup UI
├── popup.js             # Popup functionality
├── popup_styles.css     # Popup styles
├── features/            # Individual feature modules
│   ├── vidplayer.js     # Enhanced video player
│   ├── vidplayer.css    # Vidplayer styles
│   ├── shorts2long.js   # Shorts to regular video converter
│   ├── shorts2long.css  # Shorts2long styles
│   ├── shortsblock.js   # Shorts blocking functionality
│   ├── shortsblock.css  # Shortsblock styles
│   ├── subs-comment.js  # Subscriptions & comments enhancements
│   └── subs-comment.css # Subs-comment styles
└── icons/               # Extension icons
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    ├── icon128.png
    ├── img.png
    └── trash.png
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Thanks to all contributors who have helped improve this extension
- Inspired by various YouTube enhancement tools in the open-source community

---

**Made with ❤️ by Prarambha**
