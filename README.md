# PDF Master Studio

A modern PDF editor built with Angular that enables users to edit PDF documents while preserving the original layout. PDF Master Studio combines advanced text recognition, font matching, image editing, page management, document conversion, and **AI-powered PDF summarization** in a single desktop and web application.

📥 **Download**

Get the latest release of PDF Master Studio for your operating system.

| Platform | Download |
|---|---|
| 🪟 Windows (64-bit) | Download PDF Master Studio for Windows (.exe) |
| 🐧 Ubuntu / Debian (64-bit) | Download PDF Master Studio for Linux (.deb) |

**Latest Releases:** https://github.com/praveenpl03/pdf-master-studio/releases

**Ubuntu / Snap Store:** https://snapcraft.io/pdf-master-studio

<a href="https://snapcraft.io/pdf-master-studio">
  <img alt="Get it from the Snap Store" width="200" height="100" src="https://snapcraft.io/en/dark/install.svg"/>
</a>

**Use Online:** https://theconvertor--converter-97c1d.asia-southeast1.hosted.app/

## System Requirements

### Windows
- Windows 10 or later (64-bit)

### Ubuntu / Debian
- Ubuntu 22.04+ / Debian 12+

## Installation

### Windows
1. Download the Windows (.exe) installer.
2. Run the installer.
3. Follow the setup wizard.
4. Launch PDF Master Studio from the Start Menu.

### Ubuntu / Debian

Using the terminal:

```bash
sudo dpkg -i PDFMasterStudio-linux-amd64.deb
sudo apt --fix-broken install
```

Alternatively, double-click the `.deb` package and install it using your software manager.

## ✨ Features

### 📄 PDF Editing
- Edit text directly inside PDFs
- Preserve original fonts, colors, alignment, and formatting
- Rich text formatting: bold, italic, and underline
- Background-aware text replacement
- Smart text resizing
- Drag and reposition text
- Add, remove, and format text

### 🤖 AI PDF Summarizer
- Generate AI-powered summaries of PDF documents
- Quickly understand lengthy reports, articles, research papers, and other documents
- Extract key points and important information
- Reduce the time needed to review lengthy PDFs
- Run AI summarization locally using the integrated Qwen3 model
- Keep document processing within the local AI workflow rather than relying on a remote AI summarization service
- Automatically download and configure the local AI model on first launch of the Windows and Linux desktop applications

**Private, local AI workflow:** The desktop application downloads the Qwen3 model and runs its local AI server on your computer. An internet connection is required for the initial model download. The model is verified using a pinned SHA-256 digest before use.

### 🖼 Image Editing
- Replace images
- Delete images
- Resize and reposition images
- Crop and rotate images

### 📑 Page Management
- Merge PDFs
- Split PDFs
- Extract pages
- Delete pages
- Rotate pages
- Reorder pages using drag and drop
- Duplicate pages
- Insert blank pages

### 🔄 PDF Conversion
- PDF → Word
- PDF → HTML
- PDF → Image
- Image → PDF
- Word → PDF
- PowerPoint → PDF
- Excel → PDF

### 🎨 User Experience
- Responsive interface
- Dark mode
- Mobile support
- Thumbnail navigation
- Zoom controls
- Keyboard shortcuts
- Undo / Redo

---

## Technology Stack

- Angular 21
- TypeScript
- PDF.js
- MuPDF
- HTML5 Canvas
- Bootstrap 5
- Tailwind CSS
- RxJS
- Electron for desktop applications
- Local Qwen3 model for AI-powered document summarization

---

## Installation for Developers

### Clone the repository

```bash
git clone https://github.com/praveenpl03/pdf-master-studio.git
```

### Navigate to the project

```bash
cd pdf-master-studio
```

### Install dependencies

```bash
npm install
```

## Development Server

Start the Angular development server:

```bash
ng serve
```

Open http://localhost:4200 in your browser.

The application automatically reloads when source files change.

## Build

Development build:

```bash
ng build
```

Production build:

```bash
ng build --configuration production
```

The compiled application is generated inside the `dist/` directory.

## Running Tests

Unit tests:

```bash
ng test
```

End-to-end tests:

```bash
ng e2e
```

*Note: The available test commands depend on the testing tools configured in the project.*

## Project Structure

```text
src/
├── app/
│   ├── components/
│   ├── pages/
│   ├── services/
│   ├── models/
│   ├── shared/
│   └── layout/
├── assets/
├── environments/
└── styles/
```

## Supported Operations

- Edit PDF text
- Replace fonts
- Change text colors
- Add and remove text
- Insert and delete images
- Watermark PDFs
- Compress PDFs
- Merge documents
- Split documents
- Rotate pages
- Export to PDF
- Export to HTML
- Convert documents between supported formats
- Summarize PDF documents using local AI

## Browser Support

- Chrome
- Microsoft Edge
- Firefox
- Brave

## Desktop Support

- Windows
- Linux
- macOS (Electron)

*Local AI model setup is currently documented for the Windows and Linux desktop applications.*

## Local AI Model Setup

PDF Master Studio integrates a local Qwen3 model to power its AI summarization feature on supported desktop platforms.

On the first launch of the Windows or Linux desktop application:

1. The application downloads the Qwen3 model automatically.
2. The download is approximately **1.07 GB**.
3. The model is stored in the application's data folder.
4. The application verifies the downloaded model using a pinned SHA-256 digest.
5. The local AI server starts after successful verification.

The application displays download and startup progress on the home screen and provides a retry option if setup fails.

### Important Details
- An internet connection is required for the initial model download.
- The model is downloaded separately and is not bundled into the installer.
- No separate model installation or administrator permission is required.
- Summarization runs through the local AI server on supported desktop platforms.

## Performance

- Fast PDF rendering
- Incremental page loading
- Lazy thumbnail generation
- Optimized memory usage
- GPU-accelerated canvas rendering

## Future Roadmap

- OCR support
- Digital signatures
- AI document translation
- Collaborative editing
- Cloud storage integration
- Version history
- Batch processing
- Form designer
- PDF annotation tools
- Further AI-powered document workflows

## Contributing

Contributions are welcome!

1. Fork the repository.
2. Create a feature branch:

```bash
git checkout -b feature/my-feature
```

3. Commit your changes:

```bash
git commit -m "Add new feature"
```

4. Push your branch:

```bash
git push origin feature/my-feature
```

5. Open a Pull Request.

## License

This project is licensed under the MIT License.

## Author

**PDF Master Studio**

*Professional PDF Editing Platform*

Built with ❤️ using Angular, TypeScript, PDF.js, MuPDF, Electron, and local AI.
